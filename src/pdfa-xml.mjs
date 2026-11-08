import { inspectPdfAXmp } from './pdfa-xmp.mjs';

function decodeXml(bytes) {
    let encoding = 'utf-8';
    if ((bytes[0] === 255 && bytes[1] === 254) || (bytes[0] === 60 && bytes[1] === 0)) encoding = 'utf-16le';
    else if ((bytes[0] === 254 && bytes[1] === 255) || (bytes[0] === 0 && bytes[1] === 60)) encoding = 'utf-16be';
    else {
        const header = new TextDecoder('ascii').decode(bytes.subarray(0, 200));
        encoding = header.match(/<\?xml[^>]*encoding\s*=\s*["']([^"']+)/i)?.[1] || encoding;
    }
    return new TextDecoder(encoding, { fatal: true }).decode(bytes);
}

// Expose just the DOM fields consumed by the shared rule engine, without a DOM dependency in Node.
function xmlElement(node, lib) {
    const attributes = node.attrs.map(attr => ({
        namespaceURI: attr.namespaceUri || null,
        localName: attr.name,
        prefix: attr.namespacePrefix || null,
        nodeType: 2,
        value: attr.value,
        textContent: attr.value,
    }));
    let childNodes;
    return {
        nodeType: 1,
        localName: node.name,
        namespaceURI: node.namespaceUri || null,
        prefix: node.namespacePrefix || null,
        attributes,
        get textContent() { return node.content; },
        get childNodes() {
            if (!childNodes) {
                childNodes = [];
                for (let child = node.firstChild; child; child = child.next) {
                    if (child instanceof lib.XmlElement) childNodes.push(xmlElement(child, lib));
                    else if (child instanceof lib.XmlText) childNodes.push({ nodeType: 3, textContent: child.content });
                    else if (child instanceof lib.XmlCData) childNodes.push({ nodeType: 4, textContent: child.content });
                    else if (child instanceof lib.XmlComment) childNodes.push({ nodeType: 8, textContent: child.content });
                    else childNodes.push({ nodeType: 7, textContent: child.content });
                }
            }
            return childNodes;
        },
        get children() { return this.childNodes.filter(child => child.nodeType === 1); },
        getAttributeNS(ns, name) {
            return attributes.find(attr => attr.namespaceURI === (ns || null) && attr.localName === name)?.value ?? null;
        },
        hasAttributeNS(ns, name) { return this.getAttributeNS(ns, name) !== null; },
    };
}

export async function inspectXmpBytes(bytes) {
    const xml = decodeXml(bytes);
    if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('XMP mit DTD oder Entitäten wird nicht verarbeitet.');
    if (typeof DOMParser === 'function') {
        const doc = new DOMParser().parseFromString(xml, 'application/xml');
        if (doc.querySelector('parsererror')) throw new Error('XMP ist nicht wohlgeformt.');
        return inspectPdfAXmp(doc);
    }

    const lib = await import('libxml2-wasm');
    const doc = lib.XmlDocument.fromBuffer(new TextEncoder().encode(xml), {
        encoding: 'utf-8',
        option: lib.ParseOption.XML_PARSE_NONET | lib.ParseOption.XML_PARSE_NO_XXE,
    });
    try {
        if (doc.dtd || doc.warnings?.length) throw new Error('XMP ist nicht sicher als XML lesbar.');
        return inspectPdfAXmp({ documentElement: doc.root && xmlElement(doc.root, lib) });
    } finally {
        doc.dispose();
    }
}
