import { makePdf, xmpFor } from './pdf-fixtures.mjs';

const xmp = xmpFor();
const typeDeclaration = `<pdfaSchema:valueType><rdf:Seq><rdf:li rdf:parseType="Resource"
  xmlns:pdfaType="http://www.aiim.org/pdfa/ns/type#"
  xmlns:pdfaField="http://www.aiim.org/pdfa/ns/field#">
  <pdfaType:type>InvoiceDetail</pdfaType:type>
  <pdfaType:namespaceURI>urn:example:invoice-detail#</pdfaType:namespaceURI>
  <pdfaType:prefix>detail</pdfaType:prefix>
  <pdfaType:description>Invoice detail</pdfaType:description>
  <pdfaType:field><rdf:Seq><rdf:li rdf:parseType="Resource">
    <pdfaField:name>Count</pdfaField:name>
    <pdfaField:valueType>Integer</pdfaField:valueType>
    <pdfaField:description>Item count</pdfaField:description>
  </rdf:li></rdf:Seq></pdfaType:field>
</rdf:li></rdf:Seq></pdfaSchema:valueType>`;
const xmpWithType = xmp.replace('</pdfaSchema:property>', '</pdfaSchema:property>' + typeDeclaration);
const xmpWithTypedProperty = xmpWithType.replace('</rdf:Seq></pdfaSchema:property>', `<rdf:li rdf:parseType="Resource">
    <pdfaProperty:name>Detail</pdfaProperty:name>
    <pdfaProperty:valueType>InvoiceDetail</pdfaProperty:valueType>
    <pdfaProperty:category>external</pdfaProperty:category>
    <pdfaProperty:description>Structured invoice detail</pdfaProperty:description>
  </rdf:li></rdf:Seq></pdfaSchema:property>`).replace('/></rdf:RDF>', ` xmlns:detail="urn:example:invoice-detail#">
    <fx:Detail rdf:parseType="Resource"><detail:Count>2</detail:Count></fx:Detail>
  </rdf:Description></rdf:RDF>`);

export function makePdfaEmbeddingCases(xml) {
    const cases = [
        ['document-associated files and declared Factur-X properties', { extraMime: 'text#2fplain' },
            { '6.8-1': 'pass', '6.8-2': 'pass', '6.8-3': 'pass', '6.8-4': 'pass', '6.6.2.3.1-1': 'pass', '6.6.2.3.3-1': 'pass' }],
        ['MIME is checked for a second attachment as well as the invoice', { extraMime: 'unknown' }, { '6.8-1': 'fail' }],
        ['absent MIME', { mime: null }, { '6.8-1': 'fail' }],
        ['missing Unicode filename', { missingUF: true }, { '6.8-2': 'fail' }],
        ['missing relationship', { relationship: null }, { '6.8-3': 'fail' }],
        ['embedded-files name tree alone does not associate a file', { missingAF: true }, { '6.8-4': 'fail' }],
        ['association on the page is sufficient for PDF/A', { missingAF: true, pageAF: true }, { '6.8-4': 'pass' }],
        ['possible association in inline content stays open', { missingAF: true, contentAF: true }, { '6.8-4': 'unknown' }],
        ['Factur-X properties require extension declarations', { xmp: xmpFor('EN 16931', { extension: false }) },
            { '6.6.2.3.1-1': 'fail' }],
        ['used properties are identified by URI, independent of prefix', {
            xmp: xmp.replaceAll('fx:', 'invoice:').replace('xmlns:fx=', 'xmlns:invoice=')
                .replace('<x:xmpmeta ', '<x:xmpmeta xmlns:unused="urn:example:unused:" '),
        }, { '6.6.2.3.1-1': 'pass', '6.6.2.3.3-1': 'pass' }],
        ['extension schemas use an RDF Bag', { xmp: xmp.replaceAll('rdf:Bag', 'rdf:Seq') }, { '6.6.2.3.3-1': 'fail' }],
        ['extension container requires the PDF/A extension prefix', {
            xmp: xmp.replaceAll('pdfaExtension:schemas', 'other:schemas').replace('xmlns:pdfaExtension=', 'xmlns:other='),
        }, { '6.6.2.3.3-1': 'fail' }],
        ['extension fields are recognized by namespace rather than spelling alone', {
            xmp: xmp.replace('http://www.aiim.org/pdfa/ns/schema#', 'urn:example:not-pdfa-schema#'),
        }, { '6.6.2.3.3-3': 'fail' }],
        ['extension schema title is required', {
            xmp: xmp.replace('<pdfaSchema:schema>Factur-X PDF/A Extension Schema</pdfaSchema:schema>', ''),
        }, { '6.6.2.3.3-2': 'fail' }],
        ['extension property category must be external or internal', {
            xmp: xmp.replace('<pdfaProperty:category>external</pdfaProperty:category>', '<pdfaProperty:category>public</pdfaProperty:category>'),
        }, { '6.6.2.3.3-9': 'fail' }],
        ['unknown fields are rejected in extension definitions', {
            xmp: xmp.replace('<pdfaSchema:prefix>fx</pdfaSchema:prefix>', '<pdfaSchema:prefix>fx</pdfaSchema:prefix><pdfaSchema:typo>value</pdfaSchema:typo>'),
        }, { '6.6.2.3.2-1': 'fail' }],
        ['an undeclared property in a known extension still fails', {
            xmp: xmp.replace('fx:Version="1.0"', 'fx:Version="1.0" fx:Extra="value"'),
        }, { '6.6.2.3.1-1': 'fail' }],
        ['an extension property may only declare a defined type', {
            xmp: xmp.replace('<pdfaProperty:valueType>Text</pdfaProperty:valueType>', '<pdfaProperty:valueType>NotDefined</pdfaProperty:valueType>'),
        }, { '6.6.2.3.3-8': 'fail' }],
        ['actual values must match the declared scalar type', {
            xmp: xmp.replace('<pdfaProperty:name>Version</pdfaProperty:name>\n        <pdfaProperty:valueType>Text',
                '<pdfaProperty:name>Version</pdfaProperty:name>\n        <pdfaProperty:valueType>Integer'),
        }, { '6.6.2.3.1-2': 'fail' }],
        ['custom type and field declarations', { xmp: xmpWithType },
            { '6.6.2.3.3-11': 'pass', '6.6.2.3.3-16': 'pass', '6.6.2.3.3-17': 'pass' }],
        ['custom field type must be defined', {
            xmp: xmpWithType.replace('<pdfaField:valueType>Integer</pdfaField:valueType>', '<pdfaField:valueType>NotDefined</pdfaField:valueType>'),
        }, { '6.6.2.3.3-17': 'fail' }],
        ['custom typed value uses a declared integer field', { xmp: xmpWithTypedProperty }, { '6.6.2.3.1-2': 'pass' }],
        ['custom typed value cannot put text in the integer field', {
            xmp: xmpWithTypedProperty.replace('<detail:Count>2</detail:Count>', '<detail:Count>two</detail:Count>'),
        }, { '6.6.2.3.1-2': 'fail' }],
        ['DTD blocks XMP inspection', { xmp: '<!DOCTYPE x [<!ENTITY data "value">]><x>&data;</x>' },
            { '6.6.2.3.1-1': 'unknown', '6.6.2.3.3-1': 'unknown' }],
    ];
    return cases.map(([name, options, expect]) => ({ name, bytes: makePdf(xml, options), expect }));
}
