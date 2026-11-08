import { assessPdfAFile, loadPdfRuntime, sha256 } from './pdfa-validation.mjs';

export { loadPdfRuntime, sha256 };

// The PDF.js fork collects evidence for the invoice and PDF/A basis checks.
const named = (field, value) => field?.type === 'name' && field.value === value;
const string = field => field?.type === 'string' ? field.value : '';
const CII = 'urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100';
const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const PDFA = 'http://www.aiim.org/pdfa/ns/id/';
const FX = 'urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#';
const ZF = 'urn:zugferd:pdfa:CrossIndustryDocument:invoice:2p0#';
const check = (id, status, title, detail) => ({ id, status, title, detail });
function values(doc, ns, name) {
    const found = [];
    for (const description of doc.getElementsByTagNameNS(RDF, 'Description')) {
        const rdf = description.parentElement;
        if (rdf?.namespaceURI !== RDF || rdf.localName !== 'RDF') continue;
        if (rdf !== doc.documentElement && !(rdf.parentElement === doc.documentElement && doc.documentElement.namespaceURI === 'adobe:ns:meta/')) continue;
        if (description.getAttributeNS(RDF, 'about')) continue; // Only document metadata.
        if (description.hasAttributeNS(ns, name)) found.push(description.getAttributeNS(ns, name).trim());
        for (const child of description.children) {
            if (child.namespaceURI === ns && child.localName === name) found.push(child.textContent.trim());
        }
    }
    return found;
}

