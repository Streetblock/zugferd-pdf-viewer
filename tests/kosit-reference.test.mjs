// Opt-in development test only: never imported by the viewer or npm test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { createValidator } from '../src/xml-validator/node.mjs';
import { PROFILE_PACKS } from '../src/xml-validator/profiles.mjs';
import { xrechnungCases } from './xrechnung-cases.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

test('XRechnung results, rule IDs, levels and locations match pinned KoSIT', { timeout: 180000 }, async t => {
    const lock = JSON.parse(await readFile(new URL('../rules/xrechnung/reference-lock.json', import.meta.url)));
    for (const [name, hash] of Object.entries(lock.files)) {
        assert.equal(digest(await readFile(path.join(root, name))), hash, 'Reference file changed: ' + name);
    }
    const artifacts = path.join(root, '.test-artifacts');
    await mkdir(artifacts, { recursive: true });
    const dir = await mkdtemp(path.join(artifacts, 'kosit-test-'));
    t.after(() => rm(dir, { recursive: true, force: true }));
    const xml = await readFile(new URL('fixtures/invoice-xrechnung.xml', import.meta.url), 'utf8');
    const cases = xrechnungCases.filter(c => c.status !== 'unsupported');
    const inputs = [];
    for (const [n, c] of cases.entries()) {
        const file = path.join(dir, n + '.xml'); inputs.push(file);
        await writeFile(file, c.edit(xml));
    }
    try {
        await promisify(execFile)('java', ['-Xmx512m', '-jar', path.join(root, 'tools/kosit-validator-1.6.3.jar'),
            '-s', path.join(artifacts, 'kosit-config/scenarios.xml'), '-r', path.join(artifacts, 'kosit-config'),
            '-o', dir, ...inputs], { cwd: root, timeout: 120000, maxBuffer: 2 * 1024 * 1024 });
    } catch (error) {
        // KoSIT exits with the number of rejected documents for this batch.
        assert.equal(error.code, cases.filter(c => c.status === 'invalid').length, error.stderr || error.message);
    }
    const validator = await createValidator(); t.after(() => validator.dispose());
    const ns = 'http://www.xoev.de/de/validator/varl/1';
    const levels = PROFILE_PACKS.find(p => p.key === 'xrechnung').customLevels;
    for (const [n, c] of cases.entries()) await t.test(c.name, async () => {
        const bytes = await readFile(inputs[n]);
        const r = await validator.validateXml(bytes);
        const dom = new JSDOM(await readFile(path.join(dir, n + '-report.xml'), 'utf8'), { contentType: 'application/xml' });
        try {
            const d = dom.window.document;
            const nodes = name => [...d.getElementsByTagNameNS(ns, name)];
            assert.equal(nodes('hashValue')[0].textContent, createHash('sha256').update(bytes).digest('base64'));
            assert.equal(r.status, c.status);
            assert.equal(nodes('accept').length > 0, r.status === 'valid');
            const steps = nodes('validationStepResult');
            assert.equal(steps.find(s => s.getAttribute('id') === 'val-xsd').getAttribute('valid') === 'true', r.xsd.status === 'valid');
            if (r.xsd.status === 'valid') {
                const actual = r.issues.map(i => [i.layer, i.rule, i.severity, i.location]).sort();
                const expected = steps.filter(s => s.getAttribute('id').startsWith('val-sch.')).flatMap(s =>
                    [...s.getElementsByTagNameNS(ns, 'message')].map(m => [s.getAttribute('id') === 'val-sch.1' ? 'cen' : 'xrechnung',
                        m.getAttribute('code'), levels[m.getAttribute('code')] || m.getAttribute('level').replace('information', 'info'),
                        m.getAttribute('xpathLocation')])).sort();
                assert.deepEqual(actual, expected);
            }
        } finally { dom.window.close(); }
    });
});
