import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { makePdf } from './pdf-fixtures.mjs';

// Original test font drawn for this suite with FontTools FontBuilder.
// 1000 UPEM, glyph order [.notdef, A, space]. Glyph 0 is a box, glyph 1
// is a triangle, and glyph 2 has an intentionally empty outline. Advances
// are 600, with cmap 32 -> space and 65 -> A. No third-party font data.
const trueType = Buffer.from([
    'AAEAAAAKAIAAAwAgT1MvMkUARDUAAAEoAAAAYGNtYXAAdQBbAAABkAAAADxnbHlmPy5VuQAAAdQAAAAwaGVhZBWB',
    'ZpwAAACsAAAANmhoZWEFKgHiAAAA5AAAACRobXR4AoAAAAAAAYgAAAAIbG9jYQAYACQAAAHMAAAACG1heHAABQAG',
    'AAABCAAAACBuYW1l93LolgAAAgQAAACxcG9zdAApAAMAAAK4AAAAKAABAAAAAQAAcojEtF8PPPUAAwPoAAAAANox',
    'kYAAAAAA2jGRgAAAAAACCAK8AAAAAwACAAAAAAAAAAEAAAMg/zgAAAJYAAAAUAIIAAEAAAAAAAAAAAAAAAAAAAAB',
    'AAEAAAADAAQAAQAAAAAAAgAAAAAAAAAAAAAAAAAAAAAAAwJYAZAABQAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAPz8/PwAAACAAQQMg/zgAAAMgAMgAAAAAAAAAAAAAAAAAAAAgAAACWAAA',
    'ACgAAAAAAAIAAAADAAAAFAADAAEAAAAUAAQAKAAAAAYABAABAAIAIABB//8AAAAgAEH////i/8AAAQAAAAAAAAAA',
    'AAwAGAAYAAEAAAAAAfQCvAADAAAxESERAfQCvP1EAAEAKAAAAggCvAACAAAzExMo8PACvP1EAAAACABmAAEAAAAA',
    'AAEACgAAAAEAAAAAAAIABwAKAAEAAAAAAAQACgAAAAEAAAAAAAYACAARAAMAAQQJAAEAFAAZAAMAAQQJAAIADgAt',
    'AAMAAQQJAAQAFAAZAAMAAQQJAAYAEAA7UERGL0EgVGVzdFJlZ3VsYXJQZGZhVGVzdABQAEQARgAvAEEAIABUAGUA',
    'cwB0AFIAZQBnAHUAbABhAHIAUABkAGYAYQBUAGUAcwB0AAAAAAIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'AAAAAwAAACQAAw==',
].join(''), 'base64');
assert.equal(trueType.length, 736, 'Synthetic TrueType fixture must retain its original bytes.');

const standardFont = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';

function stream(data, entries = '', compressed = false) {
    const bytes = Buffer.from(data);
    const payload = compressed ? deflateSync(bytes) : bytes;
    const filter = compressed ? ' /Filter /FlateDecode' : '';
    return `<< /Length ${payload.length} ${entries}${filter} >>\nstream\n${payload.toString('latin1')}\nendstream`;
}

function appendRevision(base, entries) {
    let pdf = Buffer.from(base).toString('latin1');
    const footer = /\nstartxref\n(\d+)\n%%EOF\n$/.exec(pdf);
    assert.ok(footer, 'Base fixture must contain a classic xref footer.');
    const previous = Number(footer[1]);
    const fileId = /\/ID \[<[^>]+> <[^>]+>\]/.exec(pdf.slice(previous))?.[0];
    assert.ok(fileId, 'Base fixture must contain a file ID.');
    const rows = [];
    for (const [number, body] of [...entries].sort(([a], [b]) => a - b)) {
        rows.push(`${number} 1\n${String(pdf.length).padStart(10, '0')} 00000 n \n`);
        pdf += `${number} 0 obj\n${body}\nendobj\n`;
    }
    const offset = pdf.length;
    const size = Math.max(...entries.keys(), 7) + 1;
    return Buffer.from(pdf + `xref\n${rows.join('')}trailer\n<< /Size ${size} /Root 1 0 R ${fileId} /Prev ${previous} >>\nstartxref\n${offset}\n%%EOF\n`, 'latin1');
}

