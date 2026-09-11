import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import SaxonJS from 'saxon-js';
import { createValidator, MAX_XML_BYTES } from '../src/xml-validator/node.mjs';
import { createValidator as createCore } from '../src/xml-validator/core.mjs';
import { cases } from './xml-cases.mjs';

const bytes = await readFile(new URL('fixtures/invoice.xml', import.meta.url));
const xml = bytes.toString('utf8');
test('Original XSD and Schematron run in Node without Java', async t => {
    const validator = await createValidator();
    t.after(() => validator.dispose());
    for (const c of cases) await t.test(c.name, async () => {
        const report = await validator.validateXml(c.edit(xml));
        assert.equal(report.status, c.status, JSON.stringify(report.issues));
        if (c.rule) assert.ok(report.issues.some(i => i.rule === c.rule), JSON.stringify(report.issues));
        if (c.stage) assert.ok(report.issues.some(i => i.stage === c.stage), JSON.stringify(report.issues));
        if (c.status === 'valid') {
            assert.equal(report.xsd.status, 'valid');
            assert.equal(report.schematron.status, 'valid');
            assert.ok(report.schematron.fired > 0);
            assert.match(report.svrl, /schematron-output/);
        }
    });
    const utf16 = Buffer.concat([Buffer.from([255, 254]), Buffer.from(xml.replace('UTF-8', 'UTF-16'), 'utf16le')]);
    assert.equal((await validator.validateXml(utf16)).status, 'valid');
    const dtd16 = Buffer.concat([Buffer.from([255, 254]), Buffer.from(cases.at(-1).edit(xml).replace('UTF-8', 'UTF-16'), 'utf16le')]);
    assert.equal((await validator.validateXml(dtd16)).issues[0].stage, 'parse');
    assert.equal((await validator.validateXml(bytes)).sourceSha256, createHash('sha256').update(bytes).digest('hex'));
    await assert.rejects(validator.validateXml(new Uint8Array(MAX_XML_BYTES + 1)), /5 MB/);
    await assert.rejects(validator.validateXml(''), /1 Byte/);
    const active = validator.validateXml(xml);
    await assert.rejects(validator.validateXml(xml), /bereits/);
    assert.throws(() => validator.dispose(), /läuft/);
    assert.equal((await active).status, 'valid');
});

test('Corrupt rules fail closed; disposed instances cannot validate', async () => {
    const loadAsset = async name => {
        const source = await readFile(new URL('../rules/en16931/' + name, import.meta.url), 'utf8');
        return name === 'schemas.json' ? source + ' ' : source;
    };
    await assert.rejects(createCore({ SaxonJS, loadAsset }), /Regeldatei beschädigt/);
    const validator = await createValidator();
    validator.dispose(); validator.dispose();
    await assert.rejects(validator.validateXml(xml), /geschlossen/);
});
