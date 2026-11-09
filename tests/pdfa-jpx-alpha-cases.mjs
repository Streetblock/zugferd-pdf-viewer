import { appendPdfRevision, makePdf } from './pdf-fixtures.mjs';
import { deflateSync } from 'node:zlib';

// Generated with Pillow/OpenJPEG 2.5.4 as 1x1 lossless images, then decoded
// to verify their RGBA (255,0,0,128), RGB (255,0,0), and LA (128,128) pixels.
// The premultiplied sample contains (128,0,0,128); its cdef type is set below.
const samples = {
    rgba: Buffer.from('AAAADGpQICANCocKAAAAFGZ0eXBqcDIgAAAAAGpwMiAAAABPanAyaAAAABZpaGRyAAAAAQAAAAEABAcHAAAAAAAPY29scgEAAAAAABAAAAAiY2RlZgAEAAAAAAABAAEAAAACAAIAAAADAAMAAQAAAAAAlmpwMmP/T/9RADIAAAAAAAEAAAABAAAAAAAAAAAAAAABAAAAAQAAAAAAAAAAAAQHAQEHAQEHAQEHAQH/UgAMAAAAAQAABAQAAf9cAARAQP9kACUAAUNyZWF0ZWQgYnkgT3BlbkpQRUcgdmVyc2lvbiAyLjUuNP+QAAoAAAAAABsAAf+Tz7QEAN+ACAffgAgHgP/Z', 'base64'),
    rgb: Buffer.from('AAAADGpQICANCocKAAAAFGZ0eXBqcDIgAAAAAGpwMiAAAAAtanAyaAAAABZpaGRyAAAAAQAAAAEAAwcHAAAAAAAPY29scgEAAAAAABAAAACSanAyY/9P/1EALwAAAAAAAQAAAAEAAAAAAAAAAAAAAAEAAAABAAAAAAAAAAAAAwcBAQcBAQcBAf9SAAwAAAABAAAEBAAB/1wABEBA/2QAJQABQ3JlYXRlZCBieSBPcGVuSlBFRyB2ZXJzaW9uIDIuNS40/5AACgAAAAAAGgAB/5PPtAQA34AIB9+ACAf/2Q==', 'base64'),
    la: Buffer.from('AAAADGpQICANCocKAAAAFGZ0eXBqcDIgAAAAAGpwMiAAAABDanAyaAAAABZpaGRyAAAAAQAAAAEAAgcHAAAAAAAPY29scgEAAAAAABEAAAAWY2RlZgACAAAAAAABAAEAAQAAAAAAhWpwMmP/T/9RACwAAAAAAAEAAAABAAAAAAAAAAAAAAABAAAAAQAAAAAAAAAAAAIHAQEHAQH/UgAMAAAAAQAABAQAAf9cAARAQP9kACUAAUNyZWF0ZWQgYnkgT3BlbkpQRUcgdmVyc2lvbiAyLjUuNP+QAAoAAAAAABAAAf+TgID/2Q==', 'base64'),
    premultiplied: Buffer.from('AAAADGpQICANCocKAAAAFGZ0eXBqcDIgAAAAAGpwMiAAAABPanAyaAAAABZpaGRyAAAAAQAAAAEABAcHAAAAAAAPY29scgEAAAAAABAAAAAiY2RlZgAEAAAAAAABAAEAAAACAAIAAAADAAMAAQAAAAAAk2pwMmP/T/9RADIAAAAAAAEAAAABAAAAAAAAAAAAAAABAAAAAQAAAAAAAAAAAAQHAQEHAQEHAQEHAQH/UgAMAAAAAQAABAQAAf9cAARAQP9kACUAAUNyZWF0ZWQgYnkgT3BlbkpQRUcgdmVyc2lvbiAyLjUuNP+QAAoAAAAAABgAAf+TgN+ACAffgAgHgP/Z', 'base64'),
};
const calRgb = '[/CalRGB << /WhitePoint [0.95047 1 1.08883] >>]';
const calGray = '[/CalGray << /WhitePoint [0.95047 1 1.08883] >>]';

export function jpxAlphaSampleBytes(sample = 'rgba') {
    return Buffer.from(samples[sample]);
}

function box(type, payload) {
    const header = Buffer.alloc(8);
    header.writeUInt32BE(payload.length + 8);
    header.write(type, 4, 'ascii');
    return Buffer.concat([header, payload]);
}

