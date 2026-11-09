import { appendPdfRevision } from './pdf-fixtures.mjs';
import { makePdfaTransparencyFixture } from './pdfa-transparency-cases.mjs';

export function makePdfaMaskTransferFixture(xml, {
    transfer = '<< /FunctionType 2 /Domain [0 1] /N 1 >>', indirect = false,
    transferStream = false, transferData = '', extraObjects = [],
    maskSubtype = 'Alpha', backdrop = null,
} = {}) {
    const value = indirect || transferStream ? '17 0 R' : transfer;
    const base = makePdfaTransparencyFixture(xml, {
        graphicsState: '/SMask 13 0 R',
        maskDictionary: `/Type /Mask /S /${maskSubtype} /G 12 0 R /TR ${value}${backdrop ? ' /BC ' + backdrop : ''}`,
        maskGroup: true,
        pageGroup: true,
    });
    const entries = new Map(extraObjects);
    if (transferStream) {
        const bytes = Buffer.from(transferData, 'latin1');
        entries.set(17, transfer.slice(0, -2) + ` /Length ${bytes.length} >>\nstream\n${bytes.toString('latin1')}\nendstream`);
    } else if (indirect) entries.set(17, transfer);
    return entries.size ? appendPdfRevision(base, entries) : base;
}

const mask = 'PDF-SOFT-MASK';

