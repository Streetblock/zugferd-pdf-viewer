import assert from 'node:assert/strict';
import { jpxAlphaSampleBytes, makePdfaJpxAlphaFixture } from './pdfa-jpx-alpha-cases.mjs';

// Genuine 2x2 RGBA image with four 1x1 tiles, generated and decoded with
// Pillow/OpenJPEG 2.5.4 using lossless JPEG 2000 and one resolution level.
const tiled = Buffer.from('AAAADGpQICANCocKAAAAFGZ0eXBqcDIgAAAAAGpwMiAAAABPanAyaAAAABZpaGRyAAAAAgAAAAIABAcHAAAAAAAPY29scgEAAAAAABAAAAAiY2RlZgAEAAAAAAABAAEAAAACAAIAAAADAAMAAQAAAAAA52pwMmP/T/9RADIAAAAAAAIAAAACAAAAAAAAAAAAAAABAAAAAQAAAAAAAAAAAAQHAQEHAQEHAQEHAQH/UgAMAAAAAQAABAQAAf9cAARAQP9kACUAAUNyZWF0ZWQgYnkgT3BlbkpQRUcgdmVyc2lvbiAyLjUuNP+QAAoAAAAAABsAAf+Tz7QEAN+ACAffgAgHgP+QAAoAAQAAABsAAf+Tz7QEAN+ACAffgAgHgP+QAAoAAgAAABsAAf+Tz7QEAN+ACAffgAgHgP+QAAoAAwAAABsAAf+Tz7QEAN+ACAffgAgHgP/Z', 'base64');
// A genuine grayscale 1x1 opacity image, decoded after generation as L=128.
const grayMask = Buffer.from('AAAADGpQICANCocKAAAAFGZ0eXBqcDIgAAAAAGpwMiAAAAAtanAyaAAAABZpaGRyAAAAAQAAAAEAAQcHAAAAAAAPY29scgEAAAAAABEAAACBanAyY/9P/1EAKQAAAAAAAQAAAAEAAAAAAAAAAAAAAAEAAAABAAAAAAAAAAAAAQcBAf9SAAwAAAABAAAEBAAB/1wABEBA/2QAJQABQ3JlYXRlZCBieSBPcGVuSlBFRyB2ZXJzaW9uIDIuNS40/5AACgAAAAAADwAB/5OA/9k=', 'base64');

function jp2Box(type, payload) {
    const header = Buffer.alloc(8);
    header.writeUInt32BE(payload.length + 8);
    header.write(type, 4, 'ascii');
    return Buffer.concat([header, payload]);
}

function codestreamBox(jp2) {
    for (let offset = 0; offset < jp2.length;) {
        const length = jp2.readUInt32BE(offset);
        if (jp2.toString('ascii', offset + 4, offset + 8) === 'jp2c') return { offset, end: offset + length };
        offset += length;
    }
    throw new Error('The genuine JP2 fixture must contain a codestream box.');
}

function mainSegments(data) {
    const result = [];
    for (let offset = 2; offset < data.length;) {
        const marker = data.readUInt16BE(offset);
        if (marker === 0xff90 || marker === 0xffd9) break;
        const length = data.readUInt16BE(offset + 2);
        assert.ok(length >= 2 && offset + 2 + length <= data.length);
        result.push({ marker, offset, end: offset + 2 + length });
        offset += 2 + length;
    }
    return result;
}

function mainSegment(data, marker) {
    const found = mainSegments(data).find(entry => entry.marker === marker);
    assert.ok(found, 'The genuine codestream must contain the requested marker.');
    return found;
}

function firstTile(data) {
    return mainSegments(data).at(-1).end;
}

function removeSegment(data, marker) {
    const found = mainSegment(data, marker);
    return Buffer.concat([data.subarray(0, found.offset), data.subarray(found.end)]);
}

function tileParts(data) {
    const result = [];
    let offset = firstTile(data);
    while (data.readUInt16BE(offset) === 0xff90) {
        const length = data.readUInt32BE(offset + 6);
        assert.ok(length >= 14 && offset + length <= data.length);
        result.push(Buffer.from(data.subarray(offset, offset + length)));
        offset += length;
    }
    assert.equal(data.readUInt16BE(offset), 0xffd9);
    return result;
}

function insertTileHeaders(part, headers) {
    const modified = Buffer.from(part);
    modified.writeUInt32BE(part.length + headers.length, 6);
    return Buffer.concat([modified.subarray(0, 12), headers, modified.subarray(12)]);
}

function replaceTileParts(data, parts) {
    return Buffer.concat([data.subarray(0, firstTile(data)), ...parts, data.subarray(-2)]);
}

function appendMainHeaders(data, headers) {
    const start = firstTile(data);
    return Buffer.concat([data.subarray(0, start), headers, data.subarray(start)]);
}

