import { readFile } from 'node:fs/promises';

export const referencePdf = await readFile(new URL('fixtures/verapdf-3b-6-8-t02-pass-a.pdf', import.meta.url));
export const referenceSha256 = '5b8fdee7090f0a0fb7266d10dd0f6f1f8a37d286e3c06b1aa82e01d6d4f0a8a4';
const latin1 = referencePdf.toString('latin1');
const badComment = Buffer.from(referencePdf);
badComment[10] = 0x41;

export const pdfaCases = [
    ['reference 3b', referencePdf, null],
    ['displaced header', Buffer.concat([Buffer.from('JUNK\n'), referencePdf]), '6.1.2-1'],
    ['short binary comment', badComment, '6.1.2-2'],
    ['missing ID', Buffer.from(latin1.replace('\r\n/ID [', '\r\n/XX ['), 'latin1'), '6.1.3-1'],
    ['malformed ID', Buffer.from(latin1.replace(/\/ID \[<[A-F0-9]+> <[A-F0-9]+>\]/, '/ID [<AB> 0]'), 'latin1'), '6.1.3-1'],
    ['Encrypt key', Buffer.from(latin1.replace('\r\n/ID [', '\r\n/Encrypt null\r\n/ID ['), 'latin1'), '6.1.3-2'],
    ['trailing data', Buffer.concat([referencePdf, Buffer.from('\ntrailing data')]), '6.1.3-3'],
    ['bare trailing marker', Buffer.concat([referencePdf, Buffer.from('\n%%EOF\n')]), '6.1.3-3'],
];
