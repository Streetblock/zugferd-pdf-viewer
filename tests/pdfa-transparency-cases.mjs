import { deflateSync } from 'node:zlib';
import { appendPdfRevision, makePdf } from './pdf-fixtures.mjs';
import { makePdfaColorFixture } from './pdfa-color-cases.mjs';

const calRgb = '[/CalRGB << /WhitePoint [0.95047 1 1.08883] >>]';
const paint = '/Cal cs 1 0 0 sc 0 0 10 10 re f';
const stroke = '/Cal CS 1 0 0 SC 0 0 10 10 re S';

function stream(data, dictionary = '', compressed = false) {
    const bytes = Buffer.from(data);
    const payload = compressed ? deflateSync(bytes) : bytes;
    return `<< ${dictionary} /Length ${payload.length} ${compressed ? '/Filter /FlateDecode' : ''} >>\nstream\n${payload.toString('latin1')}\nendstream`;
}

function groupEntry(group, isolated = false) {
    if (!group) return '';
    if (group === true) return `/Group << /S /Transparency /CS ${calRgb}${isolated ? ' /I true' : ''} >>`;
    return '/Group ' + group;
}

function resources(graphicsState, xObjects = '') {
    return `<< /ColorSpace << /Cal ${calRgb} >>
        ${graphicsState ? `/ExtGState << /GS << /Type /ExtGState ${graphicsState} >> >>` : ''}
        ${xObjects ? `/XObject << ${xObjects} >>` : ''} >>`;
}

