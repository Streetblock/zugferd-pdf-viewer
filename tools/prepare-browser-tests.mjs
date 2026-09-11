import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { cases } from '../tests/xml-cases.mjs';
import { profileCases } from '../tests/profile-cases.mjs';
import { xrechnungCases } from '../tests/xrechnung-cases.mjs';
const root = new URL('../.test-artifacts/browser/', import.meta.url);
await mkdir(root, { recursive: true });
const xml = await readFile(new URL('../tests/fixtures/invoice.xml', import.meta.url), 'utf8');
for (const c of cases) await writeFile(new URL(c.name.replaceAll(' ', '-') + '.xml', root), c.edit(xml));
for (const c of profileCases) {
    const source = await readFile(new URL('../tests/fixtures/' + c.fixture, import.meta.url), 'utf8');
    await writeFile(new URL(c.name.replaceAll(' ', '-') + '.xml', root), c.edit(source));
}
console.log('Synthetische Browser-Testdateien: .test-artifacts/browser/');
const xr = await readFile(new URL('../tests/fixtures/invoice-xrechnung.xml', import.meta.url), 'utf8');
for (const c of xrechnungCases) await writeFile(new URL(c.name.replaceAll(' ', '-') + '.xml', root), c.edit(xr));
