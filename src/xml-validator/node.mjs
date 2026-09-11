import SaxonJS from 'saxon-js';
import { readFile } from 'node:fs/promises';
import { createValidator as createCore } from './core.mjs';
export { PROFILE_ID, SUPPORTED_PROFILES, MAX_XML_BYTES } from './core.mjs';
export function createValidator() {
    return createCore({ SaxonJS, loadAsset: name => readFile(new URL('../../rules/' + name, import.meta.url), 'utf8') });
}