function boxes(data) {
    const result = [];
    for (let offset = 0; offset < data.length;) {
        const length = data.readUInt32BE(offset);
        result.push({ type: data.toString('ascii', offset + 4, offset + 8), payload: data.subarray(offset + 8, offset + length) });
        offset += length;
    }
    return result;
}

function headerBox(data, type, transform) {
    return Buffer.concat(boxes(data).map(entry => {
        if (entry.type !== 'jp2h') return box(entry.type, entry.payload);
        const children = boxes(entry.payload);
        const current = children.find(child => child.type === type);
        const payload = transform(current?.payload);
        const rest = children.map(child => child.type === type
            ? (payload ? box(type, payload) : null)
            : box(child.type, child.payload)).filter(Boolean);
        if (!current && payload) rest.push(box(type, payload));
        return box('jp2h', Buffer.concat(rest));
    }));
}

function definitions(data, entries) {
    const payload = Buffer.alloc(2 + 6 * entries.length);
    payload.writeUInt16BE(entries.length);
    for (const [index, values] of entries.entries()) {
        for (const [column, value] of values.entries()) payload.writeUInt16BE(value, 2 + index * 6 + column * 2);
    }
    return headerBox(data, 'cdef', () => payload);
}

function stream(data, dictionary = '') {
    const bytes = Buffer.from(data, 'latin1');
    return `<< ${dictionary} /Length ${bytes.length} >>\nstream\n${bytes.toString('latin1')}\nendstream`;
}

