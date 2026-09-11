// Exact identifiers from the pinned profiles' code lists. Never route by substring.
export const PROFILE_ID = 'urn:cen.eu:en16931:2017';
export const PROFILE_PACKS = Object.freeze([
    { key: 'en16931', label: 'EN16931', stem: 'FACTUR-X_EN16931', ids: [PROFILE_ID] },
    { key: 'basic', label: 'BASIC', stem: 'FACTUR-X_BASIC', ids: [
        PROFILE_ID + '#compliant#urn:factur-x.eu:1p0:basic',
        PROFILE_ID + '#compliant#urn:zugferd.de:2p0:basic'
    ] },
    { key: 'extended', label: 'EXTENDED', stem: 'FACTUR-X_EXTENDED', ids: [
        PROFILE_ID + '#conformant#urn:factur-x.eu:1p0:extended',
        PROFILE_ID + '#conformant#urn:zugferd.de:2p0:extended'
    ] },
    { key: 'xrechnung', label: 'XRechnung 3.0 (CII)', scope: 'XRechnung 3.0 CIUS (CII) XML',
        schema: 'CrossIndustryInvoice_100pD16B.xsd',
        ids: [PROFILE_ID + '#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0'],
        stages: [
            { key: 'cen', source: 'EN16931-CII-validation.xsl', sef: 'cen.sef.json' },
            { key: 'xrechnung', source: 'XRechnung-CII-validation.xsl', sef: 'xrechnung.sef.json' }
        ],
        // Exact overrides from KoSIT's CIUS CII scenario, release 2026-08-31.
        customLevels: { 'BR-CL-23': 'warning', 'BR-CL-21': 'warning',
            'CII-SR-452': 'error', 'CII-SR-453': 'error', 'CII-SR-454': 'error',
            'CII-SR-465': 'error', 'CII-SR-466': 'error',
            'CII-SR-475': 'info', 'CII-SR-476': 'info' }
    }
].map(p => Object.freeze({ ...p, ids: Object.freeze(p.ids) })));
export const SUPPORTED_PROFILES = Object.freeze(PROFILE_PACKS.flatMap(p => p.ids));

export const ruleStages = pack => pack.stages || [{ key: pack.key, source: pack.stem + '.xslt',
    sef: pack.key + '.sef.json', codes: pack.stem + '_codedb.xml' }];
export const ruleAssets = pack => ['manifest.json', 'schemas.json', ...ruleStages(pack).flatMap(s =>
    [s.sef, ...(s.codes ? ['source/' + s.codes] : [])])];