function addCidFont(entries, { mappedGlyph, compressed }) {
    const cmap = `/CIDInit /ProcSet findresource begin
12 dict begin
begincmap
/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def
/CMapName /PdfaTest-UCS def
/CMapType 2 def
1 begincodespacerange
<0000> <FFFF>
endcodespacerange
3 beginbfchar
<0001> <${mappedGlyph === 2 ? '0020' : '0041'}>
<0002> <0020>
<0003> <0042>
endbfchar
endcmap
CMapName currentdict /CMap defineresource pop
end
end`;
    entries.set(9, '<< /Type /Font /Subtype /Type0 /BaseFont /PdfaTest /Encoding /Identity-H /DescendantFonts [10 0 R] /ToUnicode 15 0 R >>');
    entries.set(10, '<< /Type /Font /Subtype /CIDFontType2 /BaseFont /PdfaTest '
        + '/CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor 11 0 R /DW 600 '
        + '/CIDToGIDMap ' + (mappedGlyph === undefined ? '/Identity' : '12 0 R') + ' >>');
    entries.set(11, '<< /Type /FontDescriptor /FontName /PdfaTest /Flags 4 /FontBBox [0 0 520 700] '
        + '/ItalicAngle 0 /Ascent 800 /Descent -200 /CapHeight 700 /StemV 80 /FontFile2 13 0 R >>');
    if (mappedGlyph !== undefined) {
        const mapping = Buffer.alloc(4);
        mapping.writeUInt16BE(mappedGlyph, 2);
        entries.set(12, stream(mapping, '', compressed));
    }
    entries.set(13, stream(trueType, '/Length1 ' + trueType.length, compressed));
    entries.set(15, stream(cmap, '', compressed));
}

