import { deflateSync } from 'node:zlib';
import { appendPdfRevision, makePdf } from './pdf-fixtures.mjs';

const calRgb = '[/CalRGB << /WhitePoint [0.95047 1 1.08883] >>]';
const paint = '/Cal cs 1 0 0 sc 0 0 10 10 re f';

function stream(content, dictionary = '') {
    const bytes = deflateSync(Buffer.from(content, 'latin1'));
    return `<< ${dictionary} /Filter /FlateDecode /Length ${bytes.length} >>\nstream\n${bytes.toString('latin1')}\nendstream`;
}

function resources(state) {
    const graphics = state ? `/ExtGState << /GS << /Type /ExtGState ${state} >> >>` : '';
    return `<< /ColorSpace << /Cal ${calRgb} >> ${graphics} >>`;
}

function appearance(state, content, group, withResources = true) {
    const transparencyGroup = group ? `/Group << /S /Transparency /I true /CS ${calRgb} >>` : '';
    const localResources = withResources ? `/Resources ${resources(state)}` : '';
    return stream(content ?? ((state ? '/GS gs ' : '') + paint),
        `/Type /XObject /Subtype /Form /BBox [0 0 10 10] ${localResources} ${transparencyGroup}`);
}

export function makePdfaAnnotationTransparencyFixture(xml, {
    appearanceState, appearanceContent, appearanceGroup = false, appearanceResources = true, softMaskGroup = false,
    pageState, pageGroup = false, subtype = 'Stamp',
    annotationEntries = '', normalAppearance, appearanceDictionary, button, appearanceSelection = button, inheritedField = false,
} = {}) {
    const buttonField = `/FT /Btn /T (Approval) /V /${button}`;
    const selectedState = appearanceSelection ? ` /AS /${appearanceSelection}` : '';
    const annotationType = button
        ? `/Widget ${inheritedField ? '/Parent 12 0 R' : buttonField}${selectedState}`
        : `/${subtype}`;
    const normal = normalAppearance ?? (button ? '<< /Yes 9 0 R /Off 10 0 R >>' : '9 0 R');
    const ap = appearanceDictionary === null ? '' : `/AP ${appearanceDictionary ?? `<< /N ${normal} >>`}`;
    const entries = new Map([
        [3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Resources ${resources(pageState)} /Annots [8 0 R]
            ${pageGroup ? `/Group << /S /Transparency /CS ${calRgb} >>` : ''} ${pageState ? '/Contents 11 0 R' : ''} >>`],
        [8, `<< /Type /Annot /Subtype ${annotationType} /F 4 /Rect [10 10 20 20] /P 3 0 R ${ap} ${annotationEntries} >>`],
    ]);
    if (ap) entries.set(9, appearance(appearanceState, appearanceContent, appearanceGroup, appearanceResources));
    if (button) {
        entries.set(1, `<< /Type /Catalog /Pages 2 0 R /Names << /EmbeddedFiles 7 0 R >> /AF [4 0 R] /Metadata 6 0 R
            /AcroForm << /Fields [${inheritedField ? 12 : 8} 0 R] >> >>`);
        entries.set(10, appearance());
        if (inheritedField) entries.set(12, `<< ${buttonField} /Kids [8 0 R] >>`);
    }
    if (pageState) entries.set(11, stream('/GS gs'));
    if (softMaskGroup) entries.set(13, appearance(undefined, undefined, true));
    return appendPdfRevision(makePdf(xml), entries);
}

const page = '6.2.10-2';
const blend = '6.2.10-1';
const group = 'PDF-TRANSPARENCY-GROUP';
const state = 'PDF-TRANSPARENCY-STATE';
const mask = 'PDF-SOFT-MASK';
const normalPath = /\/Annots\[0\]\/AP\/N(?:\/|$)/;

export function makePdfaAnnotationTransparencyCases(xml) {
    const cases = [
        ['opaque Stamp normal appearance does not require a page blending color space', {}, { [page]: 'not-applicable' }],
        ['transparent Stamp normal appearance requires a page blending color space',
            { appearanceState: '/ca 0.5' }, { [page]: 'fail', [state]: 'pass' }, { [state]: normalPath }, 1],
        ['calibrated page group supports a transparent Stamp normal appearance',
            { appearanceState: '/ca 0.5', pageGroup: true }, { [page]: 'pass', [group]: 'pass' }],
        ['a Stamp appearance transparency group is composited into its page',
            { appearanceGroup: true }, { [page]: 'fail', [group]: 'pass' }, { [group]: normalPath }],
        ['a Stamp appearance starts with its own graphics state',
            { pageState: '/ca 0.25' }, { [page]: 'not-applicable' }],
        ['a Stamp appearance resolves its graphics state from local resources',
            { pageState: '/ca 1', appearanceState: '/ca 0.5' }, { [page]: 'fail' }],
        ['a Stamp appearance without Resources cannot borrow page graphics state',
            { pageState: '/ca 0.5', appearanceContent: '/GS gs', appearanceResources: false }, { [page]: 'unknown' }],
        ['a Stamp appearance opacity is independent of annotation CA',
            { annotationEntries: '/CA 0.25 /C [1 0 0]' }, { [page]: 'not-applicable', '6.2.4.3-2': 'not-applicable' }],
        ['annotation CA without an appearance leaves synthesized transparency open',
            { subtype: 'Link', appearanceDictionary: null, annotationEntries: '/CA 0.25' }, { [page]: 'unknown' }],
        ['a normal appearance can use an Alpha soft mask with an explicit page blending space',
            { appearanceState: '/SMask << /S /Alpha /G 13 0 R >>', softMaskGroup: true, pageGroup: true },
            { [page]: 'pass', [mask]: 'pass' }, { [mask]: normalPath }, 1],
        ['forbidden blend mode is located in the normal appearance resources',
            { appearanceState: '/BM /MadeUp' }, { [blend]: 'fail' }, { [blend]: normalPath }],
        ['invalid opacity is located in the normal appearance resources',
            { appearanceState: '/ca 1.5' }, { [state]: 'fail' }, { [state]: normalPath }],
        ['checked widget selects the transparent Yes normal appearance',
            { button: 'Yes', appearanceState: '/ca 0.5' }, { [page]: 'fail' }],
        ['inactive Yes appearance can still introduce transparency for an unchecked widget',
            { button: 'Off', appearanceState: '/ca 0.5' }, { [page]: 'fail' }, undefined, 2],
        ['a widget inherits its button type from the field parent',
            { button: 'Yes', appearanceState: '/ca 0.5', inheritedField: true }, { [page]: 'fail' }],
        ['a widget with opaque normal appearances does not require a page blending color space',
            { button: 'Off' }, { [page]: 'not-applicable' }],
        ['an unknown button state leaves normal appearance transparency open',
            { button: 'Yes', appearanceSelection: 'Unknown', appearanceState: '/ca 0.5' }, { [page]: 'unknown' }],
        ['missing button AS leaves normal appearance transparency open',
            { button: 'Yes', appearanceSelection: null, appearanceState: '/ca 0.5' }, { [page]: 'unknown' }],
        ['an unresolved appearance dictionary leaves transparency open',
            { appearanceDictionary: '99 0 R' }, { [page]: 'unknown' }],
        ['an unresolved normal appearance stream leaves transparency open',
            { normalAppearance: '99 0 R' }, { [page]: 'unknown' }],
        ['unsupported inline image in a normal appearance leaves transparency open',
            { appearanceContent: 'BI /W 1 /H 1 /BPC 8 /CS /RGB /F /AHx ID\nFF0000>\nEI' }, { [page]: 'unknown' }],
    ];
    return cases.map(([name, options, expect, locations, appearanceCount]) => ({
        name, bytes: makePdfaAnnotationTransparencyFixture(xml, options), expect, locations, appearanceCount,
    }));
}
