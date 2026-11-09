import assert from 'node:assert/strict';
import { jpxAlphaSampleBytes, makePdfaJpxAlphaFixture } from './pdfa-jpx-alpha-cases.mjs';

// Same genuine lossless 2x2 RGBA/four-tile sample as the bounded-codestream
// fixtures. Pillow/OpenJPEG 2.5.4 decoded its pixels before it was embedded.
const tiled = Buffer.from('AAAADGpQICANCocKAAAAFGZ0eXBqcDIgAAAAAGpwMiAAAABPanAyaAAAABZpaGRyAAAAAgAAAAIABAcHAAAAAAAPY29scgEAAAAAABAAAAAiY2RlZgAEAAAAAAABAAEAAAACAAIAAAADAAMAAQAAAAAA52pwMmP/T/9RADIAAAAAAAIAAAACAAAAAAAAAAAAAAABAAAAAQAAAAAAAAAAAAQHAQEHAQEHAQEHAQH/UgAMAAAAAQAABAQAAf9cAARAQP9kACUAAUNyZWF0ZWQgYnkgT3BlbkpQRUcgdmVyc2lvbiAyLjUuNP+QAAoAAAAAABsAAf+Tz7QEAN+ACAffgAgHgP+QAAoAAQAAABsAAf+Tz7QEAN+ACAffgAgHgP+QAAoAAgAAABsAAf+Tz7QEAN+ACAffgAgHgP+QAAoAAwAAABsAAf+Tz7QEAN+ACAffgAgHgP/Z', 'base64');

function codestreamBox(jp2) {
    for (let offset = 0; offset < jp2.length;) {
        const length = jp2.readUInt32BE(offset);
        if (jp2.toString('ascii', offset + 4, offset + 8) === 'jp2c') return { offset, end: offset + length };
        offset += length;
    }
    throw new Error('The genuine JP2 fixture must contain its codestream box.');
}

function jp2Box(type, payload) {
    const header = Buffer.alloc(8);
    header.writeUInt32BE(payload.length + 8);
    header.write(type, 4, 'ascii');
    return Buffer.concat([header, payload]);
}

function mainHeader(data) {
    let offset = 2, cod;
    while (data.readUInt16BE(offset) !== 0xff90) {
        const marker = data.readUInt16BE(offset);
        const length = data.readUInt16BE(offset + 2);
        if (marker === 0xff52) cod = { offset, end: offset + 2 + length };
        offset += 2 + length;
    }
    assert.ok(cod);
    return { end: offset, cod };
}

function tileParts(data, offset) {
    const result = [];
    while (data.readUInt16BE(offset) === 0xff90) {
        const length = data.readUInt32BE(offset + 6);
        assert.ok(length >= 14 && offset + length <= data.length);
        result.push(Buffer.from(data.subarray(offset, offset + length)));
        offset += length;
    }
    assert.equal(data.readUInt16BE(offset), 0xffd9);
    return result;
}

function insertTileHeader(part, marker) {
    const result = Buffer.concat([part.subarray(0, 12), marker, part.subarray(12)]);
    result.writeUInt32BE(result.length, 6);
    return result;
}

