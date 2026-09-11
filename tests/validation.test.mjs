import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
const dom = new JSDOM('', { runScripts: 'outside-only' });
dom.window.TextDecoder = TextDecoder;
dom.window.TextEncoder = TextEncoder;
dom.window.eval(await readFile(new URL('../src/validation.js', import.meta.url), 'utf8'));
dom.window.eval(await readFile(new URL('../src/lib.js', import.meta.url), 'utf8'));
const V = dom.window.InvoiceValidation;
const xml = await readFile(new URL('fixtures/invoice.xml', import.meta.url), 'utf8');
const profile = 'urn:cen.eu:en16931:2017';
const report = (pdf = '', status = 'valid', fired = 104) => ({ engine: 'Test', attachments: [], report:
    `<validation>${pdf}<xml><info><profile>${profile}</profile><rules><fired>${fired}</fired></rules></info><summary status="${status}"/></xml><summary status="${status}"/></validation>` });

test('Browser checks never certify a well-formed but unvalidated invoice', () => {
    assert.equal(V.summary(V.preflight(xml)).status, 'unknown');
});
test('JS reports bind exact XML bytes and keep incomplete stages open', () => {
    const make = () => ({ ...V.preflight(xml), xmlSha256: 'xml-hash' });
    const valid = { sourceSha256: 'xml-hash', profileId: profile, status: 'valid', xsd: { status: 'valid' }, schematron: { status: 'valid', fired: 61 }, issues: [] };
    assert.equal(V.summary(V.applyXmlReport(make(), valid)).status, 'pass');
    assert.throws(() => V.applyXmlReport(make(), { ...valid, sourceSha256: 'other-hash' }), /Prüfsumme/);
    assert.equal(V.summary(V.applyXmlReport(make(), { ...valid, schematron: { status: 'valid', fired: 0 } })).status, 'unknown');
    const pdf = { ...V.preflight(xml, { isPdf: true }), xmlSha256: 'xml-hash' };
    assert.equal(V.summary(V.applyXmlReport(pdf, valid)).label, 'XML bestanden · PDF/A-Prüfung offen');
    const failed = V.applyXmlReport(make(), { ...valid, status: 'invalid' });
    V.applyReferenceComparison(failed, report());
    assert.equal(V.summary(failed).status, 'fail');
    assert.equal(failed.xmlValidation.status, 'invalid');
    assert.equal(failed.referenceValidation.checks.find(c => c.id === 'xml').status, 'pass');
});
test('BASIC is allowed; MINIMUM and BASIC-WL are excluded; unknown lookalikes stay unknown', () => {
    for (const name of ['minimum', 'basicwl', 'basic']) {
        const result = V.preflight(xml.replace(profile, `urn:factur-x.eu:1p0:${name}`));
        assert.equal(result.checks.find(c => c.id === 'profile').status, name === 'basic' ? 'pass' : 'fail');
    }
    assert.equal(V.profile('fake:en16931:extended'), 'Unbekannt');
});
test('Buyer reference is only required by optional B2G context', () => {
    assert.equal(V.preflight(xml).checks.find(c => c.id === 'reference').status, 'info');
    assert.equal(V.preflight(xml, { b2g: true }).checks.find(c => c.id === 'reference').status, 'fail');
});
test('Malformed XML, DTD, wrong namespaces and unsupported UBL are rejected', () => {
    for (const value of ['<broken>', '<!DOCTYPE x><x/>', xml.replaceAll('CrossIndustryInvoice:100', 'fake:100'), '<Invoice/>']) {
        assert.throws(() => V.preflight(value));
    }
});
test('FC tax number is not shown as VAT ID and currency comes from XML', () => {
    const data = new dom.window.InvoiceXMLParser(xml.replace('>EUR<', '>USD<')).parse();
    assert.equal(data.sellerVatId, 'Unbekannt');
    assert.equal(data.sellerTaxReference, '123/456/78901');
    assert.equal(data.currency, 'USD');
});
test('Only an explicit XML result with fired rules and matching profile can pass', () => {
    assert.equal(V.summary(V.applyReport(V.preflight(xml), report())).status, 'pass');
    assert.equal(V.summary(V.applyReport(V.preflight(xml), report('', 'invalid'))).status, 'fail');
    assert.equal(V.summary(V.applyReport(V.preflight(xml), report('', 'valid', 0))).status, 'unknown');
    assert.throws(() => V.applyReport(V.preflight(xml), { report: '<broken>' }));
});
test('PDF warning downgrade and overall valid status cannot conceal failed veraPDF', () => {
    const result = V.applyReport(V.preflight(xml, { isPdf: true }), report('<pdf>ValidationResult [flavour=3b, isCompliant=false]<summary status="valid"/></pdf>'));
    assert.equal(V.summary(result).status, 'fail');
});
test('Missing AF/MIME, non-Alternative relation and wrong XML hash cannot pass', () => {
    const pdf = '<pdf>ValidationResult [flavour=3b, isCompliant=true]<summary status="valid"/></pdf>';
    const attachment = { sha256: 'abc', mime: 'text/xml', relationship: 'Alternative', associated: true };
    for (const [changes, hash, expected] of [[{}, 'abc', 'pass'], [{ mime: 'text/plain' }, 'abc', 'fail'], [{ associated: false }, 'abc', 'fail'], [{ relationship: 'Data' }, 'abc', 'fail'], [{}, 'wrong', 'unknown']]) {
        const response = report(pdf); response.attachments = [{ ...attachment, ...changes }];
        assert.equal(V.summary(V.applyReport(V.preflight(xml, { isPdf: true }), response, hash)).status, expected);
    }
});
test('Original UTF-16 bytes decode correctly', () => {
    assert.equal(V.decode(new Uint8Array(Buffer.from('\ufeff' + xml.replace('UTF-8', 'UTF-16'), 'utf16le'))), xml.replace('UTF-8', 'UTF-16'));
});
test('Multiple invoice attachments fail closed and PDF resources are destroyed', async () => {
    let destroyed = false;
    dom.window.pdfjsLib = { getDocument: () => ({ promise: Promise.resolve({
        getAttachments: async () => ({ a: { filename: 'factur-x.xml', content: new TextEncoder().encode(xml) }, b: { filename: 'second.xml', content: new TextEncoder().encode(xml) } }),
        destroy: async () => { destroyed = true; }
    }) }) };
    await assert.rejects(new dom.window.PDFAttachmentExtractor().extractXML({ arrayBuffer: async () => new ArrayBuffer(0) }), /Mehrere/);
    assert.equal(destroyed, true);
});
