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
    ] }
].map(p => Object.freeze({ ...p, ids: Object.freeze(p.ids) })));
export const SUPPORTED_PROFILES = Object.freeze(PROFILE_PACKS.flatMap(p => p.ids));
