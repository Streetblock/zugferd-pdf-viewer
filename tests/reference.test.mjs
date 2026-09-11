import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { checkValidator, validate } from '../tools/mustang.mjs';
import { createValidator } from '../src/xml-validator/node.mjs';
import { cases } from './xml-cases.mjs';
import { profileCases } from './profile-cases.mjs';

test('JS and real Mustang agree on EN16931, BASIC and EXTENDED', { timeout: 600000 }, async t => {
    assert.ok(await checkValidator(), 'Install pinned Mustang and JDK 17+ before running reference tests');
    const xml = await readFile(new URL('fixtures/invoice.xml', import.meta.url), 'utf8');
    const js = await createValidator();
    t.after(() => js.dispose());
    for (const c of [...cases.slice(0, 7), ...profileCases.filter(c => c.reference !== false)]) await t.test(c.name, async () => {
        const source = c.fixture ? await readFile(new URL('fixtures/' + c.fixture, import.meta.url), 'utf8') : xml;
        const input = c.edit(source);
        const result = await validate(Buffer.from(input), 'xml');
        const actual = await js.validateXml(input);
        if (c.comparisonRule) {
            assert.ok(['valid', 'invalid'].includes(actual.status), JSON.stringify(actual.issues));
            assert.equal(actual.issues.some(i => i.rule === c.comparisonRule), c.expectedFailure);
            assert.equal(result.report.includes(c.comparisonRule), c.expectedFailure, 'Mustang tolerance boundary: ' + c.comparisonRule);
        } else {
            assert.equal(actual.status, c.status);
            assert.match(result.report, new RegExp(`<summary status="${c.status}"/>\\s*</validation>`));
        }
        if (c.rule) {
            assert.ok(actual.issues.some(i => i.rule === c.rule));
            assert.ok(result.report.includes(c.rule), 'Mustang must report the same upstream rule: ' + c.rule);
        }
        if (c.stage === 'schematron') {
            const rules = actual.issues.filter(i => i.stage === 'schematron').map(i => i.rule);
            assert.ok(rules.length > 0);
            for (const rule of rules) assert.ok(result.report.includes(rule), 'Same upstream rule expected: ' + rule);
        }
        assert.equal(result.sourceSha256.length, 64);
        assert.equal(actual.sourceSha256, result.sourceSha256);
    });
});
