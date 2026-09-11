import { XmlDocument, XsdValidator, ParseOption, XmlBufferInputProvider, xmlRegisterInputProvider } from 'libxml2-wasm';

import { PROFILE_PACKS, ruleStages } from './profiles.mjs';
export { PROFILE_ID, SUPPORTED_PROFILES } from './profiles.mjs';
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
async function loadRules(pack, SaxonJS, loadAsset) {
    const asset = name => loadAsset(pack.key + '/' + name);
    const manifest = JSON.parse(await asset('manifest.json'));
    if (manifest.profileKey !== pack.key) throw new Error('Regelpaket passt nicht zum erkannten Profil.');
    const verified = async name => {
        const text = await asset(name);
        if (await sha256(encoder.encode(text)) !== manifest.files[name]) throw new Error(`Regeldatei beschädigt: ${name}`);
        return text;
    };
    const schemasText = await verified('schemas.json');
    const schemas = JSON.parse(schemasText);
    const base = `https://zugferd-rules.invalid/${manifest.files['schemas.json']}/`;
    for (const [name, source] of Object.entries(schemas)) provider.addBuffer(base + name, encoder.encode(source));
    let schemaDoc;
    let schema;
    try {
        const schemaName = pack.schema || pack.stem + '.xsd';
        schemaDoc = XmlDocument.fromString(schemas[schemaName], { ...OPTIONS, url: base + schemaName });
        schema = XsdValidator.fromDoc(schemaDoc);
    } finally { schemaDoc?.dispose(); }
    const stages = [];
    try {
        for (const stage of ruleStages(pack)) {
            const sef = JSON.parse(await verified(stage.sef));
            const documentPool = {};
            if (stage.codes) documentPool[base + stage.codes] = await SaxonJS.getResource({
                text: await verified('source/' + stage.codes), type: 'xml', baseURI: base + stage.codes });
            stages.push({ ...stage, sef, sefName: stage.sef, documentPool });
        }
    }
    catch (error) { schema.dispose(); throw error; }
    return { schema, stages, base, manifest };
}

export async function createValidator({ SaxonJS, loadAsset }) {
    if (!SaxonJS?.transform || !loadAsset) throw new Error('XML-Laufzeit oder Regeldateien fehlen.');
    // A failed load is not cached: retrying after a missing asset is restored works.
    const loaded = new Map();
    let disposed = false;
    let busy = false;

    return {
        dispose() {
            if (busy) throw new Error('Prüfung läuft.');
            if (!disposed) { for (const rules of loaded.values()) rules.schema.dispose(); loaded.clear(); disposed = true; }
        },
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
                status: 'not-checked', profileId: '', profile: '', scope: 'ZUGFeRD/Factur-X XML',
                engine: 'libxml2-wasm 0.7.2 + SaxonJS 2.7.0', ruleset: '', rulesetSha256: '',
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
                const pack = PROFILE_PACKS.find(p => p.ids.includes(result.profileId));
                if (!pack) {
                    result.status = result.profileId ? 'unsupported' : 'invalid';
                    result.issues.push({ severity: result.profileId ? 'warning' : 'error', stage: 'profile', rule: result.profileId ? 'PROFILE-UNSUPPORTED' : 'PROFILE-MISSING', message: 'Die Profilkennung fehlt oder wird noch nicht unterstützt. Unterstützt: BASIC, EN16931, EXTENDED und XRechnung 3.0 CIUS (CII) mit den festgelegten Profilkennungen.' });
                    return result;
                }
                result.profile = pack.label;
                result.scope = pack.scope || `ZUGFeRD/Factur-X ${pack.label} XML`;
                let rules = loaded.get(pack.key);
                if (!rules) { rules = await loadRules(pack, SaxonJS, loadAsset); loaded.set(pack.key, rules); }
                const { schema, stages, base, manifest } = rules;
                result.ruleset = manifest.ruleset;
                result.rulesetSha256 = stages.length === 1 ? manifest.files[stages[0].sefName]
                    : await sha256(encoder.encode(stages.map(s => manifest.files[s.sefName]).join('\n')));
                result.schemaSha256 = manifest.files['schemas.json'];
                result.compilerInputAdaptations = manifest.compilerInputAdaptations || [manifest.compilerInputAdaptation].filter(Boolean);
                try { schema.validate(doc); result.xsd.status = 'valid'; }
                catch (error) {
                    result.xsd.status = 'invalid';
                    for (const detail of error.details?.length ? error.details : [error]) {
                        result.issues.push({ severity: 'error', stage: 'xsd', rule: 'XSD', location: detail.line ? `Zeile ${detail.line}` : '', message: detail.message.trim() });
                    }
                    result.status = 'invalid';
                    return result; // Prevent arithmetic/cast failures on schema-invalid data.
                }
                result.schematron.stages = [];
                result.customLevels = pack.customLevels || {};
                for (const stage of stages) {
                const transformed = await SaxonJS.transform({
                    stylesheetInternal: stage.sef, stylesheetBaseURI: base + stage.sefName,
                    sourceText: doc.toString({ encoding: 'utf-8' }), sourceBaseURI: 'urn:invoice:input',
                    documentPool: stage.documentPool,
                    destination: 'serialized', nonInteractive: true
                }, 'async');
                if (stages.length === 1) result.svrl = transformed.principalResult;
                svrl = XmlDocument.fromString(transformed.principalResult, OPTIONS);
                if (!svrl.get('/svrl:schematron-output', NS)) throw new Error('Kein SVRL-Prüfbericht erhalten.');
                const fired = svrl.find('//svrl:fired-rule', NS).length;
                if (!fired) throw new Error(`Keine Schematron-Regeln ausgeführt: ${stage.key}.`);
                const stageIssues = [];
                for (const assertion of svrl.find('//svrl:failed-assert | //svrl:successful-report', NS)) {
                    const message = content(assertion, 'svrl:text');
                    const rule = content(assertion, '@id') || message.match(/\[([^\]]+)\]/)?.[1] || 'SCHEMATRON';
                    const flag = (content(assertion, '@flag') || content(assertion, '@role')).toLowerCase();
                    // KoSIT's explicit scenario overrides are versioned and disclosed;
                    // Factur-X keeps upstream severity unchanged.
                    const severity = pack.customLevels?.[rule] || (flag === 'information' ? 'info'
                        : ['warning', 'info'].includes(flag) ? flag : 'error');
                    stageIssues.push({ severity, originalFlag: flag, stage: 'schematron', layer: stage.key, rule,
                        location: content(assertion, '@location'), test: content(assertion, '@test'), message });
                }
                result.issues.push(...stageIssues);
                result.schematron.fired += fired;
                result.schematron.stages.push({ key: stage.key, status: stageIssues.some(i => i.severity === 'error') ? 'invalid' : 'valid',
                    fired, sha256: manifest.files[stage.sefName], svrl: transformed.principalResult });
                svrl.dispose(); svrl = undefined;
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
