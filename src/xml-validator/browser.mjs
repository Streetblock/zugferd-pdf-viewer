import { createValidator as createCore } from './core.mjs';
export { PROFILE_ID, MAX_XML_BYTES } from './core.mjs';
export function createValidator({ assetBaseUrl = new URL('../rules/en16931/', import.meta.url), SaxonJS = globalThis.SaxonJS } = {}) {
    return createCore({ SaxonJS, loadAsset: async name => {
        const response = await fetch(new URL(name, assetBaseUrl), { signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error('Regeldateien konnten nicht geladen werden.');
        return response.text();
    } });
}
