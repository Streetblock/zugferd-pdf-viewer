import assert from 'node:assert/strict';
import { makePdf } from './pdf-fixtures.mjs';

const goTo = '<< /S /GoTo /D [3 0 R /Fit] >>';
const launch = '<< /S /Launch /F (x.exe) >>';
const javaScript = '<< /S /JavaScript /JS (1) >>';
const link = '<< /Type /Annot /Subtype /Link /F 4 /Rect [10 10 20 20] /A ' + goTo + ' >>';
const appearance = '<< /Type /XObject /Subtype /Form /BBox [0 0 10 10] /Resources << >> /Length 0 >>\nstream\n\nendstream';
const resources = '/MediaBox [0 0 100 100] /Resources << >>';

// Keep the existing invoice attachment and its metadata. Replace the catalog
// and page objects through a real incremental update with its own xref.
export function makePdfaDocumentFixture(xml, {
    action = goTo,
    catalogType = 'Catalog',
    catalogExtra = '',
    namesExtra = '',
    rootPages = '<< /Type /Pages /Count 2 /Kids [3 0 R 8 0 R] >>',
    innerPages = '<< /Type /Pages /Parent 2 0 R /Count 1 /Kids [9 0 R] >>',
    parent = '8 0 R',
    pageExtra = '',
    annotation = link,
    annotations = '[10 0 R]',
    extraObjects = [],
} = {}) {
    let pdf = Buffer.from(makePdf(xml)).toString('latin1');
    const footer = /\nstartxref\n(\d+)\n%%EOF\n$/.exec(pdf);
    assert.ok(footer, 'The base fixture must have a classic xref footer.');
    const previous = Number(footer[1]);
    const fileId = /\/ID \[<[^>]+> <[^>]+>\]/.exec(pdf.slice(previous))?.[0];
    assert.ok(fileId, 'The base fixture must have a file ID.');
    const objects = new Map([
        [1, '<< /Type /' + catalogType + ' /Pages 2 0 R /Names << /EmbeddedFiles 7 0 R '
            + namesExtra + ' >> /AF [4 0 R] /Metadata 6 0 R '
            + (action ? '/OpenAction ' + action + ' ' : '') + catalogExtra + ' >>'],
        [2, rootPages],
        [3, '<< /Type /Page /Parent 2 0 R ' + resources + ' >>'],
        [8, innerPages],
        [9, '<< /Type /Page /Parent ' + parent + ' ' + resources + ' /Annots ' + annotations + ' ' + pageExtra + ' >>'],
        [10, annotation],
        ...extraObjects,
    ]);
    const rows = [];
    for (const [number, object] of [...objects].sort(([a], [b]) => a - b)) {
        rows.push(number + ' 1\n' + String(pdf.length).padStart(10, '0') + ' 00000 n \n');
        pdf += number + ' 0 obj\n' + object + '\nendobj\n';
    }
    const xref = pdf.length;
    return Buffer.from(pdf + 'xref\n' + rows.join('') + 'trailer\n<< /Size '
        + (Math.max(...objects.keys()) + 1) + ' /Root 1 0 R ' + fileId + ' /Prev '
        + previous + ' >>\nstartxref\n' + xref + '\n%%EOF\n', 'latin1');
}

