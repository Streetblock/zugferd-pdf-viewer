import { inspectPdfAXmp } from './pdfa-xmp.mjs';
import { inspectXmpBytes } from './pdfa-xml.mjs';

const MAX_PDF_BYTES = 20 * 1024 * 1024;
const textDecoder = new TextDecoder('latin1');
const PDF_A_SPEC = 'ISO 19005-3:2012';
const PDF_SPEC = 'ISO 32000-1:2008';
const xrefRules = [
    { id: '6.1.4-2', specification: PDF_A_SPEC, clause: '6.1.4',
        label: 'Zeilenumbruch nach dem xref-Schlüsselwort' },
    { id: 'PDF-XREF-TARGET', specification: PDF_SPEC, clause: '7.5.5',
        label: 'startxref und Beginn des letzten Querverweisabschnitts' },
    { id: 'PDF-XREF-TABLE', specification: PDF_SPEC, clause: '7.5.4',
        label: 'Abschnitte und Einträge klassischer Querverweistabellen' },
    { id: 'PDF-XREF-STREAM', specification: PDF_SPEC, clause: '7.5.8',
        label: 'Querverweisstreams mit /W, /Index und /Size' },
    { id: 'PDF-XREF-ENTRY', specification: PDF_SPEC, clause: '7.5.4, 7.5.8',
        label: 'Objektnummer und Generation am angegebenen Byteoffset' },
    { id: 'PDF-XREF-PREV', specification: PDF_SPEC, clause: '7.5.6, 7.5.8.4',
        label: 'Verkettung der Revisionen und Zuordnung hybrider Querverweise' },
    { id: 'PDF-OBJECT-STREAM', specification: PDF_SPEC, clause: '7.5.7, 7.5.8',
        label: 'Kopf und Zuordnung komprimierter Objekte in Objektstreams' },
];
const documentRules = [
    { id: 'PDF-CATALOG', specification: PDF_SPEC, clause: '7.7.2', label: 'Dokumentkatalog und Verweis auf den Seitenbaum' },
    { id: 'PDF-PAGE-TREE', specification: PDF_SPEC, clause: '7.7.3', label: 'Seitenbaum mit Kind- und Elternverweisen sowie Seitenanzahl' },
    { id: 'PDF-ANNOTATION', specification: PDF_SPEC, clause: '12.5.2', label: 'Anmerkungsverweise und Anmerkungsdictionaries' },
    { id: '6.3.1-1', clause: '6.3.1', label: 'Zulässige Anmerkungstypen' },
    { id: '6.3.2-1', clause: '6.3.2', label: 'Erforderliche Flags an Anmerkungen' },
    { id: '6.3.2-2', clause: '6.3.2', label: 'Druckbarkeit und Sichtbarkeit der Anmerkungen' },
    { id: '6.3.3-1', clause: '6.3.3', label: 'Erforderliche Darstellung von Anmerkungen (/AP)' },
    { id: '6.3.3-2', clause: '6.3.3', label: 'Nur normale Darstellung im /AP-Dictionary' },
    { id: '6.4.1-1', clause: '6.4.1', label: 'Keine /A- oder /AA-Einträge in Widget-Anmerkungen' },
    { id: '6.4.1-2', clause: '6.4.1', label: 'Keine /A- oder /AA-Einträge in Formularfeldern' },
    { id: '6.5.1-1', clause: '6.5.1', label: 'Zulässige Aktionstypen' },
    { id: '6.5.1-2', clause: '6.5.1', label: 'Zulässige Namen für Navigationsaktionen' },
    { id: '6.5.2-1', clause: '6.5.2', label: 'Keine zusätzlichen Aktionen im Dokumentkatalog (/AA)' },
    { id: '6.5.2-2', clause: '6.5.2', label: 'Keine zusätzlichen Aktionen auf Seiten (/AA)' },
];
const embeddedFileRules = [
    { id: 'PDF-EMBEDDED-FILE', specification: PDF_SPEC, clause: '7.11.3, 7.11.4', label: 'Dateispezifikationen und eingebettete Streams' },
    { id: '6.8-1', clause: '6.8', label: 'MIME-Typ eingebetteter Dateien' },
    { id: '6.8-2', clause: '6.8', label: 'Dateinamen /F und /UF eingebetteter Dateien' },
    { id: '6.8-3', clause: '6.8', label: 'Beziehung /AFRelationship eingebetteter Dateien' },
    { id: '6.8-4', clause: '6.8', label: 'Zuordnung eingebetteter Dateien zum Dokument oder einem PDF-Objekt' },
];
const xmpRules = [
    { id: '6.6.2.3.1-1', clause: '6.6.2.3.1', label: 'Definition der verwendeten XMP-Eigenschaften' },
    { id: '6.6.2.3.1-2', clause: '6.6.2.3.1', label: 'Wertetypen verwendeter XMP-Eigenschaften' },
    { id: '6.6.2.3.2-1', clause: '6.6.2.3.2', label: 'Zulässige Felder der XMP-Erweiterungsdefinitionen' },
    ...[
        'Container für XMP-Erweiterungsschemata',
        'Name des XMP-Erweiterungsschemas',
        'Namensraum des XMP-Erweiterungsschemas',
        'Präfix des XMP-Erweiterungsschemas',
        'Liste der XMP-Eigenschaftsdefinitionen',
        'Liste der benutzerdefinierten XMP-Wertetypen',
        'Name der XMP-Eigenschaft',
        'Wertetyp der XMP-Eigenschaft',
        'Kategorie der XMP-Eigenschaft',
        'Beschreibung der XMP-Eigenschaft',
        'Name des benutzerdefinierten XMP-Wertetyps',
        'Namensraum des benutzerdefinierten XMP-Wertetyps',
        'Präfix des benutzerdefinierten XMP-Wertetyps',
        'Beschreibung des benutzerdefinierten XMP-Wertetyps',
        'Feldliste des benutzerdefinierten XMP-Wertetyps',
        'Name des XMP-Typfeldes',
        'Wertetyp des XMP-Typfeldes',
        'Beschreibung des XMP-Typfeldes',
    ].map((label, index) => ({ id: `6.6.2.3.3-${index + 1}`, clause: '6.6.2.3.3', label })),
];
let runtimePromise;

