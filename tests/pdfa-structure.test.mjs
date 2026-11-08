import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { sha256, validatePdfA } from '../src/pdfa-validation.mjs';
import { makePdfaStructureCases } from './pdfa-structure-cases.mjs';

const xml = await readFile(new URL('fixtures/invoice.xml', import.meta.url), 'utf8');

test('PDF/A reports distinguish structural violations from an incomplete full inspection', async t => {
    for (const { name, bytes, expect } of makePdfaStructureCases(xml)) {
        await t.test(name, async () => {
            const sourceSha256 = await sha256(bytes);
            const report = await validatePdfA(bytes, { profile: '3b' });
            assert.equal(await sha256(bytes), sourceSha256);
            assert.equal(report.sourceSha256, sourceSha256);
            for (const [id, status] of Object.entries(expect)) {
                const finding = report.rules.find(rule => rule.id === id);
                assert.ok(finding, 'Missing expected rule ' + id);
                assert.equal(finding.status, status, JSON.stringify(finding));
            }
            if (Object.values(expect).includes('fail')) {
                assert.equal(report.status, 'invalid');
            } else {
                assert.deepEqual(report.rules.filter(rule => rule.status === 'fail'), []);
                assert.equal(report.status, 'partial');
            }
        });
    }
});