export async function extractInvoice(bytes, { parseXml, decodeXml, profileOf, pdfjs } = {}) {
    if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.length > 20 * 1024 * 1024) throw new Error('PDF muss zwischen 1 Byte und 20 MB groß sein.');
    if (!parseXml || !decodeXml || !profileOf) throw new Error('XML-Parseradapter für die PDF-Prüfung fehlt.');
    pdfjs ||= await loadPdfRuntime();
    const sourceSha256 = await sha256(bytes);
    const task = pdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false });
    let evidence, fileInspection;
    try {
        const document = await task.promise;
        evidence = await document.getEmbeddedFileInspection();
        try {
            fileInspection = await document.getPdfAFileInspection?.();
        } catch {
            // Missing file evidence leaves the affected PDF/A rules open.
        }
    } finally { await task.destroy(); }
    if (evidence.version !== 1) throw new Error('Nicht unterstützte PDF-Prüfschnittstelle.');
    const candidates = [];
    for (const file of evidence.files) {
        const filename = string(file.unicodeFilename) || string(file.filename);
        const recognizedName = /^(factur-x|zugferd-invoice|xrechnung)\.xml$/i.test(filename);
        const readable = file.embeddedFiles.filter(e => e.stream?.bytes);
        if (!readable.length) continue;
        const hashes = await Promise.all(readable.map(e => sha256(e.stream.bytes)));
        const content = (() => { try { return decodeXml(readable[0].stream.bytes); } catch (error) { if (recognizedName) throw error; return ''; } })();
        let doc;
        try { doc = parseXml(content); } catch (error) { if (recognizedName) throw error; continue; }
        if (!recognizedName && !(doc.documentElement.localName === 'CrossIndustryInvoice' && doc.documentElement.namespaceURI === CII)) continue;
        if (new Set(hashes).size !== 1) throw new Error('Widersprüchliche XML-Streams hinter den Dateiverweisen F/UF: keine eindeutige Rechnungsquelle.');
        // Do not silently choose a readable alternate when one mapping is broken.
        if (readable.length !== file.embeddedFiles.length) throw new Error('Ein XML-Dateiverweis ist nicht lesbar. Die Rechnungsquelle ist nicht eindeutig prüfbar.');
        candidates.push({ filename, bytes: readable[0].stream.bytes, content, file, doc, xmlSha256: hashes[0] });
    }
    if (!candidates.length) throw new Error('Kein lesbarer Rechnungs-XML-Anhang gefunden. Die PDF-Einbettung konnte nicht geprüft werden.');
    if (candidates.length !== 1) throw new Error('Mehrere mögliche Rechnungs-XML-Anhänge gefunden. Keine eindeutige Datenquelle; Prüfung abgebrochen.');
    const selected = candidates[0];
    const { file, filename, doc } = selected;
    const report = { engine: `Streetblock PDF.js ${pdfjs.version} (${pdfjs.build})`, sourceSha256, xmlSha256: selected.xmlSha256,
        checkedAt: new Date().toISOString(), scope: 'Basisprüfungen für PDF-Einbettung, XMP und PDF/A-Datei- und Objektregeln', status: 'partial',
        parser: evidence.parser, limits: evidence.limits, checks: [], issues: [], metadata: {}, files: [],
        limitations: ['Keine vollständige PDF/A-3-Prüfung.', 'Keine vollständigen versionsabhängigen Einbettungsregeln.',
            'Parser-Reparaturen werden noch nicht vollständig erfasst.', 'Keine Prüfung der XMP-Erweiterungsschemata oder der PDF-Bild/XML-Übereinstimmung.'] };
    const add = (stage, rule, message, severity = 'error', location = '') => report.issues.push({ stage, rule, message, severity, location });
    for (const issue of evidence.issues) {
        const incomplete = ['byte-limit', 'tree-limit', 'entry-limit', 'unreadable-object', 'encrypted-stream-unavailable'].includes(issue.code);
        add('embedding', `PDF-${issue.code}`, 'PDF-Struktur konnte nicht vollständig gelesen werden: ' + issue.code, incomplete ? 'warning' : 'error', issue.path);
    }
    if (evidence.parser?.recoveryMode || evidence.parser?.xrefSectionsComplete !== true) add('embedding', 'PDF-RECOVERY', 'PDF.js musste die Querverweise reparieren oder konnte sie nicht vollständig lesen. Prüfung bleibt offen.', 'warning');
    if (!named(file.type, 'Filespec')) add('embedding', 'PDF-FILESPEC', 'Die Dateispezifikation hat keinen korrekten Type /Filespec.');
    if (!string(file.filename) || !string(file.unicodeFilename) || string(file.filename) !== string(file.unicodeFilename)) add('embedding', 'PDF-FILENAME', 'F und UF müssen die gleiche, lesbare XML-Datei bezeichnen.');
    if (!evidence.associatedFiles?.some(a => a.fileId === file.id)) add('embedding', 'PDF-AF', 'Das Rechnungs-XML ist nicht dem Dokument über den Katalog-AF zugeordnet.');
    const names = evidence.nameTreeEntries.filter(e => e.fileId === file.id);
    if (!names.length) add('embedding', 'PDF-NAME-TREE', 'Der Rechnungsanhang fehlt im EmbeddedFiles-Namensbaum; weitere Formatprüfung erforderlich.', 'warning');
    if (new Set(evidence.nameTreeEntries.map(e => e.key?.value)).size !== evidence.nameTreeEntries.length) add('embedding', 'PDF-DUPLICATE-NAME', 'Der Namensbaum enthält doppelte Dateischlüssel.');
    if (file.relationship?.type !== 'name' || !['Alternative', 'Source', 'Data', 'Supplement', 'Unspecified'].includes(file.relationship.value)) add('embedding', 'PDF-RELATIONSHIP', 'AFRelationship fehlt oder ist kein gültiger PDF-Beziehungstyp.');
    else if (file.relationship.value !== 'Alternative') add('embedding', 'PDF-RELATIONSHIP-CONTEXT', `${file.relationship.value}: die Zulässigkeit hängt von Formatversion, Profil und Erzeugungsweg ab und bleibt offen.`, 'warning');
    for (const entry of file.embeddedFiles) {
        if (!named(entry.stream?.type, 'EmbeddedFile')) add('embedding', 'PDF-STREAM-TYPE', `EF/${entry.key} ist kein korrekt gekennzeichneter EmbeddedFile-Stream.`);
        if (entry.stream?.subtype?.type !== 'name' || !['text/xml', 'application/xml'].includes(entry.stream.subtype.value)) add('embedding', 'PDF-MIME', `EF/${entry.key}: XML-MIME-Type fehlt oder ist falsch.`);
    }
    for (const item of evidence.files) {
        const streams = [];
        for (const entry of item.embeddedFiles) streams.push({ key: entry.key, ref: entry.stream?.ref,
            type: entry.stream?.type, subtype: entry.stream?.subtype, byteLength: entry.stream?.bytes?.length ?? null,
            sha256: entry.stream?.bytes ? await sha256(entry.stream.bytes) : null });
        report.files.push({ ...item, embeddedFiles: streams });
    }
    report.nameTreeEntries = evidence.nameTreeEntries;
    report.associatedFiles = evidence.associatedFiles;
    const meta = evidence.metadata;
    const profileId = [...doc.getElementsByTagNameNS(CII, 'ExchangedDocumentContext')][0]
        ?.getElementsByTagNameNS('urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100', 'GuidelineSpecifiedDocumentContextParameter')[0]
        ?.getElementsByTagNameNS('urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100', 'ID')[0]?.textContent.trim() || '';
    report.profile = profileOf(profileId);
    if (!meta?.bytes) add('metadata', 'XMP-MISSING', 'Keine lesbaren XMP-Metadaten vorhanden.', evidence.issues.some(i => i.path.startsWith('/Metadata')) ? 'warning' : 'error');
    else {
        report.metadata.sourceSha256 = await sha256(meta.bytes);
        report.metadata.byteLength = meta.bytes.length;
        if (!named(meta.type, 'Metadata') || !named(meta.subtype, 'XML')) add('metadata', 'XMP-TYPE', 'Der Metadatenstream ist nicht korrekt als Metadata/XML gekennzeichnet.');
        try {
            const xmp = parseXml(decodeXml(meta.bytes));
            const one = (ns, key) => {
                const found = values(xmp, ns, key);
                if (found.length !== 1 || !found[0]) { add('metadata', 'XMP-FIELD', `${key}: Angabe fehlt, ist leer oder mehrfach vorhanden.`); return ''; }
                return found[0];
            };
            report.metadata.part = one(PDFA, 'part');
            report.metadata.conformance = one(PDFA, 'conformance');
            if (report.metadata.part !== '3' || !['A', 'B', 'U'].includes(report.metadata.conformance)) add('metadata', 'XMP-PDFA-ID', 'Die XMP-Kennung bezeichnet kein PDF/A-3a, PDF/A-3b oder PDF/A-3u.');
            const namespaces = [FX, ZF].filter(ns => ['DocumentType', 'DocumentFileName', 'Version', 'ConformanceLevel'].some(key => values(xmp, ns, key).length));
            if (namespaces.length !== 1) add('metadata', 'XMP-FORMAT', 'Keine eindeutigen unterstützten Factur-X-/ZUGFeRD-2-Metadaten erkannt.', 'warning');
            else {
                const ns = namespaces[0];
                report.metadata.namespace = ns;
                for (const key of ['DocumentType', 'DocumentFileName', 'Version', 'ConformanceLevel']) report.metadata[key] = one(ns, key);
                if (report.metadata.DocumentType !== 'INVOICE') add('metadata', 'XMP-DOCUMENT-TYPE', 'Die XMP-Metadaten bezeichnen keine Rechnung (INVOICE).');
                if (report.metadata.DocumentFileName !== filename) add('metadata', 'XMP-FILENAME', 'Der XMP-Dateiname stimmt nicht mit dem ausgewählten XML-Anhang überein.');
                const expected = { 'MINIMUM': 'MINIMUM', 'BASIC-WL': 'BASIC WL', 'BASIC': 'BASIC', 'EN 16931': 'EN 16931', 'EXTENDED': 'EXTENDED' }[report.profile];
                if (!expected) add('metadata', 'XMP-PROFILE-UNSUPPORTED', 'Der XMP-Profilabgleich wird für dieses XML-Profil noch nicht unterstützt.', 'warning');
                else if (report.metadata.ConformanceLevel !== expected) add('metadata', 'XMP-PROFILE', 'XMP-Profil und tatsächliche XML-Profilkennung widersprechen sich.');
                if (!(ns === FX ? ['1.0'] : ['2p0', '2.0']).includes(report.metadata.Version)) add('metadata', 'XMP-VERSION', 'Diese XMP-Formatversion ist noch nicht durch die Basisprüfung abgedeckt.', 'warning');
            }
        } catch (error) { add('metadata', 'XMP-PARSE', 'XMP-XML ist nicht sicher lesbar: ' + error.message); }
    }
    const { part, conformance } = report.metadata;
    const pdfAProfile = part === '3' && ['A', 'B', 'U'].includes(conformance) ? `3${conformance.toLowerCase()}` : null;
    const pdfA = assessPdfAFile(bytes, { inspection: fileInspection, profile: pdfAProfile });
    report.pdfA = pdfA;
    for (const rule of pdfA.rules) {
        if (rule.status === 'fail') add('pdf', rule.id, rule.detail, 'error', rule.location);
    }
    const applicableRules = pdfA.rules.filter(rule => rule.status !== 'not-applicable');
    const passedRules = applicableRules.filter(rule => rule.status === 'pass').length;
    const failedRules = applicableRules.filter(rule => rule.status === 'fail').length;
    const pdfADetail = failedRules
        ? `${failedRules} ${failedRules === 1 ? 'Prüfregel' : 'Prüfregeln'} verletzt. Regelkennungen und Fundstellen stehen unter „Fehler und Warnungen“.`
        : `${passedRules} von ${applicableRules.length} anwendbaren Prüfregeln bestanden. Die Vollprüfung bleibt offen.`;
    const status = stage => report.issues.some(i => i.stage === stage && i.severity === 'error') ? 'fail'
        : report.issues.some(i => i.stage === stage && i.severity === 'warning') ? 'unknown' : 'pass';
    report.checks = [
        check('embedding', status('embedding'), 'XML-Einbettung (Basisprüfungen)', `Datei: ${filename}; Beziehung: ${file.relationship?.value || 'fehlt'}. Dateiverweise, Dokumentzuordnung, MIME-Type und exakte XML-Bytes untersucht. Vollständige versionsabhängige Formatregeln bleiben offen.`),
        check('metadata', status('metadata'), 'Metadaten (Basisprüfungen)', `PDF/A-Kennung: ${report.metadata.part || '?'}${report.metadata.conformance || '?'}; Profil: ${report.metadata.ConformanceLevel || '?'}. Kennungen und XML-Abgleich sind kein PDF/A-Konformitätsnachweis.`),
        check('pdf', pdfA.status === 'invalid' ? 'fail' : 'unknown',
            pdfAProfile ? `PDF/A-${pdfAProfile}-Konformität` : 'PDF/A-3-Konformität', pdfADetail)
    ];
    if (report.issues.some(i => i.severity === 'error')) report.status = 'invalid';
    return { filename, content: selected.content, bytes: selected.bytes, pdfReport: report };
}
