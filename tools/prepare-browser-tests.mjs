import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { cases } from '../tests/xml-cases.mjs';
const root = new URL('../.test-artifacts/browser/', import.meta.url);
await mkdir(root, { recursive: true });
const xml = await readFile(new URL('../tests/fixtures/invoice.xml', import.meta.url), 'utf8');
for (const c of cases) await writeFile(new URL(c.name.replaceAll(' ', '-') + '.xml', root), c.edit(xml));
console.log('Synthetische Browser-Testdateien: .test-artifacts/browser/');