export function loadPdfRuntime() {
    return runtimePromise ||= import('../vendor/pdfjs/pdf.mjs').then(pdfjs => {
        pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.mjs', import.meta.url).href;
        return pdfjs;
    }).catch(error => { runtimePromise = null; throw error; });
}

export async function sha256(bytes) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function checkInput(bytes, profile) {
    if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.length > MAX_PDF_BYTES) {
        throw new TypeError('PDF muss als Uint8Array mit 1 Byte bis 20 MiB übergeben werden.');
    }
    if (profile !== null && !['3b', '3u', '3a'].includes(profile)) {
        throw new TypeError('Als PDF/A-Zielprofil sind 3b, 3u oder 3a zulässig.');
    }
}

function rule(id, status, location, detail) {
    return { id, status, location, detail };
}

function lineEndingLength(bytes, offset) {
    if (bytes[offset] === 0x0d) return bytes[offset + 1] === 0x0a ? 2 : 1;
    return bytes[offset] === 0x0a ? 1 : 0;
}

function hasAscii(bytes, offset, marker) {
    if (offset + marker.length > bytes.length) return false;
    for (let i = 0; i < marker.length; i++) {
        if (bytes[offset + i] !== marker.charCodeAt(i)) return false;
    }
    return true;
}

function inspectFileHeader(bytes) {
    const eol = lineEndingLength(bytes, 8);
    const validHeader = hasAscii(bytes, 0, '%PDF-1.') && bytes[7] >= 0x30 && bytes[7] <= 0x37 && eol > 0;
    const header = rule('6.1.2-1', validHeader ? 'pass' : 'fail', 'Byte 0',
        validHeader ? 'Der PDF-Header beginnt bei Byte 0 und endet mit einem Zeilenumbruch.'
            : 'Bei Byte 0 muss %PDF-1.n mit einer Versionsziffer von 0 bis 7 und einem Zeilenumbruch stehen.');
    if (!validHeader) {
        return [header, rule('6.1.2-2', 'unknown', 'PDF-Header', 'Ohne gültigen Header ist der anschließende Binärkommentar nicht eindeutig zugeordnet.')];
    }
    const offset = 8 + eol;
    const comment = bytes.subarray(offset + 1, offset + 5);
    const validComment = bytes[offset] === 0x25 && comment.length === 4 && comment.every(value => value > 0x7f);
    return [header, rule('6.1.2-2', validComment ? 'pass' : 'fail', `Byte ${offset}`,
        validComment ? 'Der Binärkommentar steht direkt nach dem Header.'
            : 'Direkt nach dem Header müssen % und mindestens vier Bytes größer als 127 folgen.')];
}