function mutateCodestream(data, mutation) {
    const changed = Buffer.from(data);
    const sot = firstTile(data);
    const cod = mainSegment(data, 0xff52).offset;
    const qcd = mainSegment(data, 0xff5c).offset;
    const coc2 = Buffer.from('ff53000900000204040001', 'hex');
    const qcc2 = Buffer.from('ff5d000b004040404040404040', 'hex');
    const qcc0 = Buffer.from('ff5d0005004040', 'hex');
    const cod0 = changed.subarray(cod, mainSegment(data, 0xff52).end);
    switch (mutation) {
        case null: return changed;
        case 'missing-eoc': return changed.subarray(0, -2);
        case 'truncated-eoc': return changed.subarray(0, -1);
        case 'wrong-eoc': changed.writeUInt16BE(0xffd8, changed.length - 2); return changed;
        case 'trailing-data': return Buffer.concat([changed, Buffer.of(0)]);
        case 'short-psot': changed.writeUInt32BE(13, sot + 6); return changed;
        case 'wrong-psot': changed.writeUInt32BE(changed.readUInt32BE(sot + 6) + 1, sot + 6); return changed;
        case 'oversized-psot': changed.writeUInt32BE(0xffffffff, sot + 6); return changed;
        case 'zero-psot': changed.writeUInt32BE(0, sot + 6); return changed;
        case 'short-sot': changed.writeUInt16BE(9, sot + 2); return changed;
        case 'wrong-tile-index': changed.writeUInt16BE(99, sot + 4); return changed;
        case 'wrong-part-index': changed[sot + 10] = 1; return changed;
        case 'missing-part': changed[sot + 11] = 2; return changed;
        case 'unspecified-part-count': changed[sot + 11] = 0; return changed;
        case 'missing-sot': return Buffer.concat([changed.subarray(0, sot), changed.subarray(sot + 12)]);
        case 'missing-sod': {
            changed.writeUInt32BE(changed.readUInt32BE(sot + 6) - 2, sot + 6);
            return Buffer.concat([changed.subarray(0, sot + 12), changed.subarray(sot + 14)]);
        }
        case 'early-sod': return Buffer.concat([changed.subarray(0, cod), Buffer.of(0xff, 0x93), changed.subarray(sot + 14)]);
        case 'missing-cod': return removeSegment(changed, 0xff52);
        case 'missing-qcd': return removeSegment(changed, 0xff5c);
        case 'qcd-before-cod': {
            const entries = mainSegments(changed);
            const coding = entries.find(entry => entry.marker === 0xff52);
            const quantization = entries.find(entry => entry.marker === 0xff5c);
            const reordered = entries.map(entry => {
                const source = entry === coding ? quantization : entry === quantization ? coding : entry;
                return changed.subarray(source.offset, source.end);
            });
            return Buffer.concat([changed.subarray(0, 2), ...reordered, changed.subarray(sot)]);
        }
        case 'duplicate-cod': return appendMainHeaders(changed, cod0);
        case 'duplicate-qcd': return appendMainHeaders(changed, changed.subarray(qcd, mainSegment(data, 0xff5c).end));
        case 'reordered-tiles': return replaceTileParts(changed, tileParts(changed).reverse());
        case 'duplicate-tile': {
            const parts = tileParts(changed);
            return replaceTileParts(changed, [parts[0], ...parts]);
        }
        case 'empty-first-part':
        case 'part-sequence-gap': {
            const part = tileParts(changed)[0];
            const total = mutation === 'empty-first-part' ? 2 : 3;
            const empty = Buffer.concat([part.subarray(0, 12), Buffer.of(0xff, 0x93)]);
            empty.writeUInt32BE(14, 6);
            empty[10] = 0;
            empty[11] = total;
            part[10] = total - 1;
            part[11] = total;
            return replaceTileParts(changed, [empty, part]);
        }
        case 'main-coc-short-quantization': return appendMainHeaders(changed, coc2);
        case 'main-coc-qcc': return appendMainHeaders(changed, Buffer.concat([coc2, qcc2]));
        case 'tile-cod-over-main-coc': {
            const part = insertTileHeaders(tileParts(changed)[0], cod0);
            return appendMainHeaders(replaceTileParts(changed, [part]), coc2);
        }
        case 'tile-coc-over-tile-cod': {
            const part = insertTileHeaders(tileParts(changed)[0], Buffer.concat([cod0, coc2]));
            return replaceTileParts(changed, [part]);
        }
        case 'tile-coc-qcc': {
            const part = insertTileHeaders(tileParts(changed)[0], Buffer.concat([cod0, coc2, qcc2]));
            return replaceTileParts(changed, [part]);
        }
        case 'tile-qcc-over-main-qcc': {
            const part = insertTileHeaders(tileParts(changed)[0], Buffer.concat([cod0, qcc0]));
            return appendMainHeaders(replaceTileParts(changed, [part]), Buffer.concat([coc2, qcc2]));
        }
        case 'duplicate-coc': return appendMainHeaders(changed, Buffer.concat([coc2, coc2, qcc2]));
        case 'duplicate-qcc': return appendMainHeaders(changed, Buffer.concat([qcc0, qcc0]));
        case 'short-cod': changed.writeUInt16BE(11, cod + 2); return changed;
        case 'oversized-cod': changed.writeUInt16BE(65535, cod + 2); return changed;
        case 'invalid-progression': changed[cod + 5] = 5; return changed;
        case 'zero-layers': changed.writeUInt16BE(0, cod + 6); return changed;
        case 'invalid-transform': changed[cod + 13] = 2; return changed;
        case 'short-qcd': changed.writeUInt16BE(2, qcd + 2); return changed;
        case 'invalid-qcd-style': changed[qcd + 4] = 3; return changed;
        case 'bad-siz-length': changed.writeUInt16BE(39, 4); return changed;
        case 'missing-soc': changed.writeUInt16BE(0xff4e, 0); return changed;
        case 'extension-marker': return Buffer.concat([changed.subarray(0, cod), Buffer.of(0xff, 0x50, 0, 4, 0, 0), changed.subarray(cod)]);
        case 'packet-values': changed[sot + 14] ^= 1; return changed;
        case 'packet-marker-like': changed.writeUInt16BE(0xff90, sot + 14); return changed;
        case 'missing-last-tile': {
            let offset = sot;
            for (let index = 0; index < 3; index++) offset += changed.readUInt32BE(offset + 6);
            return Buffer.concat([changed.subarray(0, offset), changed.subarray(-2)]);
        }
        case 'header-limit': return Buffer.concat([changed.subarray(0, sot), Buffer.concat(Array(8193).fill(Buffer.of(0xff, 0x64, 0, 5, 0, 1, 65))), changed.subarray(sot)]);
        default: throw new Error('Unknown codestream fixture mutation.');
    }
}

