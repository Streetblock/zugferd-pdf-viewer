// Optional real-browser test. Reuses the PDF.js checkout's existing Puppeteer;
// no new dependency is added to the viewer.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import { createServer } from '../server.mjs';
import { makePdf, xmpFor } from '../tests/pdf-fixtures.mjs';
import { pdfaCases } from '../tests/pdfa-cases.mjs';
import { makePdfaStructureCases } from '../tests/pdfa-structure-cases.mjs';
import { makePdfaDocumentCases, makePdfaDocumentFixture } from '../tests/pdfa-document-cases.mjs';
import { makePdfaEmbeddingCases } from '../tests/pdfa-embedding-cases.mjs';
import { makePdfaFontCases, makePdfaFontFixture } from '../tests/pdfa-font-cases.mjs';
import { makePdfaColorCases, makePdfaColorFixture } from '../tests/pdfa-color-cases.mjs';
import { makePdfaTransparencyCases, makePdfaTransparencyFixture } from '../tests/pdfa-transparency-cases.mjs';
import { makePdfaAnnotationTransparencyCases, makePdfaAnnotationTransparencyFixture } from '../tests/pdfa-annotation-transparency-cases.mjs';
import { makePdfaMaskTransferCases, makePdfaMaskTransferFixture } from '../tests/pdfa-mask-transfer-cases.mjs';
import { makePdfaMaskSampledCases, makePdfaMaskSampledFixture } from '../tests/pdfa-mask-sampled-cases.mjs';
import { makePdfaMaskStitchingCases, makePdfaMaskStitchingFixture } from '../tests/pdfa-mask-stitching-cases.mjs';
import { sha256, validatePdfA } from '../src/pdfa-validation.mjs';
const fork = process.argv[2];
const executablePath = process.argv[3] || process.env.PDFJS_TEST_BROWSER;
if (!fork || !executablePath) throw new Error('Usage: node tools/test-pdf-browser.mjs PDFJS_CHECKOUT CHROME_EXECUTABLE');
const require = createRequire(import.meta.url);
const { default: puppeteer } = await import(pathToFileURL(require.resolve('puppeteer', { paths: [path.resolve(fork)] })).href);
const root = new URL('../', import.meta.url);
const artifactDir = new URL('.test-artifacts/pdf-browser/', root);
await mkdir(artifactDir, { recursive: true });
const xml = await readFile(new URL('tests/fixtures/invoice.xml', root), 'utf8');
const invalidXrefEol = Buffer.from(Buffer.from(makePdf(xml)).toString('latin1').replace('\nxref\n', '\nxref \n'), 'latin1');
const cases = [
    ['good.pdf', makePdf(xml, { compressed: true, objectStream: true }), 'unknown', 'pass', 'pass'],
    ['incremental.pdf', makePdf(xml, { incremental: true, compressed: true }), 'unknown', 'pass', 'pass'],
    ['missing-af.pdf', makePdf(xml, { missingAF: true }), 'fail', 'fail', 'pass', '6.8-4'],
    ['wrong-xmp.pdf', makePdf(xml, { xmp: xmpFor('EXTENDED') }), 'fail', 'pass', 'fail'],
    ['source.pdf', makePdf(xml, { relationship: 'Source' }), 'unknown', 'unknown', 'pass'],
    ['trailing-data.pdf', Buffer.concat([makePdf(xml), Buffer.from('trailing data')]), 'fail', 'pass', 'pass', '6.1.3-3'],
    ['bad-xref-eol.pdf', invalidXrefEol, 'fail', 'pass', 'pass', '6.1.4-2'],
    ['document-objects.pdf', makePdfaDocumentFixture(xml), 'unknown', 'pass', 'pass'],
    ['forbidden-action.pdf', makePdfaDocumentFixture(xml, { action: '<< /S /Launch /F (x.exe) >>' }),
        'fail', 'pass', 'pass', '6.5.1-1'],
    ['invalid-other-attachment.pdf', makePdf(xml, { extraMime: 'unknown' }), 'fail', 'pass', 'pass', '6.8-1'],
    ['missing-xmp-schema.pdf', makePdf(xml, { xmp: xmpFor('EN 16931', { extension: false }) }),
        'fail', 'pass', 'pass', '6.6.2.3.1-1'],
    ['unembedded-font.pdf', makePdfaFontFixture(xml), 'fail', 'pass', 'pass', '6.2.11.4.1-1'],
    ['embedded-form-font.pdf', makePdfaFontFixture(xml, { font: 'cid', placement: 'form', compressed: true }),
        'unknown', 'pass', 'pass'],
    ['missing-font-glyph.pdf', makePdfaFontFixture(xml, { font: 'cid', cid: 3 }),
        'fail', 'pass', 'pass', '6.2.11.4.1-2'],
    ['rgb-output-intent.pdf', makePdfaColorFixture(xml, { intent: 'rgb' }), 'unknown', 'pass', 'pass'],
    ['uncalibrated-rgb.pdf', makePdfaColorFixture(xml), 'fail', 'pass', 'pass', '6.2.4.3-2'],
    ['icc-components.pdf', makePdfaColorFixture(xml, { icc: 'mismatch', paint: '/Icc cs 1 sc 0 0 10 10 re f' }),
        'fail', 'pass', 'pass', 'PDF-ICC-STRUCTURE'],
    ['transparency-group.pdf', makePdfaTransparencyFixture(xml, { graphicsState: '/BM /Darken', pageGroup: true }),
        'unknown', 'pass', 'pass'],
    ['invalid-blend-mode.pdf', makePdfaTransparencyFixture(xml, { graphicsState: '/BM /MadeUp' }),
        'fail', 'pass', 'pass', '6.2.10-1'],
    ['missing-page-blend-space.pdf', makePdfaTransparencyFixture(xml, { graphicsState: '/ca 0.5' }),
        'fail', 'pass', 'pass', '6.2.10-2'],
    ['image-soft-mask.pdf', makePdfaTransparencyFixture(xml, { imageMask: '/DeviceGray', pageGroup: true }),
        'unknown', 'pass', 'pass'],
    ['missing-mask-group.pdf', makePdfaTransparencyFixture(xml, { graphicsState: '/SMask << /S /Alpha >>', pageGroup: true }),
        'fail', 'pass', 'pass', 'PDF-SOFT-MASK'],
    ['calibrated-stamp.pdf', makePdfaAnnotationTransparencyFixture(xml, { appearanceState: '/ca 0.5', pageGroup: true }),
        'unknown', 'pass', 'pass'],
    ['uncalibrated-stamp.pdf', makePdfaAnnotationTransparencyFixture(xml, { appearanceState: '/ca 0.5' }),
        'fail', 'pass', 'pass', '6.2.10-2'],
    ['type2-mask-transfer.pdf', makePdfaMaskTransferFixture(xml, { transfer: '<< /FunctionType 2 /Domain [0 1] /N 1 >>' }),
        'unknown', 'pass', 'pass'],
    ['invalid-type2-mask-transfer.pdf', makePdfaMaskTransferFixture(xml, { transfer: '<< /FunctionType 2 /Domain [0 1] >>' }),
        'fail', 'pass', 'pass', 'PDF-SOFT-MASK'],
    ['type0-mask-transfer.pdf', makePdfaMaskSampledFixture(xml, { compressed: true }),
        'unknown', 'pass', 'pass'],
    ['truncated-type0-mask-transfer.pdf', makePdfaMaskSampledFixture(xml, { data: Buffer.of(0) }),
        'fail', 'pass', 'pass', 'PDF-SOFT-MASK'],
    ['type3-mask-transfer.pdf', makePdfaMaskStitchingFixture(xml),
        'unknown', 'pass', 'pass'],
    ['invalid-type3-mask-transfer.pdf', makePdfaMaskStitchingFixture(xml, { bounds: '[0]' }),
        'fail', 'pass', 'pass', 'PDF-SOFT-MASK'],
    ['invoice.xml', new TextEncoder().encode(xml), 'pass', null, null],
];
const server = createServer();
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
    browser = await puppeteer.launch({ executablePath, headless: true });
    const page = await browser.newPage();
    const urls = [], errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setRequestInterception(true);
    page.on('request', request => {
        urls.push({ url: request.url(), method: request.method() });
        if (request.url().startsWith(base) || request.url().startsWith('data:') || request.url().startsWith('blob:')) request.continue();
        else request.abort();
    });
    await page.goto(base);
    await page.evaluate(() => {
        const original = URL.createObjectURL;
        URL.createObjectURL = blob => { window.testDownload = blob; return original(blob); };
    });
    for (const [name, bytes, overall, embedding, metadata, pdfaFailure] of cases) {
        const file = new URL(name, artifactDir); await writeFile(file, bytes);
        await (await page.$('#file-input')).uploadFile(fileURLToPath(file));
        const hash = await sha256(bytes);
        await page.waitForFunction(expected => document.querySelector('#validation-hash').textContent.includes(expected)
            && !document.querySelector('#download-report').disabled, { timeout: 90000 }, hash);
        assert.equal(await page.$eval('#validation-summary', el => el.dataset.status), overall, name);
        assert.equal(await page.$eval('#validation-details', el => el.open), false, name);
        await page.click('#download-report');
        const report = await page.evaluate(async () => JSON.parse(await window.testDownload.text()));
        assert.equal(report.sourceSha256, hash, name);
        assert.equal(report.xmlValidation.status, 'valid', name);
        assert.equal(report.xmlSha256, await sha256(new TextEncoder().encode(xml)), name);
        if (embedding) {
            assert.equal(report.checks.find(c => c.id === 'embedding').status, embedding, name);
            assert.equal(report.checks.find(c => c.id === 'metadata').status, metadata, name);
            assert.equal(report.checks.find(c => c.id === 'pdf').status, pdfaFailure ? 'fail' : 'unknown', name);
            const failures = report.pdfValidation.pdfA.rules.filter(rule => rule.status === 'fail').map(rule => rule.id);
            if (pdfaFailure) assert.ok(failures.includes(pdfaFailure), name);
            else assert.deepEqual(failures, [], name);
            if (name === 'incremental.pdf') assert.equal(report.pdfValidation.pdfA.structureCounts.revisions, 2);
            if (name === 'embedded-form-font.pdf') {
                for (const id of ['6.2.11.4.1-1', '6.2.11.4.1-2']) {
                    assert.equal(report.pdfValidation.pdfA.rules.find(rule => rule.id === id).status, 'pass', id);
                }
                assert.ok(report.pdfValidation.pdfA.fontCounts.glyphs > 0);
            }
            if (name === 'rgb-output-intent.pdf') {
                for (const id of ['6.2.3-1', '6.2.4.3-2']) {
                    assert.equal(report.pdfValidation.pdfA.rules.find(rule => rule.id === id).status, 'pass', id);
                }
                assert.ok(report.pdfValidation.pdfA.colorCounts.outputIntents > 0);
            }
            if (name === 'transparency-group.pdf') {
                for (const id of ['6.2.10-1', '6.2.10-2', 'PDF-TRANSPARENCY-GROUP']) {
                    assert.equal(report.pdfValidation.pdfA.rules.find(rule => rule.id === id).status, 'pass', id);
                }
                assert.ok(report.pdfValidation.pdfA.transparencyCounts);
            }
            if (name === 'image-soft-mask.pdf') {
                assert.equal(report.pdfValidation.pdfA.rules.find(rule => rule.id === 'PDF-SOFT-MASK').status, 'pass');
                assert.equal(report.pdfValidation.pdfA.transparencyCounts.imageSoftMasks, 1);
            }
            if (name === 'calibrated-stamp.pdf' || name === 'uncalibrated-stamp.pdf') {
                const pdfa = report.pdfValidation.pdfA;
                assert.equal(pdfa.transparencyCounts.annotationAppearances, 1);
                const finding = pdfa.rules.find(rule => rule.id === '6.2.10-2');
                assert.equal(finding.status, pdfaFailure ? 'fail' : 'pass');
                assert.match(finding.location, /\/Annots\[0\]\/AP\/N(?:\/|$)/);
            }
            if (name === 'type2-mask-transfer.pdf' || name === 'invalid-type2-mask-transfer.pdf') {
                const finding = report.pdfValidation.pdfA.rules.find(rule => rule.id === 'PDF-SOFT-MASK');
                assert.equal(finding.status, pdfaFailure ? 'fail' : 'pass');
                if (pdfaFailure) assert.match(finding.location, /\/TR\/N$/);
            }
            if (name === 'type0-mask-transfer.pdf' || name === 'truncated-type0-mask-transfer.pdf') {
                const finding = report.pdfValidation.pdfA.rules.find(rule => rule.id === 'PDF-SOFT-MASK');
                assert.equal(finding.status, pdfaFailure ? 'fail' : 'pass');
                if (pdfaFailure) assert.match(finding.location, /\/TR$/);
            }
            if (name === 'type3-mask-transfer.pdf' || name === 'invalid-type3-mask-transfer.pdf') {
                const finding = report.pdfValidation.pdfA.rules.find(rule => rule.id === 'PDF-SOFT-MASK');
                assert.equal(finding.status, pdfaFailure ? 'fail' : 'pass');
                if (pdfaFailure) assert.match(finding.location, /\/TR\/Bounds$/);
            }
            if (name === 'document-objects.pdf') {
                assert.equal(report.pdfValidation.pdfA.documentCounts.pages, 2);
                for (const id of ['PDF-CATALOG', 'PDF-PAGE-TREE', '6.3.1-1', '6.5.1-1']) {
                    assert.equal(report.pdfValidation.pdfA.rules.find(rule => rule.id === id).status, 'pass', id);
                }
            }
        } else assert.equal(report.pdfValidation, undefined);
        await writeFile(new URL(name + '.json', artifactDir), JSON.stringify(report, null, 2));
        console.log('PASS browser upload/report: ' + name);
    }
    const duplicate = new URL('ambiguous.pdf', artifactDir);
    await writeFile(duplicate, makePdf(xml, { duplicate: true }));
    await (await page.$('#file-input')).uploadFile(fileURLToPath(duplicate));
    await page.waitForFunction(() => document.querySelector('#error-text').textContent.includes('Mehrere'), { timeout: 20000 });
    assert.equal(await page.$eval('#download-report', el => el.disabled), true);
    const standaloneCases = [
        ...pdfaCases.map(([name, bytes]) => ({ name, bytes })),
        ...makePdfaStructureCases(xml),
        ...makePdfaDocumentCases(xml),
        ...makePdfaEmbeddingCases(xml),
        ...makePdfaFontCases(xml),
        ...makePdfaColorCases(xml),
        ...makePdfaTransparencyCases(xml),
        ...makePdfaAnnotationTransparencyCases(xml),
        ...makePdfaMaskTransferCases(xml),
        ...makePdfaMaskSampledCases(xml),
        ...makePdfaMaskStitchingCases(xml),
    ];
    for (const { name, bytes } of standaloneCases) {
        const inBrowser = await page.evaluate(async input => {
            const { validatePdfA } = await import('/src/pdfa-validation.mjs');
            return validatePdfA(new Uint8Array(input), { profile: '3b' });
        }, Array.from(bytes));
        assert.deepEqual(inBrowser, await validatePdfA(bytes), name);
    }
    console.log(`PASS Browser and Node agree on ${standaloneCases.length} standalone PDF/A cases.`);
    assert.ok(urls.some(r => r.url === base + '/vendor/pdfjs/pdf.worker.mjs'));
    assert.ok(!urls.some(r => /cdnjs.*pdf/.test(r.url)));
    assert.ok(!urls.some(r => r.method === 'POST'));
    assert.deepEqual(errors, []);
    console.log('PASS ambiguous upload rejected; local worker; no Java/upload requests; no page errors.');
} finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
}
