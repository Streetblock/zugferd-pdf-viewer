// Development only: generate a report to compare future JS engines against Mustang.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { checkValidator, validate, MAX_BYTES } from './mustang.mjs';

const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error('Aufruf: npm run reference -- rechnung.pdf bericht.json');
if (path.resolve(input) === path.resolve(output)) throw new Error('Originaldatei darf nicht überschrieben werden.');
const kind = path.extname(input).toLowerCase().slice(1);
if (!['xml', 'pdf'].includes(kind)) throw new Error('PDF- oder XML-Datei erforderlich.');
if (!await checkValidator()) throw new Error('Mustang 2.26.0 und JDK 17+ erforderlich; siehe README.');
const bytes = await readFile(input);
if (!bytes.length || bytes.length > MAX_BYTES) throw new Error('Dateigröße muss zwischen 1 Byte und 20 MB liegen.');
const result = await validate(bytes, kind);
result.sourceFilename = path.basename(input);
await writeFile(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(`Referenzbericht gespeichert: ${output}`);
