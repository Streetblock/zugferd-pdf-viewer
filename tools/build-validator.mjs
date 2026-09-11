import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { PROFILE_PACKS } from '../src/xml-validator/profiles.mjs';
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
const originalXslt = await readFile(rules + 'source/' + pack.stem + '.xslt', 'utf8');
const schemaHash = createHash('sha256').update(await readFile(rules + 'schemas.json')).digest('hex');
await mkdir('.test-artifacts/compiler', { recursive: true });
const compilerInput = '.test-artifacts/compiler/' + pack.stem + '.xslt';
const prepared = prepareInput(originalXslt, pack, schemaHash);
await writeFile(compilerInput, prepared.output);
const { stderr } = await promisify(execFile)(process.execPath, ['node_modules/xslt3/xslt3.js',
    '-xsl:' + compilerInput, '-export:' + rules + pack.key + '.sef.json', '-nogo', '-relocate:on'], { maxBuffer: 1024 * 1024 });
if (stderr) process.stderr.write(stderr);
const files = {};
for (const name of ['schemas.json', pack.key + '.sef.json', 'source/' + pack.stem + '_codedb.xml', ...names.map(n => 'source/' + n), 'source/' + pack.stem + '.xslt']) {
    files[name] = createHash('sha256').update(await readFile(rules + name)).digest('hex');
}
await writeFile(rules + 'manifest.json', JSON.stringify({
    profileKey: pack.key,
    ruleset: `Factur-X ${pack.label} ZF_250, bundled with Mustangproject 2.26.0`,
    source: 'https://github.com/ZUGFeRD/mustangproject/tree/core-2.26.0/validator/src/main/resources',
    compiler: 'xslt3 2.7.0', compilerInputAdaptations: prepared.adaptations,
    compilerInputSha256: createHash('sha256').update(prepared.output).digest('hex'), files
}, null, 2) + '\n');
console.log(pack.label + ': Regelpaket gebaut.');
}
await mkdir('dist', { recursive: true });
await build({ absWorkingDir: fileURLToPath(root), entryPoints: ['./src/xml-validator/browser.mjs'], outfile: 'dist/xml-validator.mjs', tsconfigRaw: {}, bundle: true, format: 'esm', platform: 'browser', target: 'es2022', external: ['node:module'], minify: false });
console.log('XML-Validator gebaut; Original-Regeln unverändert.');
