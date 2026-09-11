import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { checkValidator, validate } from '../tools/mustang.mjs';
import { createValidator } from '../src/xml-validator/node.mjs';
import { cases } from './xml-cases.mjs';

test('JS and real Mustang agree on the supported EN16931 reference cases', { timeout: 300000 }, async t => {
    assert.ok(await checkValidator(), 'Install pinned Mustang and JDK 17+ before running reference tests');
    const xml = await readFile(new URL('fixtures/invoice.xml', import.meta.url), 'utf8');
    const js = await createValidator();
    t.after(() => js.dispose());
    for (const c of cases.slice(0, 7)) await t.test(c.name, async () => {
        const input = c.edit(xml);
        const result = await validate(Buffer.from(input), 'xml');
        const actual = await js.validateXml(input);
        assert.equal(actual.status, c.status);
        assert.match(result.report, new RegExp(`<summary status="${c.status}"/>\\s*</validation>`));
        if (c.rule) {
            assert.ok(actual.issues.some(i => i.rule === c.rule));
            assert.ok(result.report.includes(c.rule), 'Mustang must report the same upstream rule: ' + c.rule);
        }
        assert.equal(result.sourceSha256.length, 64);
        assert.equal(actual.sourceSha256, result.sourceSha256);
    });
});
