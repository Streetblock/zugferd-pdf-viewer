import { makePdfaMaskTransferFixture } from './pdfa-mask-transfer-cases.mjs';

const linear = '<< /FunctionType 2 /Domain [0 1] /N 1 >>';
const quadratic = '<< /FunctionType 2 /Domain [0 1] /N 2 >>';

function stitching(functions, bounds = '[]', encode = '[0 1]') {
    return `<< /FunctionType 3 /Domain [0 1] /Functions ${functions} /Bounds ${bounds} /Encode ${encode} >>`;
}

function functionStream(dictionary, data = '') {
    const bytes = Buffer.from(data, 'latin1');
    return `<< ${dictionary} /Length ${bytes.length} >>\nstream\n${bytes.toString('latin1')}\nendstream`;
}

export function makePdfaMaskStitchingFixture(xml, {
    domain = '[0 1]', functions = `[${linear} ${quadratic}]`, bounds = '[0.5]', encode = '[0 1 0 1]', range,
    indirect = false, transferStream = false, extraObjects = [],
} = {}) {
    const fields = Object.entries({ Domain: domain, Functions: functions, Bounds: bounds, Encode: encode, Range: range })
        .filter(([, value]) => value !== undefined && value !== null)
        .map(([key, value]) => '/' + key + ' ' + value)
        .join(' ');
    return makePdfaMaskTransferFixture(xml, {
        transfer: `<< /FunctionType 3 ${fields} >>`, indirect, transferStream, extraObjects,
    });
}

const mask = 'PDF-SOFT-MASK';

