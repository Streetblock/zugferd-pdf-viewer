import assert from 'node:assert/strict';
import { deflateSync, inflateSync } from 'node:zlib';
import { makePdf } from './pdf-fixtures.mjs';

const xrefRow = (offset, generation, status) =>
    String(offset).padStart(10, '0') + ' ' + String(generation).padStart(5, '0') + ' ' + status + ' \n';

function replaceRequired(source, needle, replacement) {
    const updated = source.replace(needle, replacement);
    assert.notEqual(updated, source, 'Fixture mutation must change the source PDF.');
    return updated;
}

function findFooter(pdf) {
    const match = /\nstartxref\n(\d+)\n%%EOF\n$/.exec(pdf);
    assert.ok(match, 'Synthetic fixture has no terminal startxref.');
    return { footer: match.index + 1, xref: Number(match[1]) };
}

function editLastXref(pdf, edit) {
    const { xref } = findFooter(pdf);
    return pdf.slice(0, xref) + edit(pdf.slice(xref));
}

function rewriteXrefStream(pdf, encode, { filter = 'FlateDecode', parameters = '' } = {}) {
    return editLastXref(pdf, section => {
        const header = /^11 0 obj\n<< [^\n]+ \/Length (\d+) >>\nstream\n/.exec(section);
        assert.ok(header, 'Synthetic XRef stream header not found.');
        const dataStart = header[0].length;
        const dataEnd = dataStart + Number(header[1]);
        const decoded = inflateSync(Buffer.from(section.slice(dataStart, dataEnd), 'latin1'));
        const encoded = encode(decoded);
        return header[0].replace('/Filter /FlateDecode', '/Filter /' + filter)
            .replace('/Length ' + header[1], '/Length ' + encoded.length + parameters)
            + encoded.toString('latin1') + section.slice(dataEnd);
    });
}

function pngUpRows(decoded) {
    const columns = 7;
    assert.equal(decoded.length % columns, 0);
    const encoded = Buffer.alloc((decoded.length / columns) * (columns + 1));
    for (let row = 0; row < decoded.length / columns; row++) {
        const input = row * columns;
        const output = row * (columns + 1);
        encoded[output] = 2; // PNG Up predicts each byte from the preceding row.
        for (let i = 0; i < columns; i++) {
            const previous = row ? decoded[input - columns + i] : 0;
            encoded[output + 1 + i] = (decoded[input + i] - previous) & 0xff;
        }
    }
    return encoded;
}

function makeHybridIncremental(classic) {
    const mainXref = findFooter(classic).xref;
    // Reserve hidden object 8 in the main xref. The update's supplemental
    // XRef stream supplies its real entry, so old readers see it as free.
    let pdf = editLastXref(classic, section => {
        section = replaceRequired(section, 'xref\n0 8\n' + xrefRow(0, 65535, 'f'),
            'xref\n0 9\n' + xrefRow(8, 65535, 'f'));
        return replaceRequired(section, 'trailer\n<< /Size 8 ', xrefRow(0, 65535, 'f') + 'trailer\n<< /Size 9 ');
    });
    const id = /\/ID \[<[^>]+> <[^>]+>\]/.exec(pdf.slice(mainXref))?.[0];
    assert.ok(id);
    const appendStream = (number, dictionary, data) => {
        const offset = pdf.length;
        pdf += number + ' 0 obj\n<< ' + dictionary + ' /Length ' + data.length
            + ' >>\nstream\n' + data + '\nendstream\nendobj\n';
        return offset;
    };
    const objectStream = appendStream(9, '/Type /ObjStm /N 1 /First 4', '8 0 (hidden)');
    const supplemental = appendStream(10, '/Type /XRef /Size 11 /Index [8 1] /W [1 1 1]', '\x02\x09\x00');
    const latestXref = pdf.length;
    return pdf + 'xref\n9 2\n' + xrefRow(objectStream, 0, 'n') + xrefRow(supplemental, 0, 'n')
        + 'trailer\n<< /Size 11 /Root 1 0 R ' + id + ' /Prev ' + mainXref + ' /XRefStm ' + supplemental
        + ' >>\nstartxref\n' + latestXref + '\n%%EOF\n';
}

function appendXrefStreamUpdate(base, body, number, index, rows) {
    const previous = findFooter(base).xref;
    const id = /\/ID \[<[^>]+> <[^>]+>\]/.exec(base.slice(previous))?.[0];
    assert.ok(id);
    const pdf = base + body;
    const data = Buffer.alloc((rows.length + 1) * 4);
    for (const [row, [type, target, slot]] of [...rows, [1, pdf.length, 0]].entries()) {
        data[row * 4] = type;
        data.writeUInt16BE(target, row * 4 + 1);
        data[row * 4 + 3] = slot;
    }
    return pdf + number + ' 0 obj\n<< /Type /XRef /Size ' + (number + 1) + ' /Root 1 0 R ' + id + ' /Prev ' + previous
        + ' /Index [' + index + '] /W [1 2 1] /Length ' + data.length + ' >>\nstream\n' + data.toString('latin1')
        + '\nendstream\nendobj\nstartxref\n' + pdf.length + '\n%%EOF\n';
}

function makeStreamIncremental(base) {
    return appendXrefStreamUpdate(base, '12 0 obj\n(added in a later revision)\nendobj\n', 13, '12 2', [[1, base.length, 0]]);
}

