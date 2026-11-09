import { deflateSync } from 'node:zlib';
import { appendPdfRevision } from './pdf-fixtures.mjs';
import { makePdfaMaskTransferFixture } from './pdfa-mask-transfer-cases.mjs';

export function makePdfaMaskCalculatorFixture(xml, {
    code = '{ dup mul }', domain = '[0 1]', range = '[0 1]', compressed = false, filter,
    dictionaryOnly = false, entries = '', extraObjects = [],
} = {}) {
    const fields = Object.entries({ Domain: domain, Range: range })
        .filter(([, value]) => value !== undefined && value !== null)
        .map(([key, value]) => '/' + key + ' ' + value)
        .join(' ');
    const source = Buffer.from(code, 'latin1');
    const payload = compressed ? deflateSync(source) : source;
    const streamFilter = filter ?? (compressed ? '/FlateDecode' : null);
    const dictionary = `/FunctionType 4 ${fields} ${entries}`;
    const body = dictionaryOnly ? `<< ${dictionary} >>`
        : `<< ${dictionary} ${streamFilter ? '/Filter ' + streamFilter : ''} /Length ${payload.length} >>\nstream\n${payload.toString('latin1')}\nendstream`;
    const base = makePdfaMaskTransferFixture(xml, { transfer: '17 0 R' });
    return appendPdfRevision(base, new Map([[17, body], ...extraObjects]));
}

const mask = 'PDF-SOFT-MASK';

export function makePdfaMaskCalculatorCases(xml) {
    let nested = '1 add';
    for (let index = 0; index < 64; index++) nested = 'true { ' + nested + ' } if';
    const cases = [
        ['calculator squares the scalar mask input', {}, 'pass'],
        ['Flate-compressed calculator source is inspected', { compressed: true }, 'pass'],
        ['empty calculator body preserves the numeric scalar input', { code: '{ }' }, 'pass'],
        ['calculator numeric output is clipped by its Range', { code: '{ 2 mul }', range: '[-1 2]' }, 'pass'],
        ['calculator supports comments and PDF numeric syntax',
            { code: '{ % comment before an operator\n .5 add % trailing comment\n }' }, 'pass'],
        ['calculator supports reversed subtraction operands with exch', { code: '{ 1 exch sub }' }, 'pass'],
        ['constant stack copy index and roll operations preserve one output',
            { code: '{ 1 copy pop 0 index mul 1 2 3 -1 roll pop pop }' }, 'pass'],
        ['constant integer bitwise operators produce a numeric mask result',
            { code: '{ pop 3 2 and 1 bitshift }' }, 'pass'],
        ['explicit integer conversion permits a bitwise operation', { code: '{ cvi not }' }, 'pass'],
        ['square root preserves a valid nonnegative input interval', { code: '{ sqrt }' }, 'pass'],
        ['a definitely negative square-root domain is invalid', { code: '{ sqrt }', domain: '[-2 -1]' }, 'fail'],
        ['the calculator supports the required hundred operand stack entries',
            { code: '{ pop ' + '1 '.repeat(100) + 'pop '.repeat(99) + '}' }, 'pass'],
        ['larger operand stacks respect the documented inspection bound',
            { code: '{ pop ' + '1 '.repeat(129) + 'pop '.repeat(128) + '}' }, 'unknown'],
        ['integer division overflow remains an implementation limit',
            { code: '{ pop -2147483648 -1 idiv }' }, 'unknown'],
        ['an integer literal beyond exact numeric representation remains open',
            { code: '{ pop 9007199254740993 }' }, 'unknown'],
        ['possible integer arithmetic promotion cannot prove an integer-only operator',
            { code: '{ cvi 2147483647 add not }' }, 'unknown'],
        ['a known true conditional produces one numeric output', { code: '{ true { 1 add } if }' }, 'pass'],
        ['a known false conditional does not execute its runtime underflow', { code: '{ false { add } if }' }, 'pass'],
        ['both feasible ifelse branches produce one numeric output',
            { code: '{ dup 0.5 lt { dup mul } { 1 exch sub } ifelse }' }, 'pass'],
        ['a boolean expression selects scalar ifelse branches',
            { code: '{ pop true false or { 1 } { 0 } ifelse }' }, 'pass'],
        ['an indirect scalar Domain is resolved', { domain: '18 0 R', extraObjects: [[18, '[0 1]']] }, 'pass'],
        ['calculator Domain is required', { domain: null }, 'fail'],
        ['calculator Range is required', { range: null }, 'fail'],
        ['calculator Domain has one input pair', { domain: '[0 1 0 1]' }, 'fail'],
        ['calculator Range has one output pair', { range: '[0 1 0 1]' }, 'fail'],
        ['calculator must be a stream', { dictionaryOnly: true }, 'fail'],
        ['calculator source needs enclosing braces', { code: 'dup mul' }, 'fail'],
        ['truncated calculator source cannot close its body', { code: '{ dup mul' }, 'fail'],
        ['extra calculator tokens after the closing body are invalid', { code: '{ dup mul } 1' }, 'fail'],
        ['unknown operators cannot execute in calculator functions', { code: '{ system }' }, 'fail'],
        ['literal names are outside the calculator operand language', { code: '{ /name }' }, 'fail'],
        ['arrays are outside the calculator operand language', { code: '{ [1] }' }, 'fail'],
        ['scientific notation is outside PDF numeric literal syntax', { code: '{ 1e3 mul }' }, 'fail'],
        ['unattached inner braces are not procedure objects', { code: '{ { dup } }' }, 'fail'],
        ['binary arithmetic detects a definite stack underflow', { code: '{ add }' }, 'fail'],
        ['a calculator cannot return two operands for a scalar Range', { code: '{ dup }' }, 'fail'],
        ['a calculator cannot return no operand for a scalar Range', { code: '{ pop }' }, 'fail'],
        ['a calculator cannot return a boolean mask result', { code: '{ pop true }' }, 'fail'],
        ['real numeric literals are not integer operands for bitwise not', { code: '{ pop 1.0 not }' }, 'fail'],
        ['numeric operands cannot substitute for a conditional boolean', { code: '{ 1 { dup mul } if }' }, 'fail'],
        ['a definite zero divisor is invalid', { code: '{ 0 div }' }, 'fail'],
        ['a possible zero divisor keeps the runtime proof open', { code: '{ 0.5 sub 1 exch div }' }, 'unknown'],
        ['correlated conditional facts cannot create a false stack failure',
            { code: '{ dup 0.5 gt { dup 0.5 le { pop } if } if }' }, 'unknown'],
        ['an unresolved scalar interval keeps the calculator proof open', { range: '[0 99 0 R]' }, 'unknown'],
        ['an unsupported source filter leaves calculator bytes open',
            { filter: '/ASCIIHexDecode', code: '7B20647570206D756C207D>' }, 'unknown'],
        ['external calculator source bytes are not read', { entries: '/F (external-calculator.ps)' }, 'unknown'],
        ['deep calculator nesting respects inspection limits', { code: '{ ' + nested + ' }' }, 'unknown'],
        ['calculator instruction count respects inspection limits',
            { code: '{ ' + '0 pop '.repeat(100000) + '}', compressed: true }, 'unknown'],
    ];
    return cases.map(([name, options, status]) => ({
        name, bytes: makePdfaMaskCalculatorFixture(xml, options), expect: { [mask]: status },
    }));
}
