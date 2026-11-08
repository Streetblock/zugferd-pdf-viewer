import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';
import { appendPdfRevision, makePdf } from './pdf-fixtures.mjs';

// Reuse the RGB profile from the already attributed and hash-pinned veraPDF corpus PDF.
const corpus = readFileSync(new URL('./fixtures/verapdf-3b-6-8-t02-pass-a.pdf', import.meta.url));
const header = /(?:^|\n)11 0 obj\n<<\n\/Filter \/FlateDecode\n\/N 3\n\/Length (\d+)>>\nstream\r\n/.exec(corpus.toString('latin1'));
assert.ok(header);
const start = header.index + header[0].length;
const rgb = inflateSync(corpus.subarray(start, start + Number(header[1])));
assert.equal(rgb.toString('ascii', 16, 20), 'RGB ');
assert.equal(rgb.toString('ascii', 36, 40), 'acsp');
const calGray = '[/CalGray << /WhitePoint [0.95047 1 1.08883] >>]';
const calRgb = '[/CalRGB << /WhitePoint [0.95047 1 1.08883] >>]';
const rectangle = '0 0 10 10 re f';
const rgbPaint = '1 0 0 rg ' + rectangle;
const cmykPaint = '0 1 0 0 k ' + rectangle;

function stream(data, dictionary = '', compress = false) {
    const bytes = Buffer.from(data);
    const payload = compress ? deflateSync(bytes) : bytes;
    return `<< ${dictionary} /Length ${payload.length} ${compress ? '/Filter /FlateDecode' : ''} >>\nstream\n${payload.toString('latin1')}\nendstream`;
}

export function makePdfaColorFixture(xml, {
    paint = rgbPaint, intent = null, icc = null, defaults = '', form = false, image = false, group = false,
} = {}) {
    const entries = new Map();
    const colorSpace = '/ColorSpace << /Cal ' + calRgb + ' ' + defaults + (icc == null ? '' : ' /Icc [/ICCBased 11 0 R]') + ' >>';
    const resources = '<< ' + colorSpace + ' >>';
    let pageResources = resources;
    if (form) {
        entries.set(12, stream(paint, '/Type /XObject /Subtype /Form /BBox [0 0 20 20] /Resources ' + resources, true));
        pageResources = '<< /XObject << /Fm 12 0 R >> >>';
    }
    if (image) {
        entries.set(12, stream(Buffer.of(0xff, 0, 0), '/Type /XObject /Subtype /Image /Width 1 /Height 1 /BitsPerComponent 8 /ColorSpace /DeviceRGB'));
        pageResources = '<< ' + colorSpace + ' /XObject << /Im 12 0 R >> >>';
    }
    entries.set(3, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Resources ' + pageResources + ' /Contents 8 0 R '
        + (group ? '/Group << /S /Transparency /CS /DeviceRGB >> ' : '') + '>>');
    entries.set(8, stream(form ? 'q /Fm Do Q' : image ? 'q /Im Do Q' : paint));

    if (intent) {
        const profile = Buffer.from(rgb);
        if (['bad-signature', 'shared-invalid'].includes(intent)) profile.write('bad!', 36, 'ascii');
        if (intent === 'bad-class') profile.write('scnr', 12, 'ascii');
        if (intent === 'bad-version') profile[8] = 5;
        if (intent === 'bad-tag') profile.writeUInt32BE(profile.length + 4, 136);
        const multi = ['shared', 'shared-invalid', 'distinct', 'external'].includes(intent);
        const kind = intent === 'pdfx' ? 'GTS_PDFX' : 'GTS_PDFA1';
        const destination = intent === 'missing' ? '' : '/DestOutputProfile 10 0 R';
        entries.set(1, '<< /Type /Catalog /Pages 2 0 R /Names << /EmbeddedFiles 7 0 R >> /AF [4 0 R] /Metadata 6 0 R /OutputIntents [9 0 R'
            + (multi ? ' 13 0 R' : '') + '] >>');
        entries.set(9, '<< /Type /OutputIntent /S /' + kind + ' /OutputConditionIdentifier (RGB test) ' + destination + ' >>');
        if (destination) entries.set(10, stream(profile, '/N 3', true));
        if (multi) {
            entries.set(13, '<< /Type /OutputIntent /S /GTS_PDFX /OutputConditionIdentifier (RGB test) /DestOutputProfile '
                + (intent === 'distinct' ? '14 0 R' : '10 0 R') + (intent === 'external' ? ' /DestOutputProfileRef << >>' : '') + ' >>');
            if (intent === 'distinct') entries.set(14, stream(profile, '/N 3', true));
        }
    }
    if (icc != null) {
        const bytes = Buffer.from(rgb);
        if (icc === 'bad-class') bytes.write('link', 12, 'ascii');
        entries.set(11, stream(bytes, '/N ' + (icc === 'mismatch' ? 1 : 3), true));
    }
    return appendPdfRevision(makePdf(xml), entries);
}