export function makePdfaMaskTransferCases(xml) {
    const cases = [
        ['Type 2 defaults produce one mask output', {}, 'pass'],
        ['indirect Type 2 dictionary is inspected without changing the original bytes', { indirect: true }, 'pass'],
        ['Type 2 fields can be read from an indirect stream dictionary', { transferStream: true }, 'pass'],
        ['Type 2 explicit scalar coefficients and range are valid',
            { transfer: '<< /FunctionType 2 /Domain [0 1] /C0 [0.2] /C1 [0.8] /Range [0 1] /N 2 >>' }, 'pass'],
        ['zero exponent is valid on a domain containing zero',
            { transfer: '<< /FunctionType 2 /Domain [0 1] /N 0 >>' }, 'pass'],
        ['positive fractional exponent is valid on a nonnegative domain',
            { transfer: '<< /FunctionType 2 /Domain [0 1] /N 0.5 >>' }, 'pass'],
        ['negative integer exponent is valid on a strictly negative domain',
            { transfer: '<< /FunctionType 2 /Domain [-2 -1] /N -1 >>' }, 'pass'],
        ['negative fractional exponent is valid on a strictly positive domain',
            { transfer: '<< /FunctionType 2 /Domain [1 2] /N -0.5 >>' }, 'pass'],
        ['a scalar function domain may clip normalized mask inputs',
            { transfer: '<< /FunctionType 2 /Domain [0.25 0.75] /N 1 >>' }, 'pass'],
        ['equal domain and range endpoints are valid clipping intervals',
            { transfer: '<< /FunctionType 2 /Domain [0.5 0.5] /Range [0.25 0.25] /N 1 >>' }, 'pass'],
        ['legal mask function outputs outside zero to one are clamped',
            { transfer: '<< /FunctionType 2 /Domain [0 1] /C0 [-2] /C1 [3] /N 1 >>' }, 'pass'],
        ['an explicit transfer range may extend outside normalized mask values',
            { transfer: '<< /FunctionType 2 /Domain [0 1] /C0 [-2] /C1 [3] /Range [-1 2] /N 1 >>' }, 'pass'],
        ['optional null coefficients and range use their defaults',
            { transfer: '<< /FunctionType 2 /Domain [0 1] /C0 null /C1 null /Range null /N 1 >>' }, 'pass'],
        ['indirect numeric domain endpoints and exponent are resolved',
            { transfer: '<< /FunctionType 2 /Domain [18 0 R 19 0 R] /N 20 0 R >>', extraObjects: [[18, '0'], [19, '1'], [20, '1']] }, 'pass'],
        ['null mask TR uses the identity transfer', { transfer: 'null' }, 'pass'],
        ['named Identity transfer remains valid', { transfer: '/Identity' }, 'pass'],
        ['Default is not a named mask-local transfer option', { transfer: '/Default' }, 'fail'],
        ['a function dictionary must declare its type', { transfer: '<< /Domain [0 1] /N 1 >>' }, 'fail'],
        ['undefined function type is invalid', { transfer: '<< /FunctionType 9 /Domain [0 1] /N 1 >>' }, 'fail'],
        ['Type 2 needs a Domain', { transfer: '<< /FunctionType 2 /N 1 >>' }, 'fail'],
        ['Type 2 domain must describe one input',
            { transfer: '<< /FunctionType 2 /Domain [0 1 0 1] /N 1 >>' }, 'fail'],
        ['Type 2 domain endpoints must be ordered',
            { transfer: '<< /FunctionType 2 /Domain [1 0] /N 1 >>' }, 'fail'],
        ['null member is not a numeric domain endpoint',
            { transfer: '<< /FunctionType 2 /Domain [0 null] /N 1 >>' }, 'fail'],
        ['Type 2 range must describe one output',
            { transfer: '<< /FunctionType 2 /Domain [0 1] /Range [0 1 0 1] /N 1 >>' }, 'fail'],
        ['Type 2 range endpoints must be ordered',
            { transfer: '<< /FunctionType 2 /Domain [0 1] /Range [1 0] /N 1 >>' }, 'fail'],
        ['null member is not a numeric range endpoint',
            { transfer: '<< /FunctionType 2 /Domain [0 1] /Range [0 null] /N 1 >>' }, 'fail'],
        ['multiple C0 components cannot describe a mask transfer',
            { transfer: '<< /FunctionType 2 /Domain [0 1] /C0 [0 0] /C1 [1 1] /N 1 >>' }, 'fail'],
        ['a missing C1 uses one component and cannot match a multicomponent C0',
            { transfer: '<< /FunctionType 2 /Domain [0 1] /C0 [0 0] /N 1 >>' }, 'fail'],
        ['empty coefficients cannot describe one mask output',
            { transfer: '<< /FunctionType 2 /Domain [0 1] /C0 [] /C1 [] /N 1 >>' }, 'fail'],
        ['null coefficient member is not a number',
            { transfer: '<< /FunctionType 2 /Domain [0 1] /C0 [null] /N 1 >>' }, 'fail'],
        ['Type 2 needs its exponent', { transfer: '<< /FunctionType 2 /Domain [0 1] >>' }, 'fail'],
        ['a null exponent does not meet the required numeric entry',
            { transfer: '<< /FunctionType 2 /Domain [0 1] /N null >>' }, 'fail'],
        ['exponent must be numeric',
            { transfer: '<< /FunctionType 2 /Domain [0 1] /N /Infinity >>' }, 'fail'],
        ['fractional exponent excludes negative domain inputs',
            { transfer: '<< /FunctionType 2 /Domain [-1 1] /N 0.5 >>' }, 'fail'],
        ['negative exponent excludes zero domain inputs',
            { transfer: '<< /FunctionType 2 /Domain [0 1] /N -1 >>' }, 'fail'],
        ['unresolved mask transfer reference leaves its result open', { transfer: '99 0 R' }, 'unknown'],
        ['unresolved numeric domain endpoint leaves Type 2 open',
            { transfer: '<< /FunctionType 2 /Domain [0 99 0 R] /N 1 >>' }, 'unknown'],
        ['unresolved numeric exponent leaves Type 2 open',
            { transfer: '<< /FunctionType 2 /Domain [0 1] /N 99 0 R >>' }, 'unknown'],
        ['known invalid endpoint is diagnosed even beside an unresolved endpoint',
            { transfer: '<< /FunctionType 2 /Domain [/Invalid 99 0 R] /N 1 >>' }, 'fail'],
        ['unresolved coefficient cannot hide a missing required exponent',
            { transfer: '<< /FunctionType 2 /Domain [0 1] /C0 [99 0 R] >>' }, 'fail'],
        ['unresolved luminosity backdrop cannot hide a missing Type 2 exponent',
            { transfer: '<< /FunctionType 2 /Domain [0 1] >>', maskSubtype: 'Luminosity', backdrop: '99 0 R' }, 'fail'],
        ['unresolved function type leaves mask transfer open',
            { transfer: '<< /FunctionType 99 0 R /Domain [0 1] /N 1 >>' }, 'unknown'],
        ['sampled transfer functions remain open',
            { transfer: '<< /FunctionType 0 /Domain [0 1] /Range [0 1] /Size [2] /BitsPerSample 8 >>', transferStream: true, transferData: '\x00\xFF' }, 'unknown'],
        ['stitching transfer functions remain open',
            { transfer: '<< /FunctionType 3 /Domain [0 1] /Functions [<< /FunctionType 2 /Domain [0 1] /N 1 >>] /Bounds [] /Encode [0 1] >>' }, 'unknown'],
        ['calculator transfer functions remain open',
            { transfer: '<< /FunctionType 4 /Domain [0 1] /Range [0 1] >>', transferStream: true, transferData: '{ dup mul }' }, 'unknown'],
    ];
    return cases.map(([name, options, status]) => ({
        name, bytes: makePdfaMaskTransferFixture(xml, options), expect: { [mask]: status },
    }));
}