function inspectEof(bytes) {
    for (let offset = bytes.length - 5; offset > 0; offset--) {
        if (bytes[offset] !== 0x25 || ![0x0d, 0x0a].includes(bytes[offset - 1]) || !hasAscii(bytes, offset, '%%EOF')) continue;
        // Recognize a footer, rather than an arbitrary %%EOF substring in a stream or appended text.
        const prefix = textDecoder.decode(bytes.subarray(Math.max(0, offset - 128), offset));
        const pointer = /[\r\n]startxref[ \t]*(?:\r\n|\r|\n)[ \t]*([0-9]+)[ \t]*(?:\r\n|\r|\n)$/.exec(prefix);
        if (!pointer) continue;
        const xref = Number(pointer[1]);
        const target = Number.isSafeInteger(xref) && xref > 0 && xref < offset
            ? textDecoder.decode(bytes.subarray(xref, Math.min(xref + 64, offset))) : '';
        // Validating the xref entries and revision boundaries is a separate step.
        if (!/^(?:xref[ \t\r\n]|\d+[ \t\r\n]+\d+[ \t\r\n]+obj[ \t\r\n<])/.test(target)) {
            return rule('6.1.3-3', 'unknown', 'Dateiende', 'Der letzte erkennbare Abschluss verweist auf keine lesbare Querverweisstruktur.');
        }
        const end = offset + 5;
        const trailingOffset = end + lineEndingLength(bytes, end);
        const hasTrailingData = bytes.length !== trailingOffset;
        return rule('6.1.3-3', hasTrailingData ? 'fail' : 'pass', `Byte ${hasTrailingData ? trailingOffset : offset}`,
            hasTrailingData ? 'Nach dem letzten erkennbaren %%EOF steht mehr als der optionale Zeilenumbruch.'
                : 'Nach dem letzten erkennbaren %%EOF folgen keine weiteren Daten.');
    }
    return rule('6.1.3-3', 'unknown', 'Dateiende', 'Ein eindeutiger Abschluss mit startxref und %%EOF war nicht erkennbar.');
}

function inspectTrailerId(id) {
    if (!id || id.type === 'reference') {
        return rule('6.1.3-1', 'unknown', 'Trailer /ID', 'Die Datei-ID im letzten Trailer konnte nicht sicher gelesen werden.');
    }
    const pair = id.type === 'array' && id.length === 2;
    if (pair && id.entries.some(entry => entry.type === 'reference')) {
        return rule('6.1.3-1', 'unknown', 'Trailer /ID', 'Indirekte Einträge in der Datei-ID sind in dieser Prüfstufe offen.');
    }
    const valid = pair && id.entries.length === 2 && id.entries.every(entry => entry.type === 'string' && entry.byteLength > 0);
    return rule('6.1.3-1', valid ? 'pass' : 'fail', 'Trailer /ID',
        valid ? 'Die Datei-ID enthält zwei nichtleere PDF-Strings.'
            : 'Im letzten Trailer fehlt eine Datei-ID mit zwei nichtleeren PDF-Strings.');
}

