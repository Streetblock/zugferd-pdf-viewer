import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import SaxonJS from 'saxon-js';
import { createValidator, MAX_XML_BYTES } from '../src/xml-validator/node.mjs';
import { createValidator as createCore } from '../src/xml-validator/core.mjs';
import { cases } from './xml-cases.mjs';
import { profileCases } from './profile-cases.mjs';

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

test('BASIC and EXTENDED select their own complete rule packages', async t => {
    const validator = await createValidator();
    t.after(() => validator.dispose());
    for (const c of profileCases) await t.test(c.name, async () => {
        const source = await readFile(new URL('fixtures/' + c.fixture, import.meta.url), 'utf8');
        const result = await validator.validateXml(c.edit(source));
        if (c.comparisonRule) {
            assert.ok(['valid', 'invalid'].includes(result.status), JSON.stringify(result.issues));
            assert.equal(result.issues.some(i => i.rule === c.comparisonRule), c.expectedFailure);
        } else assert.equal(result.status, c.status, JSON.stringify(result.issues));
        if (c.status !== 'unsupported') {
            assert.equal(result.profile, c.profile);
            assert.match(result.ruleset, new RegExp('Factur-X ' + c.profile + ' ZF_250'));
            assert.equal(result.rulesetSha256.length, 64);
        }
        if (c.stage) assert.ok(result.issues.some(i => i.stage === c.stage), JSON.stringify(result.issues));
        if (c.rule) assert.ok(result.issues.some(i => i.rule === c.rule), JSON.stringify(result.issues));
        if (c.status === 'valid') {
            assert.equal(result.xsd.status, 'valid');
            assert.equal(result.schematron.status, 'valid');
            assert.ok(result.schematron.fired > 0);
        }
    });
    // Returning to EN16931 after several profile changes must use its original pack.
    assert.equal((await validator.validateXml(bytes)).status, 'valid');
});

test('Rule packages load lazily, cache by profile, and recover without fallback', async () => {
    const basic = await readFile(new URL('fixtures/invoice-basic.xml', import.meta.url), 'utf8');
    const loaded = [];
    let corrupt = true;
    const loadAsset = async name => {
        loaded.push(name);
        const source = await readFile(new URL('../rules/' + name, import.meta.url), 'utf8');
        return corrupt && name === 'basic/schemas.json' ? source + ' ' : source;
    };
    const validator = await createCore({ SaxonJS, loadAsset });
    try {
        assert.equal(loaded.length, 0);
        assert.equal((await validator.validateXml(xml.replace('urn:cen.eu:en16931:2017', '../../extended'))).status, 'unsupported');
        assert.equal(loaded.length, 0, 'Unknown IDs must not load assets or construct paths');
        const failed = await validator.validateXml(basic);
        assert.equal(failed.status, 'not-checked');
        assert.match(failed.issues[0].message, /Regeldatei beschädigt/);
        assert.ok(loaded.every(n => n.startsWith('basic/')));
        corrupt = false;
        assert.equal((await validator.validateXml(basic)).status, 'valid');
        const count = loaded.length;
        assert.equal((await validator.validateXml(basic)).status, 'valid');
        assert.equal(loaded.length, count, 'Already loaded profile should be reused');
        assert.equal((await validator.validateXml(bytes)).status, 'valid');
        assert.ok(loaded.some(n => n.startsWith('en16931/')));
        assert.ok(loaded.every(n => !n.startsWith('extended/')));
    } finally { validator.dispose(); }
});

test('Disposed instances cannot validate', async () => {
    const validator = await createValidator();
    validator.dispose(); validator.dispose();
    await assert.rejects(validator.validateXml(xml), /geschlossen/);
});
