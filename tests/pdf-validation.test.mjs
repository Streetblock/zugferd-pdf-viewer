import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { extractInvoice, sha256 } from '../src/pdf-validation.mjs';
import { makePdf, xmpFor } from './pdf-fixtures.mjs';
const dom = new JSDOM('', { runScripts: 'outside-only' });
dom.window.TextDecoder = TextDecoder;
dom.window.TextEncoder = TextEncoder;
dom.window.eval(await readFile(new URL('../src/validation.js', import.meta.url), 'utf8'));
const V = dom.window.InvoiceValidation;
const adapter = { parseXml: V.parse, decodeXml: V.decode, profileOf: V.profile };
const xml = await readFile(new URL('fixtures/invoice.xml', import.meta.url), 'utf8');
const status = (data, id) => data.pdfReport.checks.find(c => c.id === id).status;

test('Pinned PDF.js assets match the manifest and no PDF.js CDN remains', async () => {
    const manifest = JSON.parse(await readFile(new URL('../vendor/pdfjs/manifest.json', import.meta.url)));
    assert.match(manifest.commit, /^[a-f0-9]{40}$/);
    for (const [name, hash] of Object.entries(manifest.files)) assert.equal(await sha256(await readFile(new URL('../vendor/pdfjs/' + name, import.meta.url))), hash);
    for (const name of ['index.html', 'app.js']) assert.doesNotMatch(await readFile(new URL('../' + name, import.meta.url), 'utf8'), /cdnjs.*pdf|pdfjsLib/);
});
for (const options of [{}, { compressed: true, objectStream: true }, { incremental: true, compressed: true }]) {
    test('Local extraction and basis checks preserve original bytes: ' + JSON.stringify(options), async () => {
        const bytes = makePdf(xml, options), original = await sha256(bytes);
        const data = await extractInvoice(bytes, adapter);
        assert.equal(await sha256(bytes), original);
        assert.equal(data.content, xml);
        assert.equal(data.pdfReport.xmlSha256, await sha256(new TextEncoder().encode(xml)));
        assert.equal(status(data, 'embedding'), 'pass');
        assert.equal(status(data, 'metadata'), 'pass');
        assert.equal(status(data, 'pdf'), 'unknown');
        assert.equal(data.pdfReport.status, 'partial');
        assert.ok(!JSON.stringify(data.pdfReport).includes('<rsm:CrossIndustryInvoice'));
    });
}
for (const [name, options, stage, expected] of [
    ['missing AF', { missingAF: true }, 'embedding', 'fail'],
    ['wrong MIME', { mime: 'text#2fplain' }, 'embedding', 'fail'],
    ['AF only', { afOnly: true }, 'embedding', 'unknown'],
    ['Source relationship needs context', { relationship: 'Source' }, 'embedding', 'unknown'],
    ['repaired PDF', { recovery: true }, 'embedding', 'unknown'],
    ['missing XMP', { missingXMP: true }, 'metadata', 'fail'],
    ['broken XMP', { xmp: '<broken>' }, 'metadata', 'fail'],
    ['DTD in XMP', { xmp: '<!DOCTYPE x><x/>' }, 'metadata', 'fail'],
    ['wrong filename', { xmp: xmpFor().replace('fx:DocumentFileName="factur-x.xml"', 'fx:DocumentFileName="other.xml"') }, 'metadata', 'fail'],
    ['wrong profile', { xmp: xmpFor('EXTENDED') }, 'metadata', 'fail'],
    ['wrong namespace', { xmp: xmpFor().replace('http://www.aiim.org/pdfa/ns/id/', 'https://fake.invalid/') }, 'metadata', 'fail'],
    ['PDF/A-2 ID', { xmp: xmpFor().replace('pdfaid:part="3"', 'pdfaid:part="2"') }, 'metadata', 'fail'],
    ['unknown version', { xmp: xmpFor().replace('fx:Version="1.0"', 'fx:Version="9.9"') }, 'metadata', 'unknown'],
]) test(name, async () => { const data = await extractInvoice(makePdf(xml, options), adapter); assert.equal(status(data, stage), expected); assert.equal(status(data, 'pdf'), 'unknown'); });
for (const options of [{ duplicate: true }, { conflicting: true }]) test('Reject ambiguous XML source: ' + JSON.stringify(options), async () => {
    await assert.rejects(extractInvoice(makePdf(xml, options), adapter), /Mehrere|Widersprüchliche/);
});
test('PDF findings persist after successful XML validation and reports cannot be rebound', async () => {
    const input = makePdf(xml, { missingAF: true });
    const data = await extractInvoice(input, adapter);
    const result = { ...V.preflight(xml, { isPdf: true }), sourceSha256: await sha256(input), xmlSha256: await sha256(data.bytes) };
    assert.throws(() => V.applyPdfReport(result, { ...data.pdfReport, xmlSha256: 'wrong' }), /Prüfsumme/);
    V.applyPdfReport(result, data.pdfReport);
    V.applyXmlReport(result, { sourceSha256: result.xmlSha256, profileId: result.profileId, status: 'valid', xsd: { status: 'valid' }, schematron: { status: 'valid', fired: 100 }, issues: [] });
    assert.equal(V.summary(result).status, 'fail');
    assert.ok(result.issues.some(i => i.rule === 'PDF-AF'));
    assert.equal(result.checks.filter(c => c.id === 'embedding').length, 1);
});
test('Successful basis checks never certify the PDF/A container', async () => {
    const input = makePdf(xml), data = await extractInvoice(input, adapter);
    const result = { ...V.preflight(xml, { isPdf: true }), sourceSha256: await sha256(input), xmlSha256: await sha256(data.bytes) };
    V.applyPdfReport(result, data.pdfReport);
    V.applyXmlReport(result, { sourceSha256: result.xmlSha256, profileId: result.profileId, status: 'valid', xsd: { status: 'valid' }, schematron: { status: 'valid', fired: 100 }, issues: [] });
    assert.equal(V.summary(result).status, 'unknown');
    assert.match(V.summary(result).label, /PDF-Basisprüfungen bestanden.*PDF\/A offen/);
});
for (const profile of ['basic', 'extended']) test('XMP profile consistency for ' + profile, async () => {
    const source = await readFile(new URL('fixtures/invoice-' + profile + '.xml', import.meta.url), 'utf8');
    const data = await extractInvoice(makePdf(source, { xmp: xmpFor(profile.toUpperCase()) }), adapter);
    assert.equal(status(data, 'metadata'), 'pass');
});
test('XMP element notation and duplicate fields are handled without first-value wins', async () => {
    const elements = xmpFor().replace(/ (pdfaid|fx):([A-Za-z]+)="([^"]*)"/g, '').replace('/></rdf:RDF>', '><pdfaid:part>3</pdfaid:part><pdfaid:conformance>B</pdfaid:conformance><fx:DocumentType>INVOICE</fx:DocumentType><fx:DocumentFileName>factur-x.xml</fx:DocumentFileName><fx:Version>1.0</fx:Version><fx:ConformanceLevel>EN 16931</fx:ConformanceLevel></rdf:Description></rdf:RDF>');
    assert.equal(status(await extractInvoice(makePdf(xml, { xmp: elements }), adapter), 'metadata'), 'pass');
    const duplicate = xmpFor().replace('/></rdf:RDF>', '><fx:Version>1.0</fx:Version></rdf:Description></rdf:RDF>');
    assert.equal(status(await extractInvoice(makePdf(xml, { xmp: duplicate }), adapter), 'metadata'), 'fail');
});
