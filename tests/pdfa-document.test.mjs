import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { sha256, validatePdfA } from '../src/pdfa-validation.mjs';
import { makePdfaDocumentCases } from './pdfa-document-cases.mjs';

const xml = await readFile(new URL('fixtures/invoice.xml', import.meta.url), 'utf8');

test('PDF/A catalog, page tree, annotation, and action findings remain distinct from full conformity', async t => {
    for (const { name, bytes, expect } of makePdfaDocumentCases(xml)) {
        await t.test(name, async () => {
            const sourceSha256 = await sha256(bytes);
            const report = await validatePdfA(bytes, { profile: '3b' });
            assert.equal(await sha256(bytes), sourceSha256);
            assert.equal(report.sourceSha256, sourceSha256);
            for (const [id, status] of Object.entries(expect)) {
                const rule = report.rules.find(finding => finding.id === id);
                assert.ok(rule, 'Missing expected rule ' + id);
                assert.equal(rule.status, status, JSON.stringify(rule));
                if (status === 'fail') {
                    assert.ok(rule.location, 'A violation needs a location');
                }
            }
            const hasExpectedFailure = Object.values(expect).includes('fail');
            assert.equal(report.status, hasExpectedFailure ? 'invalid' : 'partial');
            if (!hasExpectedFailure) {
                assert.deepEqual(report.rules.filter(rule => rule.status === 'fail'), []);
            }
        });
    }
});