export function makePdfaColorCases(xml) {
    const cases = [
        ['no output intent is needed for blank content', { paint: '' }, { 'PDF-OUTPUT-INTENT': 'not-applicable', '6.2.4.3-4': 'not-applicable' }],
        ['setting DeviceRGB without painting does not use it', { paint: '1 0 0 rg' }, { '6.2.4.3-2': 'not-applicable' }],
        ['an empty path does not paint the selected color', { paint: '1 0 0 rg 0 0 10 10 re n f' }, { '6.2.4.3-2': 'not-applicable' }],
        ['DeviceRGB paint requires matching calibration', {}, { '6.2.4.3-2': 'fail' }],
        ['initial DeviceGray also applies to actual path painting', { paint: rectangle }, { '6.2.4.3-4': 'fail' }],
        ['RGB output intent calibrates DeviceRGB', { intent: 'rgb' }, { 'PDF-OUTPUT-INTENT': 'pass', 'PDF-ICC-STRUCTURE': 'pass', '6.2.3-1': 'pass', '6.2.4.3-2': 'pass' }],
        ['RGB output intent also calibrates DeviceGray', { intent: 'rgb', paint: rectangle }, { '6.2.4.3-4': 'pass' }],
        ['RGB output intent does not calibrate DeviceCMYK', { intent: 'rgb', paint: cmykPaint }, { '6.2.4.3-3': 'fail' }],
        ['device-independent DefaultRGB can replace an output intent', { defaults: '/DefaultRGB ' + calRgb }, { '6.2.4.3-2': 'pass' }],
        ['Indexed cannot be used as DefaultRGB', { defaults: '/DefaultRGB [/Indexed ' + calRgb + ' 0 <FF0000>]' }, { '6.2.4.3-2': 'fail' }],
        ['CalRGB painting requires no output intent', { paint: '/Cal cs 1 0 0 sc ' + rectangle }, { '6.2.4.3-2': 'not-applicable' }],
        ['explicit default gray calibrates the initial gray', { paint: rectangle, defaults: '/DefaultGray ' + calGray }, { '6.2.4.3-4': 'pass' }],
        ['ICCBased profile with matching components', { icc: 'valid', paint: '/Icc cs 1 0 0 sc ' + rectangle }, { '6.2.4.2-1': 'pass', 'PDF-ICC-STRUCTURE': 'pass' }],
        ['ICCBased N must agree with original profile', { icc: 'mismatch', paint: '/Icc cs 1 sc ' + rectangle }, { 'PDF-ICC-STRUCTURE': 'fail' }],
        ['ICCBased rejects a device-link input profile', { icc: 'bad-class', paint: '/Icc cs 1 0 0 sc ' + rectangle }, { '6.2.4.2-1': 'fail' }],
        ['ICC signature is required', { intent: 'bad-signature' }, { 'PDF-ICC-STRUCTURE': 'fail' }],
        ['ICC tag must fit in the original profile', { intent: 'bad-tag' }, { 'PDF-ICC-STRUCTURE': 'fail' }],
        ['scanner profile is unsuitable for a PDF/A output intent', { intent: 'bad-class' }, { '6.2.3-1': 'fail' }],
        ['ICC major version 5 is outside the PDF/A-3 scope', { intent: 'bad-version' }, { '6.2.3-1': 'fail' }],
        ['a declared PDF/A intent needs the embedded destination profile', { intent: 'missing' }, { 'PDF-OUTPUT-INTENT': 'fail' }],
        ['a PDF/X-only intent cannot stand in for PDF/A', { intent: 'pdfx' }, { '6.2.4.3-2': 'fail' }],
        ['multiple output intents can share the exact profile object', { intent: 'shared' }, { '6.2.3-2': 'pass' }],
        ['a shared profile stream still needs valid ICC structure', { intent: 'shared-invalid' }, { '6.2.3-2': 'fail' }],
        ['byte-identical profiles at different references are not shared', { intent: 'distinct' }, { '6.2.3-2': 'fail' }],
        ['PDF/X output intent cannot use an external profile reference', { intent: 'external' }, { '6.2.3-3': 'fail' }],
        ['an invoked image uses its DeviceRGB color space', { image: true }, { '6.2.4.3-2': 'fail' }],
        ['a form can provide its own DefaultRGB', { form: true, defaults: '/DefaultRGB ' + calRgb }, { '6.2.4.3-2': 'pass' }],
        ['restore uses the previous color state', { paint: 'q 1 0 0 rg Q ' + rectangle }, { '6.2.4.3-2': 'not-applicable', '6.2.4.3-4': 'fail' }],
        ['transparent page color coverage stays open', { group: true }, { '6.2.4.3-2': 'unknown' }],
    ];
    return cases.map(([name, options, expect]) => ({ name, bytes: makePdfaColorFixture(xml, options), expect }));
}