export function makePdfaDocumentCases(xml) {
    const cases = [
        ['nested page tree and GoTo on a printable link', {}, {
            'PDF-CATALOG': 'pass', 'PDF-PAGE-TREE': 'pass', 'PDF-ANNOTATION': 'pass',
            '6.3.1-1': 'pass', '6.3.2-1': 'pass', '6.3.2-2': 'pass', '6.5.1-1': 'pass',
        }],
        ['catalog must identify itself as Catalog', { catalogType: 'Other' }, { 'PDF-CATALOG': 'fail' }],
        ['page count must include descendants', { innerPages: '<< /Type /Pages /Parent 2 0 R /Count 2 /Kids [9 0 R] >>' },
            { 'PDF-PAGE-TREE': 'fail' }],
        ['leaf page cannot point to its grandparent', { parent: '2 0 R' }, { 'PDF-PAGE-TREE': 'fail' }],
        ['page tree detects an invalid child alongside usable pages', {
            rootPages: '<< /Type /Pages /Count 2 /Kids [3 0 R 8 0 R 9 0 R] >>',
            innerPages: '<< /Type /Pages /Parent 2 0 R /Count 0 /Kids [17] >>',
            parent: '2 0 R',
        }, { 'PDF-PAGE-TREE': 'fail' }],
        ['page tree detects a cycle without relying on the reported count', {
            rootPages: '<< /Type /Pages /Count 2 /Kids [3 0 R 8 0 R 9 0 R] >>',
            innerPages: '<< /Type /Pages /Parent 2 0 R /Count 0 /Kids [8 0 R] >>',
            parent: '2 0 R',
        }, { 'PDF-PAGE-TREE': 'fail' }],
        ['page Annots must be an array', { annotations: '17' }, { 'PDF-ANNOTATION': 'fail' }],
        ['movie annotation on second page is prohibited', {
            annotation: '<< /Type /Annot /Subtype /Movie /F 4 /Rect [10 10 20 20] /AP << /N 11 0 R >> >>',
            extraObjects: [[11, appearance]],
        }, { '6.3.1-1': 'fail' }],
        ['link annotation requires F', { annotation: link.replace('/F 4 ', '') }, { '6.3.2-1': 'fail' }],
        ['printable annotation cannot also be hidden', { annotation: link.replace('/F 4', '/F 6') }, { '6.3.2-2': 'fail' }],
        ['nondegenerate Text annotation requires an appearance', {
            annotation: '<< /Type /Annot /Subtype /Text /F 4 /Rect [10 10 20 20] >>',
        }, { '6.3.3-1': 'fail' }],
        ['appearance dictionary cannot add a rollover', {
            annotation: '<< /Type /Annot /Subtype /Text /F 4 /Rect [10 10 20 20] /AP << /N 11 0 R /R 11 0 R >> >>',
            extraObjects: [[11, appearance]],
        }, { '6.3.3-2': 'fail' }],
        ['widget cannot define an action even if the action type is allowed', {
            annotation: '<< /Type /Annot /Subtype /Widget /FT /Tx /T (field) /F 4 /Rect [10 10 20 20] /AP << /N 11 0 R >> /A '
                + goTo + ' >>',
            extraObjects: [[11, appearance]],
        }, { '6.4.1-1': 'fail' }],
        ['form field cannot define additional actions', {
            catalogExtra: '/AcroForm << /Fields [11 0 R] >>',
            extraObjects: [[11, '<< /FT /Tx /T (field) /AA << /K ' + javaScript + ' >> >>']],
        }, { '6.4.1-2': 'fail', '6.5.1-1': 'fail' }],
        ['OpenAction destination array is valid and NextPage is allowed', {
            action: '[9 0 R /Fit]',
            annotation: link.replace(goTo, '<< /S /Named /N /NextPage >>'),
        }, { '6.5.1-1': 'pass', '6.5.1-2': 'pass' }],
        ['Launch in OpenAction is prohibited', { action: launch }, { '6.5.1-1': 'fail' }],
        ['Named Print is not one of the page navigation actions', {
            annotation: link.replace(goTo, '<< /S /Named /N /Print >>'),
        }, { '6.5.1-1': 'pass', '6.5.1-2': 'fail' }],
        ['JavaScript after an allowed action in a Next array on the second page', {
            annotation: link.replace(goTo, '<< /S /GoTo /D [3 0 R /Fit] /Next [' + goTo + ' 11 0 R] >>'),
            extraObjects: [[11, javaScript]],
        }, { '6.5.1-1': 'fail' }],
        ['named JavaScript is inspected independently of OpenAction', {
            namesExtra: '/JavaScript << /Names [(script) 11 0 R] >>',
            extraObjects: [[11, javaScript]],
        }, { '6.5.1-1': 'fail' }],
        ['actions in outline items are inspected', {
            catalogExtra: '/Outlines 11 0 R',
            extraObjects: [[11, '<< /Type /Outlines /First 12 0 R /Last 12 0 R /Count 1 >>'],
                [12, '<< /Title (Chapter) /Parent 11 0 R /A ' + launch + ' >>']],
        }, { '6.5.1-1': 'fail' }],
        ['additional actions are prohibited on the catalog and later pages', {
            catalogExtra: '/AA << /WC ' + goTo + ' >>',
            pageExtra: '/AA << /O ' + goTo + ' >>',
        }, { '6.5.2-1': 'fail', '6.5.2-2': 'fail' }],
        ['null additional actions count as absent', { catalogExtra: '/AA null', pageExtra: '/AA null' },
            { '6.5.2-1': 'pass', '6.5.2-2': 'pass' }],
        ['unresolved additional actions stay open', { catalogExtra: '/AA 99 0 R', pageExtra: '/AA 98 0 R' },
            { '6.5.2-1': 'unknown', '6.5.2-2': 'unknown', '6.5.1-1': 'unknown' }],
        ['unresolved action reference cannot pass an incomplete scan', { action: '99 0 R' }, { '6.5.1-1': 'unknown' }],
        ['known violation survives an unresolved action elsewhere', {
            action: '99 0 R',
            annotation: link.replace(goTo, launch),
        }, { '6.5.1-1': 'fail' }],
    ];
    return cases.map(([name, options, expect]) => ({ name, bytes: makePdfaDocumentFixture(xml, options), expect }));
}