export function makePdfaTransparencyFixture(xml, {
    graphicsState = '', pageGroup = false, form, maskGroup, maskDictionary, maskPaint = paint, imageMask, hardMask = false,
    content, intent,
} = {}) {
    const entries = new Map();
    const xObjects = [];
    if (form) {
        xObjects.push('/Fm 11 0 R');
        const localState = form.graphicsState ?? '';
        entries.set(11, stream((localState ? '/GS gs ' : '') + paint,
            `/Type /XObject /Subtype /Form /BBox [0 0 20 20] /Resources ${resources(localState)} ${groupEntry(form.group, true)}`, true));
    }
    if (maskGroup) {
        entries.set(12, stream(maskPaint,
            `/Type /XObject /Subtype /Form /BBox [0 0 20 20] /Resources ${resources('')} ${groupEntry(maskGroup, true)}`, true));
    }
    if (maskDictionary) entries.set(13, `<< ${maskDictionary} >>`);
    if (imageMask || hardMask) {
        xObjects.push('/Im 14 0 R');
        const mask = hardMask ? '/Mask [255 255 0 0 0 0]' : '/SMask 15 0 R';
        entries.set(14, stream(Buffer.of(255, 0, 0),
            `/Type /XObject /Subtype /Image /Width 1 /Height 1 /BitsPerComponent 8 /ColorSpace ${calRgb} ${mask}`));
        if (imageMask) {
            entries.set(15, stream(Buffer.of(128), `/Type /XObject /Subtype /Image /Width 1 /Height 1 /BitsPerComponent 8 /ColorSpace ${imageMask}`));
        }
    }
    const drawing = form ? '/Fm Do' : imageMask || hardMask ? '/Im Do' : paint;
    entries.set(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100]
        /Resources ${resources(graphicsState, xObjects.join(' '))} /Contents 16 0 R ${groupEntry(pageGroup)} >>`);
    entries.set(16, stream(content ?? ((graphicsState ? '/GS gs ' : '') + drawing), '', true));
    const base = intent ? makePdfaColorFixture(xml, { intent, paint: '' }) : makePdf(xml);
    return appendPdfRevision(base, entries);
}

const blend = '6.2.10-1';
const page = '6.2.10-2';
const group = 'PDF-TRANSPARENCY-GROUP';
const state = 'PDF-TRANSPARENCY-STATE';
const mask = 'PDF-SOFT-MASK';

export function makePdfaTransparencyCases(xml) {
    const cases = [
        ['opaque paint needs no explicit blending space', {}, { [page]: 'not-applicable' }],
        ['a page group declaration alone does not introduce transparency', { pageGroup: true },
            { [page]: 'not-applicable', [group]: 'pass' }],
        ['Normal and Compatible are standard blend names in an ordered array',
            { graphicsState: '/BM [/Normal /Compatible]' }, { [blend]: 'pass', [page]: 'not-applicable' }],
        ['Compatible behaves like Normal when selected',
            { graphicsState: '/BM /Compatible' }, { [blend]: 'pass', [page]: 'not-applicable' }],
        ['the first supported name controls blending for an ordered array',
            { graphicsState: '/BM [/Normal /Multiply]' }, { [blend]: 'pass', [page]: 'not-applicable' }],
        ['a standard non-normal blend mode uses the page blending space',
            { graphicsState: '/BM [/Multiply /Normal]', pageGroup: true }, { [blend]: 'pass', [page]: 'pass', [group]: 'pass' }],
        ['an undefined blend mode fails', { graphicsState: '/BM /MadeUp' }, { [blend]: 'fail' }],
        ['an unreferenced graphics state is outside the transparency rules',
            { graphicsState: '/BM /MadeUp', content: paint }, { [blend]: 'not-applicable', [page]: 'not-applicable' }],
        ['an undefined later array entry also fails', { graphicsState: '/BM [/Normal /MadeUp]' }, { [blend]: 'fail' }],
        ['blend-mode arrays must contain names', { graphicsState: '/BM [/Normal 42]' }, { [blend]: 'fail' }],
        ['translucent fill requires a page group CS or PDF/A output intent',
            { graphicsState: '/ca 0.5' }, { [page]: 'fail', [state]: 'pass' }],
        ['translucent stroke requires a page group CS or PDF/A output intent',
            { graphicsState: '/CA 0.5', content: '/GS gs ' + stroke }, { [page]: 'fail' }],
        ['stroking opacity does not affect a fill', { graphicsState: '/CA 0.5' }, { [page]: 'not-applicable' }],
        ['nonstroking opacity does not affect a stroke',
            { graphicsState: '/ca 0.5', content: '/GS gs ' + stroke }, { [page]: 'not-applicable' }],
        ['q and Q restore opaque paint after a transparent state was selected',
            { graphicsState: '/ca 0.5', content: 'q /GS gs Q ' + paint }, { [page]: 'not-applicable' }],
        ['invalid opacity is diagnosed independently of page calibration',
            { graphicsState: '/ca 1.25', pageGroup: true }, { [state]: 'fail' }],
        ['the text knockout flag must be boolean', { graphicsState: '/TK 1' }, { [state]: 'fail' }],
        ['explicit page CS satisfies the transparency requirement',
            { graphicsState: '/ca 0.5', pageGroup: true }, { [page]: 'pass', [group]: 'pass' }],
        ['page group without CS does not satisfy the transparency requirement',
            { graphicsState: '/ca 0.5', pageGroup: '<< /S /Transparency >>' }, { [page]: 'fail' }],
        ['the transparency group isolation flag must be boolean',
            { graphicsState: '/ca 0.5', pageGroup: `<< /S /Transparency /I /True /CS ${calRgb} >>` }, { [group]: 'fail' }],
        ['Indexed is not a valid transparency blending color space',
            { graphicsState: '/ca 0.5', pageGroup: `<< /S /Transparency /CS [/Indexed ${calRgb} 0 <FF0000>] >>` }, { [group]: 'fail' }],
        ['a valid PDF/A output intent can supply the default blending space',
            { graphicsState: '/ca 0.5', intent: 'rgb' }, { [page]: 'pass' }],
        ['a PDF/X output intent cannot substitute for a PDF/A output intent',
            { graphicsState: '/ca 0.5', intent: 'pdfx' }, { [page]: 'fail' }],
        ['a form group CS does not substitute for a page group CS',
            { form: { group: true } }, { [page]: 'fail', [group]: 'pass' }],
        ['an isolated form group may specify its own CS',
            { form: { group: true }, pageGroup: true }, { [page]: 'pass', [group]: 'pass' }],
        ['a non-isolated form group cannot override its parent blending space',
            { form: { group: `<< /S /Transparency /I false /CS ${calRgb} >>` }, pageGroup: true }, { [group]: 'fail' }],
        ['nested form paint can introduce transparency to the enclosing page',
            { form: { graphicsState: '/ca 0.5' } }, { [page]: 'fail' }],
        ['SMask None leaves the graphics state opaque', { graphicsState: '/SMask /None' }, { [page]: 'not-applicable' }],
        ['an Alpha soft mask can use an indirect dictionary and transparency form',
            { graphicsState: '/SMask 13 0 R', maskDictionary: '/Type /Mask /S /Alpha /G 12 0 R', maskGroup: true, pageGroup: true },
            { [mask]: 'pass', [page]: 'pass' }],
        ['Alpha mask shape does not use its painted DeviceGray as a color',
            { graphicsState: '/SMask << /S /Alpha /G 12 0 R >>', maskGroup: true, maskPaint: '0 0 10 10 re f', pageGroup: true },
            { [mask]: 'pass', [page]: 'pass', '6.2.4.3-4': 'not-applicable' }],
        ['soft-mask transfer function contents stay open',
            { graphicsState: '/SMask << /S /Alpha /G 12 0 R /TR << /FunctionType 2 /Domain [0 1] /C0 [0] /C1 [1] /N 1 >> >>',
                maskGroup: true, pageGroup: true }, { [mask]: 'unknown', [page]: 'pass' }],
        ['a graphics-state soft mask must name its group XObject',
            { graphicsState: '/SMask << /S /Alpha >>', pageGroup: true }, { [mask]: 'fail' }],
        ['a graphics-state soft mask requires Alpha or Luminosity',
            { graphicsState: '/SMask << /S /Unknown /G 12 0 R >>', maskGroup: true, pageGroup: true }, { [mask]: 'fail' }],
        ['a Luminosity soft mask can use an explicit backdrop and identity transfer',
            { graphicsState: '/SMask << /S /Luminosity /G 12 0 R /BC [0 0 0] /TR /Identity >>', maskGroup: true, pageGroup: true },
            { [mask]: 'pass', [page]: 'pass' }],
        ['Luminosity soft mask group needs a blending color space',
            { graphicsState: '/SMask << /S /Luminosity /G 12 0 R >>', maskGroup: '<< /S /Transparency /I true >>', pageGroup: true },
            { [mask]: 'fail' }],
        ['a luminosity mask inherits colors when the mask is selected',
            { graphicsState: '/SMask << /S /Luminosity /G 12 0 R >>', maskGroup: true, maskPaint: '0 0 10 10 re f',
                pageGroup: true }, { [mask]: 'pass', [page]: 'pass', '6.2.4.3-4': 'fail' }],
        ['a gray image soft mask makes the image transparent', { imageMask: '/DeviceGray' }, { [mask]: 'pass', [page]: 'fail' }],
        ['a hard image mask overrides the graphics-state soft mask',
            { hardMask: true, graphicsState: '/SMask << /S /Alpha /G 12 0 R >>', maskGroup: true },
            { [mask]: 'pass', [page]: 'not-applicable' }],
        ['an image soft mask with RGB samples is invalid', { imageMask: calRgb, pageGroup: true }, { [mask]: 'fail' }],
        ['unresolved graphics state leaves page transparency open', { content: '/Missing gs ' + paint }, { [page]: 'unknown' }],
    ];
    return cases.map(([name, options, expect]) => ({ name, bytes: makePdfaTransparencyFixture(xml, options), expect }));
}
