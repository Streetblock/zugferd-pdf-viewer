import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import SaxonJS from 'saxon-js';
import { createValidator } from '../src/xml-validator/node.mjs';
import { createValidator as createCore } from '../src/xml-validator/core.mjs';
import { xrechnungCases } from './xrechnung-cases.mjs';
const xml = await readFile(new URL('fixtures/invoice-xrechnung.xml', import.meta.url), 'utf8');

test('XRechnung CII runs XSD, CEN and KoSIT including scenario severity overrides', async t => {
    const v = await createValidator(); t.after(() => v.dispose());
    for (const c of xrechnungCases) await t.test(c.name, async () => {
        const r = await v.validateXml(c.edit(xml));
        assert.equal(r.status, c.status, JSON.stringify(r.issues));
        if (c.clean) assert.deepEqual(r.issues, []);
        if (c.stage) assert.ok(r.issues.some(i => i.stage === c.stage), JSON.stringify(r.issues));
        if (c.rule) {
            const issue = r.issues.find(i => i.rule === c.rule);
            assert.ok(issue, JSON.stringify(r.issues));
            for (const key of ['severity', 'originalFlag', 'layer']) if (c[key]) assert.equal(issue[key], c[key]);
        }
        if (r.xsd.status === 'valid') {
            assert.deepEqual(r.schematron.stages.map(s => s.key), ['cen', 'xrechnung']);
            assert.ok(r.schematron.stages.every(s => s.fired > 0 && s.sha256.length === 64 && s.svrl.includes('schematron-output')));
            assert.equal(r.schematron.fired, r.schematron.stages.reduce((n, s) => n + s.fired, 0));
        }
    });
});

test('Missing/corrupt second XRechnung stage and empty SVRL cannot pass', async () => {
    let fault = 'missing';
    const loadAsset = async name => {
        if (name === 'xrechnung/xrechnung.sef.json' && fault === 'missing') throw new Error('test missing stage');
        const value = await readFile(new URL('../rules/' + name, import.meta.url), 'utf8');
        return name === 'xrechnung/xrechnung.sef.json' && fault === 'corrupt' ? value + ' ' : value;
    };
    const v = await createCore({ SaxonJS, loadAsset });
    try {
        for (const f of ['missing', 'corrupt']) {
            fault = f;
            const r = await v.validateXml(xml);
            assert.equal(r.status, 'not-checked');
            assert.equal(r.schematron.status, 'not-checked');
        }
        fault = '';
        assert.equal((await v.validateXml(xml)).status, 'valid');
    } finally { v.dispose(); }
    let calls = 0;
    const empty = await createCore({ loadAsset, SaxonJS: { ...SaxonJS, transform: (...args) => ++calls === 2
        ? Promise.resolve({ principalResult: '<svrl:schematron-output xmlns:svrl="http://purl.oclc.org/dsdl/svrl"/>' })
        : SaxonJS.transform(...args) } });
    try {
        const r = await empty.validateXml(xml);
        assert.equal(r.status, 'not-checked');
        assert.equal(r.schematron.stages.length, 1);
        assert.equal(r.schematron.status, 'not-checked');
    } finally { empty.dispose(); }
});
