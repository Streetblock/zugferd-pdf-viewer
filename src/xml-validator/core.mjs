import { XmlDocument, XsdValidator, ParseOption, XmlBufferInputProvider, xmlRegisterInputProvider } from 'libxml2-wasm';

export const PROFILE_ID = 'urn:cen.eu:en16931:2017';
export const MAX_XML_BYTES = 5 * 1024 * 1024;
const NS = {
    rsm: 'urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100',
    ram: 'urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100',
    svrl: 'http://purl.oclc.org/dsdl/svrl'
};
const OPTIONS = { option: ParseOption.XML_PARSE_NONET | ParseOption.XML_PARSE_NO_XXE };
const provider = new XmlBufferInputProvider({});
xmlRegisterInputProvider(provider);
const encoder = new TextEncoder();
const content = (node, xpath) => node.get(xpath, NS)?.content?.trim() || '';

export async function sha256(bytes) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Pure JS/WASM validation. loadAsset reads only the shipped rules, never invoice URLs. */
export async function createValidator({ SaxonJS, loadAsset }) {
    if (!SaxonJS?.transform || !loadAsset) throw new Error('XML-Laufzeit oder Regeldateien fehlen.');
    const manifest = JSON.parse(await loadAsset('manifest.json'));
    const verified = async name => {
        const text = await loadAsset(name);
        if (await sha256(encoder.encode(text)) !== manifest.files[name]) throw new Error(`Regeldatei beschädigt: ${name}`);
        return text;
    };
    const [schemasText, sefText, codesText] = await Promise.all([
        verified('schemas.json'), verified('en16931.sef.json'), verified('source/FACTUR-X_EN16931_codedb.xml')
    ]);
    const schemas = JSON.parse(schemasText);
    const base = `https://zugferd-rules.invalid/${manifest.files['schemas.json']}/`;
    for (const [name, source] of Object.entries(schemas)) provider.addBuffer(base + name, encoder.encode(source));
    let schemaDoc;
    let schema;
    try {
        schemaDoc = XmlDocument.fromString(schemas['FACTUR-X_EN16931.xsd'], { ...OPTIONS, url: base + 'FACTUR-X_EN16931.xsd' });
        schema = XsdValidator.fromDoc(schemaDoc);
    } finally { schemaDoc?.dispose(); }
    let codes;
    let sef;
    try { sef = JSON.parse(sefText); codes = await SaxonJS.getResource({ text: codesText, type: 'xml', baseURI: base + 'FACTUR-X_EN16931_codedb.xml' }); }
    catch (error) { schema.dispose(); throw error; }
    let disposed = false;
    let busy = false;

    return {
        dispose() { if (busy) throw new Error('Prüfung läuft.'); if (!disposed) { schema.dispose(); disposed = true; } },
        async validateXml(input) {
            if (disposed) throw new Error('Validator wurde geschlossen.');
            if (busy) throw new Error('Diese Validator-Instanz prüft bereits eine Datei.');
            const bytes = typeof input === 'string' ? encoder.encode(input)
                : input instanceof ArrayBuffer ? new Uint8Array(input) : input;
            if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.length > MAX_XML_BYTES) {
                throw new Error('XML muss zwischen 1 Byte und 5 MB groß sein.');
            }
            busy = true;
            let doc, svrl;
            const result = {
                status: 'not-checked', profileId: '', scope: 'ZUGFeRD/Factur-X EN 16931 XML',
                engine: 'libxml2-wasm 0.7.2 + SaxonJS 2.7.0', ruleset: manifest.ruleset,
                rulesetSha256: manifest.files['en16931.sef.json'],
                sourceSha256: '', checkedAt: new Date().toISOString(),
                xsd: { status: 'not-checked' }, schematron: { status: 'not-checked', fired: 0 }, issues: []
            };
            try {
                result.sourceSha256 = await sha256(bytes);
                try {
                    doc = XmlDocument.fromBuffer(bytes, OPTIONS);
                    if (doc.dtd) throw new Error('DTD und Entitäten sind nicht erlaubt.');
                } catch (error) {
                    result.status = 'invalid';
                    result.issues.push({ severity: 'error', stage: 'parse', rule: 'XML-PARSE', message: error.message });
                    return result;
                }
                if (!doc.get('/rsm:CrossIndustryInvoice', NS)) {
                    result.status = 'unsupported';
                    result.issues.push({ severity: 'warning', stage: 'profile', rule: 'SYNTAX-UNSUPPORTED', message: 'Nur CII CrossIndustryInvoice:100 wird unterstützt.' });
                    return result;
                }
                result.profileId = content(doc, '/rsm:CrossIndustryInvoice/rsm:ExchangedDocumentContext/ram:GuidelineSpecifiedDocumentContextParameter/ram:ID');
                if (result.profileId !== PROFILE_ID) {
                    result.status = result.profileId ? 'unsupported' : 'invalid';
                    result.issues.push({ severity: result.profileId ? 'warning' : 'error', stage: 'profile', rule: 'PROFILE-UNSUPPORTED', message: 'Diese erste JS-Version prüft ausschließlich das Profil EN 16931. Die Profilkennung fehlt oder wird noch nicht unterstützt.' });
                    return result;
                }
                try { schema.validate(doc); result.xsd.status = 'valid'; }
                catch (error) {
                    result.xsd.status = 'invalid';
                    for (const detail of error.details?.length ? error.details : [error]) {
                        result.issues.push({ severity: 'error', stage: 'xsd', rule: 'XSD', location: detail.line ? `Zeile ${detail.line}` : '', message: detail.message.trim() });
                    }
                    result.status = 'invalid';
                    return result; // Prevent arithmetic/cast failures on schema-invalid data.
                }
                const transformed = await SaxonJS.transform({
                    stylesheetInternal: sef, stylesheetBaseURI: base + 'en16931.sef.json',
                    sourceText: doc.toString({ encoding: 'utf-8' }), sourceBaseURI: 'urn:invoice:input',
                    documentPool: { [base + 'FACTUR-X_EN16931_codedb.xml']: codes },
                    destination: 'serialized', nonInteractive: true
                }, 'async');
                result.svrl = transformed.principalResult;
                svrl = XmlDocument.fromString(result.svrl, OPTIONS);
                if (!svrl.get('/svrl:schematron-output', NS)) throw new Error('Kein SVRL-Prüfbericht erhalten.');
                result.schematron.fired = svrl.find('//svrl:fired-rule', NS).length;
                if (!result.schematron.fired) throw new Error('Keine Schematron-Regeln ausgeführt.');
                for (const assertion of svrl.find('//svrl:failed-assert', NS)) {
                    const message = content(assertion, 'svrl:text');
                    const rule = content(assertion, '@id') || message.match(/\[([^\]]+)\]/)?.[1] || 'SCHEMATRON';
                    const flag = content(assertion, '@flag').toLowerCase();
                    // Keep the rule's original severity; unlike Mustang, do not silently downgrade rules.
                    const severity = ['warning', 'info'].includes(flag) ? flag : 'error';
                    result.issues.push({ severity, stage: 'schematron', rule, location: content(assertion, '@location'), test: content(assertion, '@test'), message });
                }
                result.schematron.status = result.issues.some(i => i.severity === 'error') ? 'invalid' : 'valid';
                result.status = result.schematron.status;
                return result;
            } catch (error) {
                result.status = 'not-checked';
                result.issues.push({ severity: 'warning', stage: 'engine', rule: 'ENGINE-ERROR', message: error.message });
                return result;
            } finally { svrl?.dispose(); doc?.dispose(); busy = false; }
        }
    };
}
