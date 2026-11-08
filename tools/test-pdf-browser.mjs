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
    ['missing-af.pdf', makePdf(xml, { missingAF: true }), 'fail', 'fail', 'pass'],
    ['wrong-xmp.pdf', makePdf(xml, { xmp: xmpFor('EXTENDED') }), 'fail', 'pass', 'fail'],
    ['source.pdf', makePdf(xml, { relationship: 'Source' }), 'unknown', 'unknown', 'pass'],
    ['trailing-data.pdf', Buffer.concat([makePdf(xml), Buffer.from('trailing data')]), 'fail', 'pass', 'pass', '6.1.3-3'],
    ['bad-xref-eol.pdf', invalidXrefEol, 'fail', 'pass', 'pass', '6.1.4-2'],
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