function makeStaleObjectStreamUpdate(base) {
    // Object 4 still points to slot 0 in object stream 10, whose update now
    // contains only the new object 12. Both historical sections are readable.
    const data = '12 0 (replacement)';
    const body = '10 0 obj\n<< /Type /ObjStm /N 1 /First 5 /Length ' + data.length
        + ' >>\nstream\n' + data + '\nendstream\nendobj\n';
    return appendXrefStreamUpdate(base, body, 13, '10 1 12 2', [[1, base.length, 0], [2, 10, 0]]);
}

export function makePdfaStructureCases(xml) {
    const classic = Buffer.from(makePdf(xml)).toString('latin1');
    const stream = Buffer.from(makePdf(xml, { objectStream: true })).toString('latin1');
    const incremental = Buffer.from(makePdf(xml, { incremental: true })).toString('latin1');
    const hybrid = makeHybridIncremental(classic);
    const object6 = classic.indexOf('\n6 0 obj\n') + 1;
    const object7 = classic.indexOf('\n7 0 obj\n') + 1;
    assert.ok(object6 > 0 && object7 > object6);

    const cases = [
        ['classic table', classic, { '6.1.4-2': 'pass', 'PDF-XREF-TABLE': 'pass', 'PDF-XREF-ENTRY': 'pass' }],
        ['xref and object stream', stream, { 'PDF-XREF-STREAM': 'pass', 'PDF-OBJECT-STREAM': 'pass' }],
        ['xref stream with Flate and PNG Up predictor', rewriteXrefStream(stream, decoded => deflateSync(pngUpRows(decoded)),
            { parameters: ' /DecodeParms << /Predictor 12 /Columns 7 >>' }),
            { 'PDF-XREF-STREAM': 'pass', 'PDF-OBJECT-STREAM': 'pass' }],
        ['xref stream with a filter outside the inspection', rewriteXrefStream(stream,
            decoded => Buffer.from(decoded.toString('hex') + '>', 'ascii'), { filter: 'ASCIIHexDecode' }),
            { 'PDF-XREF-TARGET': 'pass', 'PDF-XREF-STREAM': 'unknown', 'PDF-OBJECT-STREAM': 'unknown' }],
        ['incremental table update', incremental, { 'PDF-XREF-PREV': 'pass' }],
        ['incremental xref stream update', makeStreamIncremental(stream), { 'PDF-XREF-PREV': 'pass', 'PDF-XREF-STREAM': 'pass', 'PDF-OBJECT-STREAM': 'pass' }],
        ['hybrid incremental update', hybrid, { 'PDF-XREF-PREV': 'pass', 'PDF-XREF-STREAM': 'pass', 'PDF-OBJECT-STREAM': 'pass' }],
        ['space after xref', editLastXref(classic, section => replaceRequired(section, 'xref\n', 'xref \n')),
            { '6.1.4-2': 'fail' }],
        ['oversized classic row', editLastXref(classic, section => replaceRequired(section, xrefRow(object6, 0, 'n'), xrefRow(object6, 0, 'n').replace(' \n', '  \n'))),
            { 'PDF-XREF-TABLE': 'fail' }],
        ['offset points to a different indirect object', editLastXref(classic, section => replaceRequired(section, xrefRow(object6, 0, 'n'), xrefRow(object7, 0, 'n'))),
            { 'PDF-XREF-ENTRY': 'fail' }],
        ['startxref points into header', replaceRequired(classic, /\nstartxref\n\d+\n/, '\nstartxref\n1\n'),
            { 'PDF-XREF-TARGET': 'fail' }],
        ['invalid xref field widths', editLastXref(stream, section => replaceRequired(section, '/W [1 4 2]', '/W [1 4 2 0]')),
            { 'PDF-XREF-STREAM': 'fail' }],
        ['overlapping xref index ranges', editLastXref(stream, section => replaceRequired(section, '/Size 12', '/Size 12 /Index [0 11 10 1]')),
            { 'PDF-XREF-STREAM': 'fail' }],
        ['extra decoded xref byte', rewriteXrefStream(stream, decoded => deflateSync(Buffer.concat([decoded, Buffer.of(0)]))),
            { 'PDF-XREF-STREAM': 'fail' }],
        ['object stream count exceeds header pairs', replaceRequired(stream, '/N 1 /First 4', '/N 2 /First 4'),
            { 'PDF-OBJECT-STREAM': 'fail' }],
        ['object stream first offset splits header', replaceRequired(stream, '/N 1 /First 4', '/N 1 /First 1'),
            { 'PDF-OBJECT-STREAM': 'fail' }],
        ['xref and object stream disagree on compressed object number', replaceRequired(stream, '\nstream\n4 0 <<', '\nstream\n8 0 <<'),
            { 'PDF-OBJECT-STREAM': 'fail' }],
        ['replaced object stream invalidates inherited compressed slot', makeStaleObjectStreamUpdate(stream),
            { 'PDF-OBJECT-STREAM': 'fail' }],
        ['incremental Prev cycle', editLastXref(incremental, section => replaceRequired(section, /\/Prev \d+/, '/Prev ' + findFooter(incremental).xref)),
            { 'PDF-XREF-PREV': 'fail' }],
        ['incremental Prev has invalid target', editLastXref(incremental, section => replaceRequired(section, /\/Prev \d+/, '/Prev 1')),
            { 'PDF-XREF-PREV': 'fail' }],
    ];
    return cases.map(([name, pdf, expect]) => ({ name, bytes: Buffer.from(pdf, 'latin1'), expect }));
}
