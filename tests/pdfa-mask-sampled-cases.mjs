import { deflateSync } from 'node:zlib';
import { appendPdfRevision } from './pdf-fixtures.mjs';
import { makePdfaMaskTransferFixture } from './pdfa-mask-transfer-cases.mjs';

export function makePdfaMaskSampledFixture(xml, {
    domain = '[0 1]', range = '[0 1]', size = '[2]', bits = '8', order, encode, decode,
    data = Buffer.of(0, 255), compressed = false, filter, dictionaryOnly = false,
    entries = '', extraObjects = [],
} = {}) {
    const fields = Object.entries({ Domain: domain, Range: range, Size: size, BitsPerSample: bits, Order: order, Encode: encode, Decode: decode })
        .filter(([, value]) => value !== undefined && value !== null)
        .map(([key, value]) => '/' + key + ' ' + value)
        .join(' ');
    const samples = Buffer.from(data);
    const payload = compressed ? deflateSync(samples) : samples;
    const streamFilter = filter ?? (compressed ? '/FlateDecode' : null);
    const dictionary = `/FunctionType 0 ${fields} ${entries}`;
    const body = dictionaryOnly ? `<< ${dictionary} >>`
        : `<< ${dictionary} ${streamFilter ? '/Filter ' + streamFilter : ''} /Length ${payload.length} >>\nstream\n${payload.toString('latin1')}\nendstream`;
    const base = makePdfaMaskTransferFixture(xml, { transfer: '17 0 R' });
    return appendPdfRevision(base, new Map([[17, body], ...extraObjects]));
}

const mask = 'PDF-SOFT-MASK';

export function makePdfaMaskSampledCases(xml) {
    const cases = [
        ['uncompressed Type 0 samples use default interpolation and mappings', {}, 'pass'],
        ['Flate-compressed Type 0 sample bytes are inspected', { compressed: true }, 'pass'],
        ['Flate with an explicit identity predictor preserves sample bytes',
            { compressed: true, entries: '/DecodeParms << /Predictor 1 >>' }, 'pass'],
        ['a singleton null Flate parameter array preserves sample bytes',
            { compressed: true, filter: '[/FlateDecode]', entries: '/DecodeParms [null]' }, 'pass'],
        ...[1, 2, 4, 8, 12, 16, 24, 32].map(bits => [
            `Type 0 accepts ${bits}-bit scalar samples`, { bits: String(bits), data: Buffer.alloc(Math.ceil(2 * bits / 8), 255) }, 'pass',
        ]),
        ['three 4-bit samples occupy two bytes without byte padding between samples',
            { size: '[3]', bits: '4', data: Buffer.of(0x08, 0xff) }, 'pass'],
        ['one sample is a valid constant function even when Order 3 is requested',
            { size: '[1]', order: '3', data: Buffer.of(127) }, 'pass'],
        ['four samples support explicit cubic interpolation',
            { size: '[4]', order: '3', encode: '[0 3]', decode: '[0 1]', data: Buffer.of(0, 85, 170, 255) }, 'pass'],
        ['explicit linear interpolation and reversed mappings are valid',
            { order: '1', encode: '[1 0]', decode: '[2 -1]' }, 'pass'],
        ['equal Encode and Decode endpoints are valid mapping constants',
            { encode: '[0.5 0.5]', decode: '[0.25 0.25]' }, 'pass'],
        ['sample data may contain bytes after the required sample array',
            { data: Buffer.of(0, 255, 42) }, 'pass'],
        ['optional null Order Encode and Decode entries use defaults',
            { order: 'null', encode: 'null', decode: 'null' }, 'pass'],
        ['indirect sample size precision and order values are resolved',
            { size: '[18 0 R]', bits: '19 0 R', order: '20 0 R', extraObjects: [[18, '2'], [19, '8'], [20, '1']] }, 'pass'],
        ['a sampled function must be a stream', { dictionaryOnly: true }, 'fail'],
        ['sampled function input Domain is required', { domain: null }, 'fail'],
        ['sampled function output Range is required', { range: null }, 'fail'],
        ['a null required Range is invalid', { range: 'null' }, 'fail'],
        ['mask sampled function takes exactly one input', { domain: '[0 1 0 1]', size: '[2 2]', data: Buffer.alloc(4) }, 'fail'],
        ['mask sampled function produces exactly one output', { range: '[0 1 0 1]', data: Buffer.alloc(4) }, 'fail'],
        ['sample Domain endpoints must be ordered', { domain: '[1 0]' }, 'fail'],
        ['sample Range endpoints must be ordered', { range: '[1 0]' }, 'fail'],
        ['sample Size is required', { size: null }, 'fail'],
        ['sample Size matches the single mask input dimension', { size: '[2 2]', data: Buffer.alloc(4) }, 'fail'],
        ['sample Size has one positive integer for the mask input', { size: '[0]' }, 'fail'],
        ['fractional sample Size is invalid', { size: '[1.5]' }, 'fail'],
        ['a null sample Size component is invalid', { size: '[null]' }, 'fail'],
        ['BitsPerSample is required', { bits: null }, 'fail'],
        ['unsupported numeric precision is invalid', { bits: '3' }, 'fail'],
        ['Order has only linear and cubic values', { order: '2' }, 'fail'],
        ['Encode has one mapping pair for the mask input', { encode: '[0 1 0 1]' }, 'fail'],
        ['Decode has one mapping pair for the mask output', { decode: '[0 1 0 1]' }, 'fail'],
        ['null mapping members are not numeric', { encode: '[0 null]' }, 'fail'],
        ['truncated uncompressed samples cannot complete the array', { data: Buffer.of(0) }, 'fail'],
        ['truncated Flate samples cannot complete the array', { compressed: true, data: Buffer.of(0) }, 'fail'],
        ['packed 12-bit samples require the complete number of bytes', { bits: '12', data: Buffer.of(0, 255) }, 'fail'],
        ['an unresolved sample Size leaves inspection open', { size: '[99 0 R]' }, 'unknown'],
        ['unresolved precision leaves sample coverage open', { bits: '99 0 R' }, 'unknown'],
        ['unresolved interpolation order leaves inspection open', { order: '99 0 R' }, 'unknown'],
        ['an unresolved Decode endpoint leaves inspection open', { decode: '[0 99 0 R]' }, 'unknown'],
        ['an unsupported stream filter leaves sample coverage open',
            { filter: '/ASCIIHexDecode', data: Buffer.from('00FF>', 'ascii') }, 'unknown'],
        ['a filter ignored by the reader cannot validate raw samples',
            { filter: '/MadeUp' }, 'unknown'],
        ['a tolerated invalid predictor does not validate sample bytes',
            { compressed: true, entries: '/DecodeParms << /Predictor 0 >>' }, 'unknown'],
        ['an unexamined DP alias leaves sample bytes open',
            { compressed: true, entries: '/DP << /Predictor 1 >>' }, 'unknown'],
        ['external stream sample bytes are not read', { entries: '/F (external-samples.bin)' }, 'unknown'],
        ['a complete tiny stream proves a very large declared sample array is truncated',
            { size: '[1000000000]', bits: '32', data: Buffer.of(0) }, 'fail'],
        ['Flate expansion beyond the inspection byte budget remains open',
            { size: '[4194305]', compressed: true, data: Buffer.alloc(4194305) }, 'unknown'],
    ];
    return cases.map(([name, options, status]) => ({
        name, bytes: makePdfaMaskSampledFixture(xml, options), expect: { [mask]: status },
    }));
}