export function makePdfaJpxCodestreamFixture(xml, {
    mutation = null, multipleTiles = false, compressed = false, pageGroup = true, mode = '1', softMask = false,
} = {}) {
    const original = softMask ? grayMask : multipleTiles ? tiled : jpxAlphaSampleBytes();
    const entry = codestreamBox(original);
    const payload = mutateCodestream(original.subarray(entry.offset + 8, entry.end), mutation);
    const data = Buffer.concat([original.subarray(0, entry.offset), jp2Box('jp2c', payload), original.subarray(entry.end)]);
    if (softMask) {
        const mask = `<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /BitsPerComponent 8 /ColorSpace /DeviceGray
            /Filter /JPXDecode /Length ${data.length} >>\nstream\n${data.toString('latin1')}\nendstream`;
        return makePdfaJpxAlphaFixture(xml, { pageGroup, mode: '0', imageEntries: '/SMask 18 0 R', extraObjects: [[18, mask]] });
    }
    return makePdfaJpxAlphaFixture(xml, { data, compressed, pageGroup, mode, width: multipleTiles ? 2 : 1, height: multipleTiles ? 2 : 1 });
}

const code = 'PDF-JPX-CODESTREAM';
const alpha = 'PDF-JPX-ALPHA';

export function makePdfaJpxCodestreamCases(xml) {
    const cases = [
        ['genuine baseline JP2 has a complete tile and codestream envelope', {}, 'pass'],
        ['Flate-wrapped JP2 preserves its original codestream envelope', { compressed: true }, 'pass'],
        ['genuine four-tile JP2 accounts for every image tile', { multipleTiles: true }, 'pass'],
        ['zero embedded-alpha mode still permits codestream structure inspection', { mode: '0' }, 'pass'],
        ['absent embedded-alpha mode still permits codestream structure inspection', { mode: null }, 'pass', 'not-applicable'],
        ['a separate JPX soft-mask image has its own codestream evidence', { softMask: true }, 'pass'],
        ['a defective separate JPX soft-mask codestream cannot hide behind the parent image', { softMask: true, mutation: 'missing-eoc' }, 'fail'],
        ['a missing EOC fails independently of valid alpha metadata', { mutation: 'missing-eoc' }, 'fail'],
        ['a truncated EOC fails independently of valid alpha metadata', { mutation: 'truncated-eoc' }, 'fail'],
        ['the final marker must be EOC', { mutation: 'wrong-eoc' }, 'fail'],
        ['codestream payload cannot continue after EOC', { mutation: 'trailing-data' }, 'fail'],
        ['Psot cannot be shorter than the tile header', { mutation: 'short-psot' }, 'fail'],
        ['Psot must identify the next exact tile boundary', { mutation: 'wrong-psot' }, 'fail'],
        ['Psot cannot extend beyond the original codestream bytes', { mutation: 'oversized-psot' }, 'fail'],
        ['a final open-ended tile part has a bounded marker envelope ending at EOC', { mutation: 'zero-psot' }, 'pass'],
        ['SOT has its exact required segment length', { mutation: 'short-sot' }, 'fail'],
        ['tile indices must fit the declared image grid', { mutation: 'wrong-tile-index' }, 'fail'],
        ['tile parts begin with sequence index zero', { mutation: 'wrong-part-index' }, 'fail'],
        ['a declared second tile part cannot be absent', { mutation: 'missing-part' }, 'fail'],
        ['an unknown total tile-part count is permitted', { mutation: 'unspecified-part-count' }, 'pass'],
        ['tile data cannot omit its SOT marker', { mutation: 'missing-sot' }, 'fail'],
        ['tile data must start with SOD after the tile header', { mutation: 'missing-sod' }, 'fail'],
        ['SOD cannot substitute for required main-header fields', { mutation: 'early-sod' }, 'fail'],
        ['the main coding-style default is required', { mutation: 'missing-cod' }, 'fail'],
        ['the main quantization default is required', { mutation: 'missing-qcd' }, 'fail'],
        ['main QCD can precede COD without changing effective defaults', { mutation: 'qcd-before-cod' }, 'pass'],
        ['the main header cannot duplicate COD', { mutation: 'duplicate-cod' }, 'fail'],
        ['the main header cannot duplicate QCD', { mutation: 'duplicate-qcd' }, 'fail'],
        ['genuine tile parts may appear in a different tile order', { multipleTiles: true, mutation: 'reordered-tiles' }, 'pass'],
        ['a repeated tile part cannot reuse sequence index zero', { multipleTiles: true, mutation: 'duplicate-tile' }, 'fail'],
        ['an empty first tile part with Psot 14 can precede the sample-bearing part', { mutation: 'empty-first-part' }, 'pass'],
        ['tile-part sequence indices cannot skip a declared part', { mutation: 'part-sequence-gap' }, 'fail'],
        ['main COC requires enough effective quantization subbands', { mutation: 'main-coc-short-quantization' }, 'fail'],
        ['main QCC supplies component quantization for a higher COC level', { mutation: 'main-coc-qcc' }, 'pass'],
        ['tile COD overrides an inherited main COC component style', { mutation: 'tile-cod-over-main-coc' }, 'pass'],
        ['tile COC overrides tile COD and requires its own subband coverage', { mutation: 'tile-coc-over-tile-cod' }, 'fail'],
        ['tile QCC satisfies the effective tile COC subband coverage', { mutation: 'tile-coc-qcc' }, 'pass'],
        ['tile QCC overrides an overcomplete main component quantization', { mutation: 'tile-qcc-over-main-qcc' }, 'pass'],
        ['a component cannot have duplicate main COC entries', { mutation: 'duplicate-coc' }, 'fail'],
        ['a component cannot have duplicate main QCC entries', { mutation: 'duplicate-qcc' }, 'fail'],
        ['COD cannot truncate its declared fixed fields', { mutation: 'short-cod' }, 'fail'],
        ['COD cannot claim bytes beyond the codestream', { mutation: 'oversized-cod' }, 'fail'],
        ['COD progression order has a defined baseline value', { mutation: 'invalid-progression' }, 'fail'],
        ['COD must declare at least one quality layer', { mutation: 'zero-layers' }, 'fail'],
        ['COD wavelet transform must have a defined baseline value', { mutation: 'invalid-transform' }, 'fail'],
        ['QCD cannot omit its quantization fields', { mutation: 'short-qcd' }, 'fail'],
        ['QCD quantization style has a defined baseline value', { mutation: 'invalid-qcd-style' }, 'fail'],
        ['malformed SIZ affects both component and codestream evidence', { mutation: 'bad-siz-length' }, 'fail', 'fail'],
        ['missing SOC affects both component and codestream evidence', { mutation: 'missing-soc' }, 'fail', 'fail'],
        ['extended coding markers keep this inspection open', { mutation: 'extension-marker' }, 'unknown'],
        ['packet sample correctness remains outside envelope checks', { mutation: 'packet-values' }, 'pass'],
        ['marker-like packet bytes do not redefine known Psot boundaries', { mutation: 'packet-marker-like' }, 'pass'],
        ['the complete tile grid cannot omit its last tile', { multipleTiles: true, mutation: 'missing-last-tile' }, 'fail'],
        ['the codestream header count respects inspection limits', { mutation: 'header-limit' }, 'unknown'],
    ];
    return cases.map(([name, options, status, alphaStatus = 'pass']) => ({
        name, bytes: makePdfaJpxCodestreamFixture(xml, options), expect: { [code]: status, [alpha]: alphaStatus },
    }));
}
