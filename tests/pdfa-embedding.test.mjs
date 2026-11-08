import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { sha256, validatePdfA } from '../src/pdfa-validation.mjs';
import { makePdfaEmbeddingCases } from './pdfa-embedding-cases.mjs';

const xml = await readFile(new URL('fixtures/invoice.xml', import.meta.url), 'utf8');

test('PDF/A attachment and XMP rules keep known errors distinct from an open inspection', async t => {
    for (const { name, bytes, expect } of makePdfaEmbeddingCases(xml)) {
        await t.test(name, async () => {
            const hash = await sha256(bytes);
            const report = await validatePdfA(bytes);
            assert.equal(await sha256(bytes), hash);
            assert.equal(report.sourceSha256, hash);
            for (const [id, status] of Object.entries(expect)) {
                const finding = report.rules.find(rule => rule.id === id);
                assert.ok(finding, 'Missing rule ' + id);
                assert.equal(finding.status, status, JSON.stringify(finding));
                if (status === 'fail') assert.ok(finding.location, 'A violation needs a location');
            }
            const expectedFailure = Object.values(expect).includes('fail');
            assert.equal(report.status, expectedFailure ? 'invalid' : 'partial');
            if (!expectedFailure) assert.deepEqual(report.rules.filter(rule => rule.status === 'fail'), []);
        });
    }
});
