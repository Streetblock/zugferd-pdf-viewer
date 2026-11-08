// Optional real-browser test. Reuses the PDF.js checkout's existing Puppeteer;
// no new dependency is added to the viewer.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import { createServer } from '../server.mjs';
import { makePdf, xmpFor } from '../tests/pdf-fixtures.mjs';
import { sha256 } from '../src/pdf-validation.mjs';
const fork = process.argv[2];
const executablePath = process.argv[3] || process.env.PDFJS_TEST_BROWSER;
const onlineQr = process.argv.includes('--online-qr');
if (!fork || !executablePath) throw new Error('Usage: node tools/test-pdf-browser.mjs PDFJS_CHECKOUT CHROME_EXECUTABLE [--online-qr]');
const paymentModulePaths = [
    'https://streetblock.github.io/epc-qr-payload/libs/',
    'https://streetblock.github.io/QR-Atelier/libs/',
];
const require = createRequire(import.meta.url);
const { default: puppeteer } = await import(pathToFileURL(require.resolve('puppeteer', { paths: [path.resolve(fork)] })).href);
const root = new URL('../', import.meta.url);
const artifactDir = new URL('.test-artifacts/pdf-browser/', root);
await mkdir(artifactDir, { recursive: true });
const xmlWithoutPayment = await readFile(new URL('tests/fixtures/invoice.xml', root), 'utf8');
const iban = 'DE02100100100006820101';
const xml = xmlWithoutPayment.replace('</ram:InvoiceCurrencyCode>', `</ram:InvoiceCurrencyCode>
      <ram:SpecifiedTradeSettlementPaymentMeans>
        <ram:TypeCode>58</ram:TypeCode>
        <ram:PayeePartyCreditorFinancialAccount><ram:IBANID>${iban}</ram:IBANID></ram:PayeePartyCreditorFinancialAccount>
      </ram:SpecifiedTradeSettlementPaymentMeans>`);
const paymentXmlHash = await sha256(new TextEncoder().encode(xml));
const cases = [
    ['good.pdf', makePdf(xml, { compressed: true, objectStream: true }), 'unknown', 'pass', 'pass'],
    ['missing-af.pdf', makePdf(xml, { missingAF: true }), 'fail', 'fail', 'pass'],
    ['wrong-xmp.pdf', makePdf(xml, { xmp: xmpFor('EXTENDED') }), 'fail', 'pass', 'fail'],
    ['source.pdf', makePdf(xml, { relationship: 'Source' }), 'unknown', 'unknown', 'pass'],
    ['invoice.xml', new TextEncoder().encode(xmlWithoutPayment), 'pass', null, null],
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
        const url = request.url();
        urls.push({ url, method: request.method() });
        const allowPaymentModule = onlineQr && paymentModulePaths.some(prefix => url.startsWith(prefix));
        if (url.startsWith(base + '/') || url.startsWith('data:') || url.startsWith('blob:') || allowPaymentModule) request.continue();
        else request.abort();
    });
    await page.goto(base);
    await page.evaluate(() => {
        const original = URL.createObjectURL;
        URL.createObjectURL = blob => { window.testDownload = blob; return original(blob); };
    });
    for (const [name, bytes, overall, embedding, metadata] of cases) {
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
        assert.equal(report.xmlSha256, embedding ? paymentXmlHash : hash, name);
        if (embedding) {
            assert.equal(report.checks.find(c => c.id === 'embedding').status, embedding, name);
            assert.equal(report.checks.find(c => c.id === 'metadata').status, metadata, name);
            assert.equal(report.checks.find(c => c.id === 'pdf').status, 'unknown', name);
        } else assert.equal(report.pdfValidation, undefined);
        if (name === 'good.pdf') {
            assert.equal(await page.$eval('#payment-panel', el => el.classList.contains('hidden')), false);
            const amount = await page.$eval('#payment-amount', el => el.textContent.replace(/\s/g, ' '));
            assert.equal(amount, '119,00 EUR');
            if (onlineQr) {
                await page.waitForSelector('#payment-qr svg', { timeout: 15000 });
            } else {
                assert.equal(await page.$('#payment-qr svg'), null);
                assert.match(await page.$eval('#payment-qr', el => el.textContent), /EPC-Payload ist unten trotzdem sichtbar/);
            }
            const payload = await page.$eval('#payment-payload', el => el.value);
            for (const field of ['BCD', 'SCT', 'Testlieferant GmbH', iban, 'EUR119.00', 'Rechnung TEST-2026-001']) {
                assert.ok(payload.split('\n').includes(field), `Missing EPC field: ${field}`);
            }
            console.log(`PASS payment from validated PDF: ${onlineQr ? 'GiroCode SVG' : 'offline EPC payload'}`);
        }
        if (name === 'invoice.xml') {
            assert.equal(await page.$eval('#payment-panel', el => el.classList.contains('hidden')), true);
            assert.equal(await page.$eval('#payment-payload', el => el.value), '');
            assert.equal(await page.$('#payment-qr svg'), null);
        }
        await writeFile(new URL(name + '.json', artifactDir), JSON.stringify(report, null, 2));
        console.log('PASS browser upload/report: ' + name);
    }
    const duplicate = new URL('ambiguous.pdf', artifactDir);
    await writeFile(duplicate, makePdf(xml, { duplicate: true }));
    await (await page.$('#file-input')).uploadFile(fileURLToPath(duplicate));
    await page.waitForFunction(() => document.querySelector('#error-text').textContent.includes('Mehrere'), { timeout: 20000 });
    assert.equal(await page.$eval('#download-report', el => el.disabled), true);
    assert.ok(urls.some(r => r.url === base + '/vendor/pdfjs/pdf.worker.mjs'));
    assert.ok(!urls.some(r => /cdnjs.*pdf/.test(r.url)));
    assert.ok(!urls.some(r => r.method === 'POST'));
    assert.deepEqual(errors, []);
    console.log('PASS ambiguous upload rejected; local worker; no Java/upload requests; no page errors.');
} finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
}