export function makePdfaMaskStitchingCases(xml) {
    let deep = linear;
    for (let index = 0; index < 64; index++) deep = stitching(`[${deep}]`);
    const count = 513;
    const largeFunctions = '[' + Array(count).fill('18 0 R').join(' ') + ']';
    const largeBounds = '[' + Array.from({ length: count - 1 }, (_, index) => (index + 1) / count).join(' ') + ']';
    const largeEncode = '[' + Array(count).fill('0 1').join(' ') + ']';
    const sampled = functionStream('/FunctionType 0 /Domain [0 1] /Range [0 1] /Size [2] /BitsPerSample 8', '\x00\xFF');
    const calculator = functionStream('/FunctionType 4 /Domain [0 1] /Range [0 1]', '{ dup mul }');
    const budgetBounds = '[' + Array.from({ length: 15 }, (_, index) => (index + 1) / 16).join(' ') + ']';
    const budgetEncode = '[' + Array(16).fill('0 1').join(' ') + ']';
    const budgetObjects = [[18, linear]];
    for (let number = 19; number <= 22; number++) {
        const children = '[' + Array(16).fill((number - 1) + ' 0 R').join(' ') + ']';
        budgetObjects.push([number, stitching(children, budgetBounds, budgetEncode)]);
    }
    const cases = [
        ['Type 3 composes two scalar Type 2 transfer functions', {}, 'pass'],
        ['indirect stitching and child function dictionaries are resolved',
            { indirect: true, functions: '[18 0 R 19 0 R]', extraObjects: [[18, linear], [19, quadratic]] }, 'pass'],
        ['a shared child object is a valid acyclic function graph',
            { functions: '[18 0 R 18 0 R]', extraObjects: [[18, linear]] }, 'pass'],
        ['Type 3 fields may be read from a stream dictionary', { transferStream: true }, 'pass'],
        ['nested stitching can include an original sampled function stream',
            { functions: `[${stitching('[18 0 R]')} ${linear}]`, extraObjects: [[18, sampled]] }, 'pass'],
        ['the final Bounds value may equal the Domain upper endpoint', { bounds: '[1]' }, 'pass'],
        ['one child permits an equal-endpoint Domain and an empty Bounds array',
            { domain: '[0.5 0.5]', functions: `[${linear}]`, bounds: '[]', encode: '[0 1]' }, 'pass'],
        ['Encode maps may reverse direction or clip to a child domain', { encode: '[1 0 -2 3]' }, 'pass'],
        ['Encode maps may have equal endpoints', { encode: '[0.25 0.25 0.5 0.5]' }, 'pass'],
        ['optional output Range may extend beyond normalized mask values', { range: '[-2 3]' }, 'pass'],
        ['equal output Range endpoints are a valid clipping interval', { range: '[0.5 0.5]' }, 'pass'],
        ['a null optional Range uses the unclipped output', { range: 'null' }, 'pass'],
        ['indirect arrays and scalar Bounds endpoints are resolved',
            { functions: '18 0 R', bounds: '[19 0 R]', encode: '20 0 R',
                extraObjects: [[18, `[${linear} ${quadratic}]`], [19, '0.5'], [20, '[0 1 0 1]']] }, 'pass'],
        ['missing Functions cannot define a stitching transfer', { functions: null }, 'fail'],
        ['empty Functions cannot define a stitching transfer', { functions: '[]', bounds: '[]', encode: '[]' }, 'fail'],
        ['null child is not a function object', { functions: `[${linear} null]` }, 'fail'],
        ['Identity is not a child function object', { functions: `[${linear} /Identity]` }, 'fail'],
        ['scalar child output must agree with the mask output dimension',
            { functions: `[${linear} << /FunctionType 2 /Domain [0 1] /C0 [0 0] /C1 [1 1] /N 1 >>]` }, 'fail'],
        ['a known child error survives a valid outer Range',
            { range: '[0 1]', functions: `[${linear} << /FunctionType 2 /Domain [0 1] >>]` }, 'fail'],
        ['Domain must describe exactly one input', { domain: '[0 1 0 1]' }, 'fail'],
        ['multiple children require increasing Domain endpoints', { domain: '[0.5 0.5]' }, 'fail'],
        ['missing Bounds is invalid even with one child',
            { functions: `[${linear}]`, bounds: null, encode: '[0 1]' }, 'fail'],
        ['Bounds must have one fewer endpoint than Functions', { bounds: '[0.25 0.75]' }, 'fail'],
        ['the first Bounds endpoint must be above the Domain lower endpoint', { bounds: '[0]' }, 'fail'],
        ['Bounds may not exceed the Domain upper endpoint', { bounds: '[1.25]' }, 'fail'],
        ['interior Bounds must be strictly increasing',
            { functions: `[${linear} ${quadratic} ${linear}]`, bounds: '[0.75 0.5]', encode: '[0 1 0 1 0 1]' }, 'fail'],
        ['duplicate interior Bounds are invalid',
            { functions: `[${linear} ${quadratic} ${linear}]`, bounds: '[0.5 0.5]', encode: '[0 1 0 1 0 1]' }, 'fail'],
        ['a null Bounds member is not numeric', { bounds: '[null]' }, 'fail'],
        ['Encode is required for each child function', { encode: null }, 'fail'],
        ['Encode must have two components per child', { encode: '[0 1]' }, 'fail'],
        ['null Encode member is not numeric', { encode: '[0 1 0 null]' }, 'fail'],
        ['output Range must describe one scalar result', { range: '[0 1 0 1]' }, 'fail'],
        ['output Range endpoints must be ordered', { range: '[1 0]' }, 'fail'],
        ['an unresolved child keeps the function graph open', { functions: `[${linear} 99 0 R]` }, 'unknown'],
        ['an unresolved Bounds endpoint keeps the function graph open', { bounds: '[99 0 R]' }, 'unknown'],
        ['unresolved Domain cannot hide decreasing interior Bounds',
            { domain: '99 0 R', functions: `[${linear} ${quadratic} ${linear}]`, bounds: '[0.75 0.25]', encode: '[0 1 0 1 0 1]' }, 'fail'],
        ['a calculator child keeps the transfer inspection open',
            { functions: `[${linear} 18 0 R]`, extraObjects: [[18, calculator]] }, 'unknown'],
        ['an unsupported child cannot hide an independent invalid child',
            { functions: '[18 0 R << /FunctionType 2 /Domain [0 1] >>]', extraObjects: [[18, calculator]] }, 'fail'],
        ['a direct self-reference leaves the stitching graph open',
            { indirect: true, functions: '[17 0 R]', bounds: '[]', encode: '[0 1]' }, 'unknown'],
        ['a cyclic pair of indirect functions leaves the stitching graph open',
            { functions: '[18 0 R]', bounds: '[]', encode: '[0 1]',
                extraObjects: [[18, stitching('[19 0 R]')], [19, stitching('[18 0 R]')]] }, 'unknown'],
        ['deeply nested stitching functions respect the traversal bound',
            { functions: `[${deep}]`, bounds: '[]', encode: '[0 1]' }, 'unknown'],
        ['oversized Functions arrays remain open within inspection limits',
            { functions: largeFunctions, bounds: largeBounds, encode: largeEncode, extraObjects: [[18, linear]] }, 'unknown'],
        ['a broad acyclic function graph respects the total visit budget',
            { functions: '[22 0 R]', bounds: '[]', encode: '[0 1]', extraObjects: budgetObjects }, 'unknown'],
    ];
    return cases.map(([name, options, status]) => ({
        name, bytes: makePdfaMaskStitchingFixture(xml, options), expect: { [mask]: status },
    }));
}