function inspectEncryption(hasEncrypt) {
    if (typeof hasEncrypt !== 'boolean') {
        return rule('6.1.3-2', 'unknown', 'Trailer /Encrypt', 'Der letzte Trailer konnte nicht sicher auf /Encrypt geprüft werden.');
    }
    return rule('6.1.3-2', hasEncrypt ? 'fail' : 'pass', 'Trailer /Encrypt',
        hasEncrypt ? 'Der Trailer enthält das für PDF/A unzulässige Feld /Encrypt.'
            : 'Im letzten Trailer ist /Encrypt nicht vorhanden.');
}

function inspectChecks(definitions, inspection, defaultLocation) {
    const checks = new Map(inspection?.checks?.map(check => [check.id, check]));
    return definitions.map(({ id, specification = PDF_A_SPEC, clause, label }) => {
        const evidence = checks.get(id);
        const status = evidence?.status ?? 'unknown';
        const suffix = {
            pass: 'geprüft, kein Verstoß festgestellt',
            fail: 'Verstoß festgestellt',
            unknown: 'nicht abschließend prüfbar',
            'not-applicable': 'nicht anwendbar',
        }[status];
        return {
            ...rule(id, status, evidence?.location || defaultLocation, `${label} – ${suffix}.`),
            specification,
            clause,
            ...(evidence?.detail ? { evidence: evidence.detail } : {}),
        };
    });
}

function buildReport(profile, fileRules, { inspection, xmpInspection, passwordRequired = false }) {
    const { trailer, xref, document: documentInspection, embeddedFiles } = inspection?.version === 1 ? inspection : {};
    const rules = [
        ...fileRules.slice(0, 2),
        inspectTrailerId(trailer?.id),
        inspectEncryption(passwordRequired ? true : trailer?.hasEncrypt),
        fileRules[2],
        ...inspectChecks(xrefRules, xref, 'Querverweise'),
        ...inspectChecks(documentRules, documentInspection, 'Dokumentstruktur'),
        ...inspectChecks(embeddedFileRules, embeddedFiles, 'Eingebettete Dateien'),
        ...inspectChecks(xmpRules, xmpInspection, 'XMP-Metadaten'),
    ];
    return {
        specification: PDF_A_SPEC,
        profile,
        coverage: 'file-structure-subset',
        status: rules.some(result => result.status === 'fail') ? 'invalid' : 'partial',
        rules,
        ...(xref?.counts ? { structureCounts: xref.counts } : {}),
        ...(documentInspection?.counts ? { documentCounts: documentInspection.counts } : {}),
        ...(embeddedFiles?.counts ? { embeddedFileCounts: embeddedFiles.counts } : {}),
        ...(xmpInspection?.counts ? { xmpCounts: xmpInspection.counts } : {}),
    };
}

export function assessPdfAFile(bytes, { inspection, xmpDocument, profile = '3b' } = {}) {
    checkInput(bytes, profile);
    return buildReport(profile, [...inspectFileHeader(bytes), inspectEof(bytes)], {
        inspection,
        xmpInspection: inspectPdfAXmp(xmpDocument),
    });
}

export async function validatePdfA(bytes, { profile = '3b' } = {}) {
    checkInput(bytes, profile);
    const data = new Uint8Array(bytes);
    const fileRules = [...inspectFileHeader(data), inspectEof(data)];
    const sourceSha256 = await sha256(data);
    const pdfjs = await loadPdfRuntime();
    const task = pdfjs.getDocument({ data, isEvalSupported: false });
    let inspection;
    let xmpInspection;
    let passwordRequired = false;
    try {
        const pdf = await task.promise;
        try {
            inspection = await pdf.getPdfAFileInspection();
        } catch {
            // A file-structure inspection failure must not hide readable metadata.
        }
        try {
            const { metadata } = await pdf.getEmbeddedFileInspection({ metadataOnly: true });
            if (metadata?.bytes) xmpInspection = await inspectXmpBytes(metadata.bytes);
        } catch {
            // Missing or unreadable XMP leaves its extension rules open.
        }
    } catch (error) {
        passwordRequired = error instanceof pdfjs.PasswordException;
    } finally {
        await task.destroy();
    }
    return { ...buildReport(profile, fileRules, { inspection, xmpInspection, passwordRequired }), sourceSha256 };
}
