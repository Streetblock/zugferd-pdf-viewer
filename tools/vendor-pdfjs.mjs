import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import path from 'node:path';
const run = promisify(execFile);
const source = process.argv[2];
if (!source) throw new Error('Usage: node tools/vendor-pdfjs.mjs PATH_TO_PDFJS_FORK');
const git = async (...args) => (await run('git', ['-C', source, ...args])).stdout.trim();
if (await git('status', '--porcelain')) throw new Error('PDF.js working tree must be clean. Commit before building.');
const commit = await git('rev-parse', 'HEAD');
const destination = new URL('../vendor/pdfjs/', import.meta.url);
await mkdir(destination, { recursive: true });
const files = {};
for (const name of ['pdf.mjs', 'pdf.worker.mjs']) {
    let text = await readFile(path.join(source, 'build/generic-legacy/build', name), 'utf8');
    if (!text.includes(commit.slice(0, 9))) throw new Error('Build does not match committed PDF.js source: ' + name);
    // Source maps are not distributed. Runtime code remains unchanged.
    text = text.replace(/^\/\/# sourceMappingURL=.*$/gm, '');
    await writeFile(new URL(name, destination), text);
    files[name] = createHash('sha256').update(text).digest('hex');
}
await writeFile(new URL('LICENSE', destination), await readFile(path.join(source, 'LICENSE')));
await writeFile(new URL('NOTICE', destination), `PDF.js: Mozilla Foundation and contributors, Apache-2.0.\nStreetblock modifications (2026): read-only embedded-file and PDF/A structure inspection APIs.\nSource: https://github.com/Streetblock/pdf.js/tree/${commit}\nBuild: npm ci; npx gulp generic-legacy\nSource map comments removed; no runtime edits.\n`);
await writeFile(new URL('manifest.json', destination), JSON.stringify({ repository: 'https://github.com/Streetblock/pdf.js', commit, build: 'generic-legacy', files }, null, 2) + '\n');
console.log('Vendored PDF.js commit ' + commit);