export function makePdfaJpxAlphaFixture(xml, {
    sample = 'rgba', data = samples[sample], mode = '1', pageGroup = true,
    filter = '/JPXDecode', compressed = false, imageEntries = '', extraObjects = [], width = 1, height = 1,
} = {}) {
    const colorSpace = sample === 'la' ? calGray : calRgb;
    const payload = compressed ? deflateSync(data) : data;
    const streamFilter = compressed ? '[/FlateDecode /JPXDecode]' : filter;
    const entries = new Map([
        [3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Resources << /XObject << /Im 17 0 R >> >> /Contents 16 0 R
            ${pageGroup ? `/Group << /S /Transparency /CS ${calRgb} >>` : ''} >>`],
        [16, stream('/Im Do')],
        [17, stream(payload, `/Type /XObject /Subtype /Image /Width ${width} /Height ${height} /BitsPerComponent 8 /ColorSpace ${colorSpace}
            ${streamFilter ? '/Filter ' + streamFilter : ''} ${mode === null ? '' : '/SMaskInData ' + mode} ${imageEntries}`)],
        ...extraObjects,
    ]);
    return appendPdfRevision(makePdf(xml), entries);
}

const alpha = 'PDF-JPX-ALPHA';
const page = '6.2.10-2';

export function makePdfaJpxAlphaCases(xml) {
    const colors = [[0, 0, 1], [1, 0, 2], [2, 0, 3]];
    const whole = [...colors, [3, 1, 0]];
    const premultiplied = definitions(samples.premultiplied, [...colors, [3, 2, 0]]);
    const codestream = boxes(samples.rgba).find(entry => entry.type === 'jp2c').payload;
    const separateMask = stream(Buffer.of(128),
        '/Type /XObject /Subtype /Image /Width 1 /Height 1 /BitsPerComponent 8 /ColorSpace /DeviceGray');
    const invalidSignature = Buffer.from(samples.rgba); invalidSignature[8] = 0;
    const incorrectWidth = headerBox(samples.rgba, 'ihdr', payload => {
        const changed = Buffer.from(payload); changed.writeUInt32BE(2, 4); return changed;
    });
    const headerWithoutAlpha = headerBox(samples.rgba, 'cdef', () => null);
    const incompleteRecord = headerBox(samples.rgba, 'cdef', payload => payload.subarray(0, -1));
    const jpxBrand = Buffer.concat(boxes(samples.rgba).map(entry => box(entry.type,
        entry.type === 'ftyp' ? Buffer.from('jpx \x00\x00\x00\x00jpx ', 'latin1') : entry.payload)));
    const extendedHeader = Buffer.concat(boxes(samples.rgba).map(entry => {
        if (entry.type !== 'jp2h') return box(entry.type, entry.payload);
        const extended = Buffer.alloc(16); extended.writeUInt32BE(1); extended.write('jp2h', 4); extended.writeBigUInt64BE(BigInt(entry.payload.length + 16), 8);
        return Buffer.concat([extended, entry.payload]);
    }));
    const unboundedCodestream = Buffer.concat(boxes(samples.rgba).map(entry => {
        const bytes = box(entry.type, entry.payload);
        if (entry.type === 'jp2c') bytes.writeUInt32BE(0);
        return bytes;
    }));
    const zeroLengthHeaderChild = Buffer.concat(boxes(samples.rgba).map(entry => {
        if (entry.type !== 'jp2h') return box(entry.type, entry.payload);
        return box('jp2h', Buffer.concat(boxes(entry.payload).map(child => {
            const bytes = box(child.type, child.payload);
            if (child.type === 'cdef') bytes.writeUInt32BE(0);
            return bytes;
        })));
    }));
    const extendedSignature = Buffer.alloc(20);
    extendedSignature.writeUInt32BE(1);
    extendedSignature.write('jP  ', 4);
    extendedSignature.writeBigUInt64BE(20n, 8);
    extendedSignature.writeUInt32BE(0x0d0a870a, 16);
    let signedAlpha = headerBox(samples.rgba, 'ihdr', payload => {
        const changed = Buffer.from(payload); changed[10] = 255; return changed;
    });
    signedAlpha = headerBox(signedAlpha, 'bpcc', () => Buffer.of(7, 7, 7, 135));
    signedAlpha = Buffer.concat(boxes(signedAlpha).map(entry => {
        const payload = Buffer.from(entry.payload);
        if (entry.type === 'jp2c') payload[51] = 135;
        return box(entry.type, payload);
    }));
    const cases = [
        ['straight RGBA JP2 alpha is supported with a calibrated page group', {}, { [alpha]: 'pass', [page]: 'pass' }],
        ['Flate-wrapped JP2 retains its original alpha mapping', { compressed: true }, { [alpha]: 'pass', [page]: 'pass' }],
        ['straight JP2 alpha requires the enclosing page blending space', { pageGroup: false }, { [alpha]: 'pass', [page]: 'fail' }],
        ['gray plus alpha JP2 has one color and one opacity channel', { sample: 'la' }, { [alpha]: 'pass', [page]: 'pass' }],
        ['mode 2 JP2 declares a premultiplied opacity channel', { sample: 'premultiplied', data: premultiplied, mode: '2' }, { [alpha]: 'pass', [page]: 'pass' }],
        ['mode zero ignores encoded alpha and introduces no transparency', { mode: '0', pageGroup: false }, { [alpha]: 'pass', [page]: 'not-applicable' }],
        ['absent SMaskInData ignores encoded alpha by default', { mode: null, pageGroup: false }, { [alpha]: 'not-applicable', [page]: 'not-applicable' }],
        ['the JPX embedded-alpha mode must be zero one or two', { mode: '3' }, { [alpha]: 'fail' }],
        ['nonzero embedded alpha excludes a separate image soft mask',
            { imageEntries: '/SMask 18 0 R', extraObjects: [[18, separateMask]] },
            { [alpha]: 'pass', 'PDF-SOFT-MASK': 'fail' }],
        ['mode zero permits a separate image soft mask',
            { mode: '0', imageEntries: '/SMask 18 0 R', extraObjects: [[18, separateMask]] },
            { [alpha]: 'pass', 'PDF-SOFT-MASK': 'pass', [page]: 'pass' }],
        ['an RGB JP2 cannot supply a declared opacity channel', { sample: 'rgb' }, { [alpha]: 'fail' }],
        ['mode 2 with a straight-alpha declaration stays open', { mode: '2', pageGroup: false }, { [alpha]: 'unknown', [page]: 'unknown' }],
        ['mode 1 with a premultiplied-alpha declaration stays open', { data: premultiplied, pageGroup: false }, { [alpha]: 'unknown', [page]: 'unknown' }],
        ['one alpha channel may explicitly cover every RGB color association',
            { data: definitions(samples.rgba, [...colors, [3, 1, 1], [3, 1, 2], [3, 1, 3]]) }, { [alpha]: 'pass' }],
        ['identical descriptions of the same alpha channel are allowed',
            { data: definitions(samples.rgba, [...whole, [3, 1, 0]]) }, { [alpha]: 'pass' }],
        ['mixed channel roles remain outside the supported mapping',
            { data: definitions(samples.rgba, [...whole, [3, 2, 0]]) }, { [alpha]: 'unknown' }],
        ['an embedded opacity channel must have unsigned samples', { data: signedAlpha }, { [alpha]: 'fail' }],
        ['an alpha channel covering only red is incomplete',
            { data: definitions(samples.rgba, [...colors, [3, 1, 1]]) }, { [alpha]: 'fail' }],
        ['multiple distinct opacity channels cannot establish one image mask',
            { data: definitions(samples.rgba, [[0, 0, 1], [1, 0, 2], [2, 1, 0], [3, 1, 0]]) }, { [alpha]: 'fail' }],
        ['an out-of-range channel definition is malformed',
            { data: definitions(samples.rgba, [...colors, [4, 1, 0]]) }, { [alpha]: 'fail' }],
        ['a reserved channel type is malformed',
            { data: definitions(samples.rgba, [...colors, [3, 3, 0]]) }, { [alpha]: 'fail' }],
        ['an unspecified channel interpretation stays open',
            { data: definitions(samples.rgba, [...colors, [3, 65535, 65535]]) }, { [alpha]: 'unknown' }],
        ['a missing RGBA channel-definition box cannot prove opacity', { data: headerWithoutAlpha }, { [alpha]: 'fail' }],
        ['JP2 signature bytes must match the format identifier', { data: invalidSignature }, { [alpha]: 'fail' }],
        ['the fixed JP2 signature cannot use an extended box header',
            { data: Buffer.concat([extendedSignature, samples.rgba.subarray(12)]) }, { [alpha]: 'fail' }],
        ['a truncated box header cannot establish JP2 alpha metadata', { data: samples.rgba.subarray(0, 37) }, { [alpha]: 'fail' }],
        ['a truncated declared codestream box cannot pass alpha metadata checks', { data: samples.rgba.subarray(0, -1) }, { [alpha]: 'fail' }],
        ['channel-definition records must fit their box', { data: incompleteRecord }, { [alpha]: 'fail' }],
        ['image-header and codestream dimensions must agree', { data: incorrectWidth }, { [alpha]: 'fail' }],
        ['an extended-length JP2 header box can be inspected', { data: extendedHeader }, { [alpha]: 'pass' }],
        ['a final zero-length JP2 codestream box extends to the stream end', { data: unboundedCodestream }, { [alpha]: 'pass' }],
        ['a zero-length child cannot extend beyond a finite JP2 header',
            { data: zeroLengthHeaderChild }, { [alpha]: 'fail' }],
        ['JP2 uses the first codestream when further codestream boxes are present',
            { data: Buffer.concat([samples.rgba, box('jp2c', codestream)]) }, { [alpha]: 'pass' }],
        ['a palette requires channel mapping beyond this alpha inspection',
            { data: headerBox(samples.rgba, 'pclr', () => Buffer.of(0, 1, 1, 7, 0)) }, { [alpha]: 'unknown' }],
        ['component mapping keeps opacity interpretation open',
            { data: headerBox(samples.rgba, 'cmap', () => Buffer.of(0, 0, 0, 0)) }, { [alpha]: 'unknown' }],
        ['JPX branding requires a broader compositing model', { data: jpxBrand }, { [alpha]: 'unknown' }],
        ['JPX compositing layer metadata stays open', { data: Buffer.concat([samples.rgba, box('jplh', Buffer.alloc(0))]) }, { [alpha]: 'unknown' }],
        ['a raw JPEG 2000 codestream has no JP2 opacity declaration', { data: codestream }, { [alpha]: 'unknown' }],
        ['an image filter chain outside the direct JPX path stays open',
            { filter: '[/ASCIIHexDecode /JPXDecode]', data: Buffer.from(samples.rgba.toString('hex') + '>', 'ascii') }, { [alpha]: 'unknown' }],
        ['a reader-ignored filter cannot establish original JP2 bytes',
            { filter: '[/MadeUp /JPXDecode]' }, { [alpha]: 'unknown' }],
        ['an abbreviated reader filter cannot establish the declared JPX path',
            { filter: null, imageEntries: '/F /JPXDecode' }, { [alpha]: 'unknown' }],
        ['an unresolved embedded-alpha mode stays open', { mode: '99 0 R' }, { [alpha]: 'unknown' }],
        ['JP2 metadata beyond the inspection byte budget stays open',
            { data: Buffer.concat([samples.rgba, Buffer.alloc(4 * 1024 * 1024)]) }, { [alpha]: 'unknown' }],
    ];
    return cases.map(([name, options, expect]) => ({ name, bytes: makePdfaJpxAlphaFixture(xml, options), expect }));
}
