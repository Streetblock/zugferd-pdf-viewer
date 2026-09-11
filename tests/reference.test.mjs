import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { checkValidator, validate } from '../tools/mustang.mjs';

test('Real Mustang accepts valid fixture, rejects missing field and wrong totals', { timeout: 180000 }, async t => {
    assert.ok(await checkValidator(), 'Install pinned Mustang and JDK 17+ before running reference tests');
    const xml = await readFile(new URL('fixtures/invoice.xml', import.meta.url), 'utf8');
    for (const [input, expected] of [[xml, 'valid'], [xml.replace('<ram:ID>TEST-2026-001</ram:ID>', ''), 'invalid'], [xml.replace('<ram:GrandTotalAmount>119.00', '<ram:GrandTotalAmount>120.00'), 'invalid']]) {
        const result = await validate(Buffer.from(input), 'xml');
        assert.match(result.report, new RegExp(`<summary status="${expected}"/>\\s*</validation>`));
        assert.equal(result.sourceSha256.length, 64);
    }
});