function openEndedData(original, mutation, { flags, tileFlags, multipart } = {}) {
    const entry = codestreamBox(original);
    const source = original.subarray(entry.offset + 8, entry.end);
    const header = mainHeader(source);
    let main = Buffer.from(source.subarray(0, header.end));
    if (flags !== undefined) main[header.cod.offset + 4] = flags;
    let parts = tileParts(source, header.end);
    const coding = Buffer.from(source.subarray(header.cod.offset, header.cod.end));
    if (tileFlags !== undefined) {
        coding[4] = tileFlags;
        parts[0] = insertTileHeader(parts[0], coding);
    }
    if (multipart) {
        const first = Buffer.concat([parts[0].subarray(0, 12),
            ...(tileFlags === undefined ? [] : [coding]), Buffer.of(0xff, 0x93)]);
        first.writeUInt32BE(first.length, 6);
        first[10] = 0; first[11] = 2;
        // Move the coding override to the first bounded tile part only.
        const last = tileParts(source, header.end)[0];
        last[10] = 1; last[11] = 2;
        parts = [first, last];
    }
    parts.at(-1).writeUInt32BE(0, 6);
    const append = value => { parts[parts.length - 1] = Buffer.concat([parts.at(-1), Buffer.from(value)]); };
    let ending = Buffer.of(0xff, 0xd9);
    switch (mutation) {
        case null: break;
        case 'following-tile': parts.push(tileParts(source, header.end)[0]); break;
        case 'first-tile-open': parts[0].writeUInt32BE(0, 6); break;
        case 'missing-tile': parts.shift(); break;
        case 'unknown-total': parts.at(-1)[11] = 0; break;
        case 'missing-part': parts.at(-1)[11] = 2; break;
        case 'early-eoc': append([0xff, 0xd9, 0]); break;
        case 'missing-eoc': ending = Buffer.alloc(0); break;
        case 'truncated-eoc': ending = Buffer.of(0xff); break;
        case 'trailing-data': ending = Buffer.of(0xff, 0xd9, 0); break;
        case 'empty-open-part': parts[parts.length - 1] = parts.at(-1).subarray(0, 14); break;
        case 'ff00': append([0xff, 0]); break;
        case 'ff80': append([0xff, 0x80]); break;
        case 'ff8f': append([0xff, 0x8f]); break;
        case 'header-like-data': append([0xff, 0x4f, 0xff, 0x51, 0xff, 0x52, 0xff, 0x64]); break;
        case 'sod-in-data': append([0xff, 0x93]); break;
        case 'reserved-marker': append([0xff, 0x94]); break;
        case 'physical-ff-fill': append([0xff]); break;
        case 'sop': append([0xff, 0x91, 0, 4, 0, 0]); break;
        case 'sop-marker-like-index': append([0xff, 0x91, 0, 4, 0xff, 0xd9]); break;
        case 'sop-short-length': append([0xff, 0x91, 0, 3, 0, 0]); break;
        case 'sop-long-length': append([0xff, 0x91, 0, 5, 0, 0, 0]); break;
        case 'sop-truncated': append([0xff, 0x91, 0, 4, 0]); break;
        case 'eph': append([0xff, 0x92]); break;
        case 'sop-eph': append([0xff, 0x91, 0, 4, 0, 0, 0xff, 0x92]); break;
        case 'packed-main': main = Buffer.concat([main, Buffer.from('ff60000300', 'hex')]); break;
        default: throw new Error('Unknown open-ended codestream fixture mutation.');
    }
    const payload = Buffer.concat([main, ...parts, ending]);
    return Buffer.concat([original.subarray(0, entry.offset), jp2Box('jp2c', payload), original.subarray(entry.end)]);
}

export function makePdfaJpxOpenEndedFixture(xml, {
    mutation = null, multipleTiles = false, compressed = false, mode = '1', flags, tileFlags, multipart = false,
} = {}) {
    const original = multipleTiles ? tiled : jpxAlphaSampleBytes();
    const data = openEndedData(original, mutation, { flags, tileFlags, multipart });
    return makePdfaJpxAlphaFixture(xml, { data, compressed, mode, width: multipleTiles ? 2 : 1, height: multipleTiles ? 2 : 1 });
}

