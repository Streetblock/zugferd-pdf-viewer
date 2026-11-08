const MAX_PDF_BYTES = 20 * 1024 * 1024;
const textDecoder = new TextDecoder('latin1');
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

function buildReport(profile, fileRules, inspection, passwordRequired = false) {
    const trailer = inspection?.version === 1 ? inspection.trailer : null;
    const rules = [
        ...fileRules.slice(0, 2),
        inspectTrailerId(trailer?.id),
        inspectEncryption(passwordRequired ? true : trailer?.hasEncrypt),
        fileRules[2],
    ];
    return {
        specification: 'ISO 19005-3:2012',
        profile,
        coverage: 'file-structure-subset',
        status: rules.some(result => result.status === 'fail') ? 'invalid' : 'partial',
        rules,
    };
}

export function assessPdfAFile(bytes, { inspection, profile = '3b' } = {}) {
    checkInput(bytes, profile);
    return buildReport(profile, [...inspectFileHeader(bytes), inspectEof(bytes)], inspection);
}

export async function validatePdfA(bytes, { profile = '3b' } = {}) {
    checkInput(bytes, profile);
    const data = new Uint8Array(bytes);
    const fileRules = [...inspectFileHeader(data), inspectEof(data)];
    const sourceSha256 = await sha256(data);
    const pdfjs = await loadPdfRuntime();
    const task = pdfjs.getDocument({ data, isEvalSupported: false });
    let inspection;
    let passwordRequired = false;
    try {
        inspection = await (await task.promise).getPdfAFileInspection();
    } catch (error) {
        passwordRequired = error instanceof pdfjs.PasswordException;
    } finally {
        await task.destroy();
    }
    return { ...buildReport(profile, fileRules, inspection, passwordRequired), sourceSha256 };
}