// Each document retains the same invoice and XMP as the established PDF fixture.
// The page, fonts and streams are introduced by a real incremental revision.
export function makePdfaFontFixture(xml, {
    font = 'standard',
    mode = 0,
    cid = 1,
    mappedGlyph,
    missingCharProc = false,
    placement = 'page',
    compressed = false,
    missingResource = false,
    content,
} = {}) {
    const glyph = font === 'cid' ? `<${cid.toString(16).padStart(4, '0')}>` : '(A)';
    const text = content ?? `BT /F1 12 Tf ${mode ? mode + ' Tr ' : ''}20 100 Td ${glyph} Tj ET`;
    const resources = `<< /Font << /F1 ${missingResource ? 99 : 9} 0 R >> >>`;
    let pageResources = '/Resources ' + resources;
    const entries = new Map();
    if (placement === 'inherited') {
        entries.set(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 /Resources ' + resources + ' >>');
        pageResources = '';
    }
    if (placement === 'form' || placement === 'unusedForm') {
        // Different fonts share the resource key F1 in two separate scopes.
        entries.set(14, stream(text, '/Type /XObject /Subtype /Form /BBox [0 0 200 200] /Resources ' + resources, compressed));
        entries.set(16, standardFont);
        pageResources = '/Resources << /Font << /F1 16 0 R >> /XObject << /Fm 14 0 R >> >>';
    }
    entries.set(3, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 8 0 R ' + pageResources + ' >>');
    const pageContents = placement === 'form' ? 'q /Fm Do Q' : placement === 'unusedForm' ? 'q Q' : text;
    entries.set(8, stream(pageContents, '', compressed));
    if (font === 'cid') {
        addCidFont(entries, { mappedGlyph, compressed });
    } else if (font === 'type3') {
        entries.set(9, '<< /Type /Font /Subtype /Type3 /Name /PdfaTest3 /FontBBox [0 0 520 700] '
            + '/FontMatrix [0.001 0 0 0.001 0 0] /Encoding << /Type /Encoding /Differences [65 /A] >> '
            + '/FirstChar 65 /LastChar 65 /Widths [600] /Resources << >> /CharProcs << '
            + (missingCharProc ? '' : '/A 12 0 R') + ' >> >>');
        if (!missingCharProc) entries.set(12, stream('600 0 0 0 520 700 d1 0 0 520 700 re f'));
    } else {
        entries.set(9, standardFont);
    }
    return appendRevision(makePdf(xml), entries);
}

export function makePdfaFontCases(xml) {
    const cases = [
        ['visible Standard 14 font still requires embedding', {}, { '6.2.11.4.1-1': 'fail' }],
        ['font resource without a text-show operator', { content: 'q 0 0 10 10 re S Q' },
            { '6.2.11.4.1-1': 'not-applicable', '6.2.11.4.1-2': 'not-applicable' }],
        ['setting a font and showing an empty string does not use a glyph', { content: 'BT /F1 12 Tf () Tj ET' },
            { '6.2.11.4.1-1': 'not-applicable', '6.2.11.4.1-2': 'not-applicable' }],
        ['rendering mode 3 is exempt from embedding and glyph presence', { mode: 3 },
            { '6.2.11.4.1-1': 'not-applicable', '6.2.11.4.1-2': 'not-applicable' }],
        ['text that contributes only to the clipping path still uses the font', { mode: 7 },
            { '6.2.11.4.1-1': 'fail' }],
        ['invisible use does not exempt a later visible use', {
            content: 'BT /F1 12 Tf 3 Tr (A) Tj 0 Tr [(B) -20 (C)] TJ ET',
        }, { '6.2.11.4.1-1': 'fail' }],
        ['restoring the graphics state restores visible text rendering', {
            content: 'q BT /F1 12 Tf 3 Tr (A) Tj ET Q BT /F1 12 Tf (B) Tj ET',
        }, { '6.2.11.4.1-1': 'fail' }],
        ['a broken font resource remains open', { missingResource: true },
            { '6.2.11.4.1-1': 'unknown', '6.2.11.4.1-2': 'unknown' }],
        ['inherited page resources resolve a font that is actually shown', { placement: 'inherited' },
            { '6.2.11.4.1-1': 'fail' }],
        ['uninvoked Form XObject does not use its declared font', { placement: 'unusedForm' },
            { '6.2.11.4.1-1': 'not-applicable', '6.2.11.4.1-2': 'not-applicable' }],
        ['embedded CID TrueType with an Identity glyph mapping', { font: 'cid' },
            { '6.2.11.4.1-1': 'pass', '6.2.11.4.1-2': 'pass', '6.2.11.8-1': 'pass' }],
        ['CID references a glyph beyond the original font glyph count', { font: 'cid', cid: 3 },
            { '6.2.11.4.1-1': 'pass', '6.2.11.4.1-2': 'fail' }],
        ['an explicit compressed mapping can address a legitimate empty glyph', { font: 'cid', mappedGlyph: 2, compressed: true },
            { '6.2.11.4.1-1': 'pass', '6.2.11.4.1-2': 'pass', '6.2.11.8-1': 'pass' }],
        ['an explicit mapping cannot address a nonexisting glyph', { font: 'cid', mappedGlyph: 3 },
            { '6.2.11.4.1-2': 'fail' }],
        ['an explicit mapping to glyph zero selects .notdef', { font: 'cid', mappedGlyph: 0 },
            { '6.2.11.8-1': 'fail' }],
        ['even invisible text must not select .notdef', { font: 'cid', mappedGlyph: 0, mode: 3 },
            { '6.2.11.4.1-1': 'not-applicable', '6.2.11.4.1-2': 'not-applicable', '6.2.11.8-1': 'fail' }],
        ['Form XObject uses its local font resources', { font: 'cid', placement: 'form', compressed: true },
            { '6.2.11.4.1-1': 'pass', '6.2.11.4.1-2': 'pass' }],
        ['Type 3 glyph is defined by its embedded character procedure', { font: 'type3' },
            { '6.2.11.4.1-1': 'pass', '6.2.11.4.1-2': 'pass' }],
        ['used Type 3 glyph has no character procedure', { font: 'type3', missingCharProc: true },
            { '6.2.11.4.1-2': 'fail' }],
    ];
    return cases.map(([name, options, expect]) => ({ name, bytes: makePdfaFontFixture(xml, options), expect }));
}