export function makePdfaJpxOpenEndedCases(xml) {
    // Payload mutations below establish framing only. They do not assert that
    // an appended data pair or packet marker preserves valid decoded pixels.
    const cases = [
        ['a genuine final tile part may declare Psot zero', {}, 'pass'],
        ['Flate-wrapped JP2 retains evidence for an open final tile part', { compressed: true }, 'pass'],
        ['an open final tile part does not require embedded alpha', { mode: null }, 'pass', 'not-applicable'],
        ['only the last tile of a genuine four-tile image is open-ended', { multipleTiles: true }, 'pass'],
        ['an open final part can follow a bounded part of the same tile', { multipart: true }, 'pass'],
        ['an open tile part permits an unspecified total part count', { mutation: 'unknown-total' }, 'pass'],
        ['an open final tile part may contain no packets', { mutation: 'empty-open-part' }, 'pass'],
        ['another SOT cannot follow an open tile part', { mutation: 'following-tile' }, 'fail'],
        ['an open tile part cannot precede another tile in a genuine grid', { multipleTiles: true, mutation: 'first-tile-open' }, 'fail'],
        ['an open final tile part does not waive complete tile coverage', { multipleTiles: true, mutation: 'missing-tile' }, 'fail'],
        ['an open final tile part cannot omit a declared later part', { mutation: 'missing-part' }, 'fail'],
        ['an early EOC does not consume remaining codestream bytes', { mutation: 'early-eoc' }, 'fail'],
        ['an open tile part still requires final EOC', { mutation: 'missing-eoc' }, 'fail'],
        ['final EOC cannot be truncated', { mutation: 'truncated-eoc' }, 'fail'],
        ['bytes cannot follow final EOC', { mutation: 'trailing-data' }, 'fail'],
        ['FF00 remains compressed data in an open tile part', { mutation: 'ff00' }, 'pass'],
        ['FF80 remains compressed data in an open tile part', { mutation: 'ff80' }, 'pass'],
        ['FF8F remains compressed data at the marker-range boundary', { mutation: 'ff8f' }, 'pass'],
        ['SOC and header-like bytes below the marker range remain packet data', { mutation: 'header-like-data' }, 'pass'],
        ['a second SOD cannot occur within an open tile body', { mutation: 'sod-in-data' }, 'fail'],
        ['an unknown marker-range code leaves the open body unverified', { mutation: 'reserved-marker' }, 'unknown'],
        ['physical FF fill leaves ambiguous final packet termination open', { mutation: 'physical-ff-fill' }, 'unknown'],
        ['SOP framing is accepted when enabled by effective COD', { flags: 2, mutation: 'sop' }, 'pass'],
        ['marker-like SOP sequence bytes are not a premature EOC', { flags: 2, mutation: 'sop-marker-like-index' }, 'pass'],
        ['SOP is forbidden when its effective COD flag is absent', { mutation: 'sop' }, 'fail'],
        ['SOP requires exact Lsop four rather than three', { flags: 2, mutation: 'sop-short-length' }, 'fail'],
        ['SOP requires exact Lsop four rather than five', { flags: 2, mutation: 'sop-long-length' }, 'fail'],
        ['SOP cannot consume bytes of the final EOC', { flags: 2, mutation: 'sop-truncated' }, 'fail'],
        ['EPH framing is accepted when enabled by effective COD', { flags: 4, mutation: 'eph' }, 'pass'],
        ['EPH is forbidden when its effective COD flag is absent', { mutation: 'eph' }, 'fail'],
        ['tile COD can enable SOP and EPH over the main default', { tileFlags: 6, mutation: 'sop-eph' }, 'pass'],
        ['tile COD can disable SOP enabled in the main default', { flags: 2, tileFlags: 0, mutation: 'sop' }, 'fail'],
        ['an earlier bounded tile COD remains effective in the open final part', { multipart: true, tileFlags: 6, mutation: 'sop-eph' }, 'pass'],
        ['packed main packet headers keep the complete codestream inspection open', { mutation: 'packed-main' }, 'unknown'],
    ];
    return cases.map(([name, options, status, alpha = 'pass']) => ({ name,
        bytes: makePdfaJpxOpenEndedFixture(xml, options), expect: { 'PDF-JPX-CODESTREAM': status, 'PDF-JPX-ALPHA': alpha },
    }));
}
