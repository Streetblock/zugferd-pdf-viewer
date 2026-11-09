import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { sha256, validatePdfA } from '../src/pdfa-validation.mjs';
import { makePdfaMaskTransferCases } from './pdfa-mask-transfer-cases.mjs';

const xml = await readFile(new URL('fixtures/invoice.xml', import.meta.url), 'utf8');

test('PDF/A mask-local Type 2 transfer functions preserve scalar and clipping semantics', async t => {
    for (const { name, bytes, expect } of makePdfaMaskTransferCases(xml)) {
        await t.test(name, async () => {
            const hash = await sha256(bytes);
            const report = await validatePdfA(bytes);
            assert.equal(await sha256(bytes), hash);
            assert.equal(report.sourceSha256, hash);
            for (const [id, status] of Object.entries(expect)) {
                const finding = report.rules.find(rule => rule.id === id);
                assert.equal(finding?.status, status, JSON.stringify(finding));
                if (status === 'fail') assert.match(finding.location, /\/TR(?:\/|$)/);
            }
            const invalid = Object.values(expect).includes('fail');
            assert.equal(report.status, invalid ? 'invalid' : 'partial');
            if (!invalid) assert.deepEqual(report.rules.filter(rule => rule.status === 'fail'), []);
        });
    }
});
