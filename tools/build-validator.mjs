import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { PROFILE_PACKS, ruleStages } from '../src/xml-validator/profiles.mjs';
import { XmlDocument } from 'libxml2-wasm';
import { compilerInput as prepareInput } from './compiler-input.mjs';

const root = new URL('../', import.meta.url);
process.chdir(fileURLToPath(root));
const selected = process.argv.slice(2);
if (selected.some(key => !PROFILE_PACKS.some(p => p.key === key))) throw new Error('Unknown profile selected for build.');
for (const pack of PROFILE_PACKS.filter(p => !selected.length || selected.includes(p.key))) {
const rules = 'rules/' + pack.key + '/';
const sourceLock = JSON.parse(await readFile(rules + 'source-lock.json', 'utf8'));
for (const [name, expected] of [...Object.entries(sourceLock.sourceFiles).map(([name, hash]) => [rules + name, hash]), ['vendor/SaxonJS2.rt.js', sourceLock.saxonBrowserSha256]]) {
    if (createHash('sha256').update(await readFile(name)).digest('hex') !== expected) throw new Error('Originaldatei verändert: ' + name);
}
const names = (await readdir(rules + 'source')).filter(n => n.endsWith('.xsd')).sort();
const schemas = {};
for (const name of names) schemas[name] = await readFile(rules + 'source/' + name, 'utf8');
await writeFile(rules + 'schemas.json', JSON.stringify(schemas));
// Give the compiler copy a virtual XML base, matching the runtime's in-memory
// resource pool. Any runtime compatibility adaptations are recorded in the manifest.
const schemaHash = createHash('sha256').update(await readFile(rules + 'schemas.json')).digest('hex');
await mkdir('.test-artifacts/compiler', { recursive: true });
const adaptations = [], compilerInputs = {};
for (const stage of ruleStages(pack)) {
const originalXslt = await readFile(rules + 'source/' + stage.source, 'utf8');
const compilerInput = '.test-artifacts/compiler/' + stage.source;
const prepared = prepareInput(originalXslt, pack, schemaHash);
await writeFile(compilerInput, prepared.output);
const { stderr } = await promisify(execFile)(process.execPath, ['node_modules/xslt3/xslt3.js',
    '-xsl:' + compilerInput, '-export:' + rules + stage.sef, '-nogo', '-relocate:on'], { maxBuffer: 1024 * 1024 });
if (stderr) process.stderr.write(stderr);
adaptations.push(...prepared.adaptations);
compilerInputs[stage.key] = createHash('sha256').update(prepared.output).digest('hex');
}
if (pack.key === 'xrechnung') {
    const scenarios = XmlDocument.fromString(await readFile(rules + 'source/scenarios.xml', 'utf8'));
    try {
        const ns = { s: 'http://www.xoev.de/de/validator/framework/1/scenarios' };
        const scenario = scenarios.get('//s:scenario[s:name="EN16931 XRechnung (CII)"]', ns);
        if (!scenario?.get('s:match', ns)?.content.includes(pack.ids[0])) throw new Error('KoSIT scenario identifier mismatch.');
        const levels = Object.fromEntries(scenario.find('s:createReport/s:customLevel', ns).map(n =>
            [n.content.trim(), n.get('@level').content.replace('information', 'info')]));
        if (JSON.stringify(levels) !== JSON.stringify(pack.customLevels)) throw new Error('KoSIT severity overrides changed.');
        const xsltNames = scenario.find('s:validateWithSchematron/s:resource/s:location', ns).map(n => n.content.split('/').pop());
        if (JSON.stringify(xsltNames) !== JSON.stringify(ruleStages(pack).map(s => s.source))) throw new Error('KoSIT stages changed.');
    } finally { scenarios.dispose(); }
}
const files = {};
for (const name of ['schemas.json', ...ruleStages(pack).map(s => s.sef), ...Object.keys(sourceLock.sourceFiles)]) {
    files[name] = createHash('sha256').update(await readFile(rules + name)).digest('hex');
}
await writeFile(rules + 'manifest.json', JSON.stringify({
    profileKey: pack.key,
    ruleset: sourceLock.ruleset || `Factur-X ${pack.label} ZF_250, bundled with Mustangproject 2.26.0`,
    source: sourceLock.source || 'https://github.com/ZUGFeRD/mustangproject/tree/core-2.26.0/validator/src/main/resources',
    compiler: 'xslt3 2.7.0', compilerInputAdaptations: [...new Set(adaptations)],
    compilerInputHashes: compilerInputs, ...(pack.customLevels ? { customLevels: pack.customLevels } : {}), files
}, null, 2) + '\n');
console.log(pack.label + ': Regelpaket gebaut.');
}
await mkdir('dist', { recursive: true });
await build({ absWorkingDir: fileURLToPath(root), entryPoints: ['./src/xml-validator/browser.mjs'], outfile: 'dist/xml-validator.mjs', tsconfigRaw: {}, bundle: true, format: 'esm', platform: 'browser', target: 'es2022', external: ['node:module'], minify: false });
console.log('XML-Validator gebaut; Original-Regeln unverändert.');
