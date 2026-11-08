import { deflateSync } from 'node:zlib';
const facturX = 'urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#';
const facturXExtension = `<rdf:Description rdf:about=""
    xmlns:pdfaExtension="http://www.aiim.org/pdfa/ns/extension/"
    xmlns:pdfaSchema="http://www.aiim.org/pdfa/ns/schema#"
    xmlns:pdfaProperty="http://www.aiim.org/pdfa/ns/property#">
  <pdfaExtension:schemas><rdf:Bag><rdf:li rdf:parseType="Resource">
    <pdfaSchema:schema>Factur-X PDF/A Extension Schema</pdfaSchema:schema>
    <pdfaSchema:namespaceURI>${facturX}</pdfaSchema:namespaceURI>
    <pdfaSchema:prefix>fx</pdfaSchema:prefix>
    <pdfaSchema:property><rdf:Seq>
      ${['DocumentType', 'DocumentFileName', 'Version', 'ConformanceLevel'].map(name => `<rdf:li rdf:parseType="Resource">
        <pdfaProperty:name>${name}</pdfaProperty:name>
        <pdfaProperty:valueType>Text</pdfaProperty:valueType>
        <pdfaProperty:category>external</pdfaProperty:category>
        <pdfaProperty:description>${name}</pdfaProperty:description>
      </rdf:li>`).join('')}
    </rdf:Seq></pdfaSchema:property>
  </rdf:li></rdf:Bag></pdfaExtension:schemas>
</rdf:Description>`;
export const xmpFor = (profile = 'EN 16931', { extension = true } = {}) => `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">${extension ? facturXExtension : ''}<rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/" pdfaid:part="3" pdfaid:conformance="B" xmlns:fx="${facturX}" fx:DocumentType="INVOICE" fx:DocumentFileName="factur-x.xml" fx:Version="1.0" fx:ConformanceLevel="${profile}"/></rdf:RDF></x:xmpmeta>`;
// Synthetic containers with real invoice XML. They are NOT full PDF/A fixtures.
export function makePdf(xml, options = {}) {
    const fileId = '/ID [<00112233445566778899aabbccddeeff> <00112233445566778899aabbccddeeff>]';
    const stream = (data, dict) => {
        data = Buffer.from(data, 'utf8');
        if (options.compressed) { data = deflateSync(data); dict += ' /Filter /FlateDecode'; }
        return `<< ${dict} /Length ${data.length} >>\nstream\n${data.toString('latin1')}\nendstream`;
    };
    const spec = `<< /Type /Filespec /F (factur-x.xml) ${options.missingUF ? '' : '/UF (factur-x.xml)'} ${options.relationship === null ? '' : '/AFRelationship /' + (options.relationship || 'Alternative')} /EF << /F 5 0 R /UF ${options.conflicting ? 9 : 5} 0 R >> >>`;
    const catalog = `<< /Type /Catalog /Pages 2 0 R ${options.afOnly ? '' : '/Names << /EmbeddedFiles 7 0 R >>'} ${options.missingAF ? '' : '/AF [4 0 R' + (options.extraMime ? ' 8 0 R' : '') + ']'} ${options.missingXMP ? '' : '/Metadata 6 0 R'} >>`;
    const objects = new Map([
        [1, options.incremental ? '<< /Type /Catalog /Pages 2 0 R >>' : catalog],
        [2, '<< /Type /Pages /Count 1 /Kids [3 0 R] >>'],
        [3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Resources << >> ${options.pageAF ? '/AF [4 0 R]' : ''} ${options.contentAF ? '/Contents 8 0 R' : ''} >>`],
        [4, spec], [5, stream(xml, `/Type /EmbeddedFile ${options.mime === null ? '' : '/Subtype /' + (options.mime || 'application#2fxml')}`)],
        [6, stream(options.xmp ?? xmpFor(), '/Type /Metadata /Subtype /XML')],
        [7, `<< /Names [(factur-x.xml) 4 0 R ${options.duplicate ? '(factur-x.xml) 8 0 R' : ''} ${options.extraMime ? '(readme.txt) 8 0 R' : ''}] >>`]
    ]);
    if (options.extraMime) {
        objects.set(8, '<< /Type /Filespec /F (readme.txt) /UF (readme.txt) /AFRelationship /Supplement /EF << /F 9 0 R >> >>');
        objects.set(9, stream('Supplement', '/Type /EmbeddedFile /Subtype /' + options.extraMime));
    }
    if (options.contentAF) objects.set(8, stream('/Span << /AF [4 0 R] >> BDC EMC', ''));
    if (options.duplicate) objects.set(8, spec);
    if (options.conflicting) objects.set(9, stream(xml.replace('CrossIndustryInvoice', 'Other'), '/Type /EmbeddedFile /Subtype /application#2fxml'));
    if (options.objectStream) { objects.delete(4); objects.set(10, stream(`4 0 ${spec}`, '/Type /ObjStm /N 1 /First 4')); }
    let pdf = '%PDF-1.7\n%\xe2\xe3\xcf\xd3\n';
    const offsets = new Map();
    const append = (n, body) => { offsets.set(n, pdf.length); pdf += `${n} 0 obj\n${body}\nendobj\n`; };
    for (const [n, body] of objects) append(n, body);
    let xref = pdf.length;
    if (options.objectStream) {
        const data = Buffer.alloc(12 * 7);
        for (let i = 0; i < 12; i++) {
            data[i * 7] = i === 4 ? 2 : (offsets.has(i) || i === 11 ? 1 : 0);
            data.writeUInt32BE(i === 4 ? 10 : i === 11 ? xref : offsets.get(i) || 0, i * 7 + 1);
            data.writeUInt16BE(i === 0 ? 65535 : 0, i * 7 + 5);
        }
        // Xref streams contain binary bytes, not UTF-8 text.
        const compressed = deflateSync(data);
        append(11, `<< /Type /XRef /Size 12 /Root 1 0 R ${fileId} /W [1 4 2] /Filter /FlateDecode /Length ${compressed.length} >>\nstream\n${compressed.toString('latin1')}\nendstream`);
    } else {
        const size = Math.max(...objects.keys()) + 1;
        pdf += `xref\n0 ${size}\n0000000000 65535 f \n`;
        for (let i = 1; i < size; i++) pdf += `${String(offsets.get(i) || 0).padStart(10, '0')} 00000 ${offsets.has(i) ? 'n' : 'f'} \n`;
        pdf += `trailer\n<< /Size ${size} /Root 1 0 R ${fileId} >>\n`;
    }
    pdf += `startxref\n${options.recovery ? 1 : xref}\n%%EOF\n`;
    if (options.incremental) {
        append(1, catalog);
        const previous = xref; xref = pdf.length;
        pdf += `xref\n1 1\n${String(offsets.get(1)).padStart(10, '0')} 00000 n \ntrailer\n<< /Size ${Math.max(...objects.keys()) + 1} /Root 1 0 R ${fileId} /Prev ${previous} >>\nstartxref\n${xref}\n%%EOF\n`;
    }
    return Uint8Array.from(Buffer.from(pdf, 'latin1'));
}
