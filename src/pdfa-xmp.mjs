const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const XML = 'http://www.w3.org/XML/1998/namespace';
const XMLNS = 'http://www.w3.org/2000/xmlns/';
const XMP_META = 'adobe:ns:meta/';
const PDFA = 'http://www.aiim.org/pdfa/ns/';
const EXT = PDFA + 'extension/';
const SCHEMA = PDFA + 'schema#';
const PROPERTY = PDFA + 'property#';
const TYPE = PDFA + 'type#';
const FIELD = PDFA + 'field#';
const DECLARATION = '6.6.2.3.1-1';
const VALUE = '6.6.2.3.1-2';
const UNDEFINED_FIELDS = '6.6.2.3.2-1';
const schemaRule = number => '6.6.2.3.3-' + number;
const extensionRules = [UNDEFINED_FIELDS, ...Array.from({ length: 18 }, (_, index) => schemaRule(index + 1))];
const ruleIds = [DECLARATION, VALUE, ...extensionRules];
const rank = { 'not-applicable': 0, pass: 1, unknown: 2, fail: 3 };
const MAX_ITEMS = 4096;

const namespaces = new Map([
    [SCHEMA, 'pdfaSchema'], [PROPERTY, 'pdfaProperty'], [TYPE, 'pdfaType'], [FIELD, 'pdfaField'],
]);
const builtInTypes = new Set((
    'boolean integer locale real mimetype propername text any agentname rational gpscoordinate ' +
    'renditionclass date uri url xpath choice dimensions thumbnail resource-event resourceevent ' +
    'resourceref version job flash oecf/sfr cfapattern devicesettings colorant font beatsplicestretch ' +
    'marker media projectlink resamplestretch time timecode timescalestretch bag seq alt'
).split(' '));
// Common predefined properties from XMP 2005 and the PDF/A identification schema.
// An unlisted property in a standard namespace is not decided by this subset.
const predefined = new Map([
    [PDFA + 'id/', { part: 'Integer', conformance: 'Text', amd: 'Text', corr: 'Text' }],
    ['http://ns.adobe.com/pdf/1.3/', { Keywords: 'Text', PDFVersion: 'Text', Producer: 'AgentName' }],
    ['http://ns.adobe.com/xap/1.0/', {
        Advisory: 'Bag Text', BaseURL: 'URL', CreateDate: 'Date', CreatorTool: 'AgentName',
        Identifier: 'Bag Text', Label: 'Text', MetadataDate: 'Date', ModifyDate: 'Date',
        Nickname: 'Text', Rating: 'Real', Thumbnails: 'Alt Thumbnail',
    }],
    ['http://purl.org/dc/elements/1.1/', {
        contributor: 'Bag ProperName', coverage: 'Text', creator: 'Seq ProperName', date: 'Seq Date',
        description: 'Lang Alt', format: 'MIMEType', identifier: 'Text', language: 'Bag Locale',
        publisher: 'Bag ProperName', relation: 'Bag Text', rights: 'Lang Alt', source: 'Text',
        subject: 'Bag Text', title: 'Lang Alt', type: 'Bag Text',
    }],
    ['http://ns.adobe.com/xap/1.0/mm/', {
        DerivedFrom: 'ResourceRef', DocumentID: 'URI', History: 'Seq ResourceEvent',
        InstanceID: 'URI', LastURL: 'URL', ManagedFrom: 'ResourceRef', Manager: 'AgentName',
        ManageTo: 'URI', ManageUI: 'URI', ManagerVariant: 'Text',
        RenditionClass: 'RenditionClass', RenditionOf: 'ResourceRef', RenditionParams: 'Text',
        SaveID: 'Integer', VersionID: 'Text', Versions: 'Seq Version',
    }],
    ['http://ns.adobe.com/xap/1.0/rights/', {
        Certificate: 'URL', Marked: 'Boolean', Owner: 'Bag ProperName', UsageTerms: 'Lang Alt', WebStatement: 'URL',
    }],
    ['http://ns.adobe.com/xap/1.0/bj/', { JobRef: 'Bag Job' }],
]);

const is = (node, ns, name) => node?.namespaceURI === ns && node.localName === name;
const children = node => Array.from(node?.children || []);
const attributes = node => Array.from(node?.attributes || []);
const isPropertyAttribute = attr => ![RDF, XML, XMLNS].includes(attr.namespaceURI);
const properties = node => [...attributes(node).filter(isPropertyAttribute), ...children(node)];
const significantText = node => Array.from(node?.childNodes || []).some(child => (child.nodeType === 3 || child.nodeType === 4) && /\S/.test(child.textContent || ''));
const expandedName = node => '{' + (node.namespaceURI || '') + '}' + node.localName;
const absoluteNamespaceUri = value => /^[a-z][a-z0-9+.-]*:[^\s<>"\\]*$/i.test(value) && !/%(?![0-9a-f]{2})/i.test(value);

function standardNamespace(ns) {
    return predefined.has(ns) || /^https?:\/\/(?:ns\.adobe\.com\/|purl\.org\/dc\/|iptc\.org\/|www\.aiim\.org\/pdfa\/ns\/|ns\.useplus\.org\/)/i.test(ns);
}

function shape(node) {
    if (node.nodeType === 2) return { kind: 'text', value: node.value };
    const nested = children(node);
    const resource = node.getAttributeNS(RDF, 'resource');
    if (attributes(node).some(isPropertyAttribute) || ['parseType', 'nodeID', 'datatype'].some(key => node.hasAttributeNS(RDF, key))) {
        return { kind: 'opaque' };
    }
    if (resource != null) return nested.length || significantText(node) ? { kind: 'opaque' } : { kind: 'uri', value: resource };
    if (!nested.length) return { kind: 'text', value: node.textContent || '' };
    if (nested.length === 1 && !significantText(node) && ['Bag', 'Seq', 'Alt'].some(name => is(nested[0], RDF, name))) {
        return { kind: 'array', name: nested[0].localName, items: children(nested[0]), container: nested[0] };
    }
    return { kind: 'opaque' };
}

function listItem(item) {
    if (item.getAttributeNS(RDF, 'parseType') === 'Resource' && !significantText(item)) return item;
    const nested = children(item);
    if (!item.hasAttributeNS(RDF, 'parseType') && !significantText(item) &&
        nested.length === 1 && is(nested[0], RDF, 'Description')) return nested[0];
    return null;
}

function date(value) {
    const parts = /^(\d{4})(?:-(\d\d)(?:-(\d\d)(?:T(\d\d):(\d\d)(?::(\d\d)(?:\.\d+)?)?(?:Z|[+-](\d\d):(\d\d)))?)?)?$/.exec(value);
    if (!parts) return false;
    const [, year, month, day, hour, minute, second, zoneHour, zoneMinute] = parts;
    const y = Number(year);
    const monthDays = [31, y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return (!month || Number(month) >= 1 && Number(month) <= 12) &&
        (!day || Number(day) >= 1 && Number(day) <= monthDays[Number(month) - 1]) &&
        (!hour || Number(hour) <= 23) && (!minute || Number(minute) <= 59) &&
        (!second || Number(second) <= 59) && (!zoneHour || Number(zoneHour) <= 14) &&
        (!zoneMinute || Number(zoneMinute) <= (Number(zoneHour) === 14 ? 0 : 59));
}

function typeInfo(value) {
    const text = value.trim();
    if (/^lang alt$/i.test(text)) return { array: 'Alt', name: text, type: 'text', langAlt: true };
    if (/^(?:open|closed)\s+choice(?:\s+of\s+text)?$/i.test(text)) return { name: text, type: 'choice' };
    const array = /^(Bag|Seq|Alt)\s+(?:of\s+)?(.+)$/i.exec(text);
    const name = array ? array[2] : text;
    return {
        array: array ? array[1][0].toUpperCase() + array[1].slice(1).toLowerCase() : null,
        name,
        type: name.toLowerCase(),
    };
}

function checkValue(node, info, definitions, budget, depth = 0) {
    if (depth > 24 || budget.remaining-- <= 0) return 'unknown';
    const value = shape(node);
    if (info.array) {
        if (value.kind === 'opaque') return 'unknown';
        if (value.kind !== 'array' || value.name !== info.array) return 'fail';
        if (value.items.length > MAX_ITEMS) return 'unknown';
        let result = 'pass';
        for (const item of value.items) {
            if (info.langAlt && is(item, RDF, 'li') && !item.getAttributeNS(XML, 'lang') && shape(item).kind !== 'opaque') return 'fail';
            const status = is(item, RDF, 'li') ? checkValue(item, { ...info, array: null }, definitions, budget, depth + 1) : 'unknown';
            if (rank[status] > rank[result]) result = status;
        }
        return result;
    }
    const custom = definitions?.get(info.name);
    if (custom && custom.namespace && custom.fields.size) {
        if (node.nodeType === 2) return 'fail';
        const record = listItem(node) || (!children(node).length && !significantText(node) &&
            attributes(node).some(isPropertyAttribute) &&
            !node.hasAttributeNS(RDF, 'parseType') && !node.hasAttributeNS(RDF, 'resource') ? node : null);
        if (!record) return value.kind === 'opaque' ? 'unknown' : 'fail';
        let result = custom.complete ? 'pass' : 'unknown';
        for (const field of properties(record)) {
            const fieldType = field.namespaceURI === custom.namespace ? custom.fields.get(field.localName) : null;
            const status = fieldType ? checkValue(field, typeInfo(fieldType), definitions, budget, depth + 1) :
                custom.complete ? 'fail' : 'unknown';
            if (rank[status] > rank[result]) result = status;
        }
        return result;
    }
    if (value.kind === 'opaque') return 'unknown';
    if (['text', 'agentname', 'propername', 'rational', 'renditionclass', 'xpath'].includes(info.type)) {
        return value.kind === 'text' ? 'pass' : 'fail';
    }
    if (info.type === 'integer' || info.type === 'boolean') {
        if (value.kind !== 'text') return 'fail';
        const pattern = info.type === 'integer' ? /^[+-]?\d+$/ : /^(true|false)$/i;
        return pattern.test(value.value.trim()) ? 'pass' : 'fail';
    }
    if (info.type === 'uri' || info.type === 'url') {
        return value.kind === 'array' ? 'fail' : 'pass';
    }
    if (['date', 'mimetype', 'real'].includes(info.type)) {
        if (value.kind !== 'text') return 'fail';
        const text = value.value.trim();
        const valid = info.type === 'date' ? date(text) : info.type === 'real' ?
            /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text) :
            /^[\w!#$%&'*+.^-]+\/[\w!#$%&'*+.^-]+$/.test(text);
        return valid ? 'pass' : 'unknown';
    }
    // Remaining built-in structured types and specialized lexical grammars
    // are outside this inspection's scope.
    return 'unknown';
}

class XmpInspection {
    constructor() {
        this.checks = new Map();
        this.schemas = new Map();
        this.complete = true;
        this.remaining = MAX_ITEMS;
        this.valueBudget = { remaining: MAX_ITEMS };
        this.counts = { schemas: 0, properties: 0, valueTypes: 0, fields: 0 };
    }

    note(id, status, location, detail) {
        if (!this.checks.has(id) || rank[status] > rank[this.checks.get(id).status]) {
            this.checks.set(id, { id, status, location, detail });
        }
    }

    unknown(ids, location, detail) {
        for (const id of ids) this.note(id, 'unknown', location, detail);
    }

    test(number, condition, location, detail) {
        this.note(schemaRule(number), condition ? 'pass' : 'fail', location, condition ? 'Extension schema field checked.' : detail);
    }

    take(location) {
        if (this.remaining-- > 0) return true;
        this.complete = false;
        this.unknown(ruleIds, location, 'XMP extension inspection limit exceeded.');
        return false;
    }

    fields(record, ns, allowed, location) {
        const byName = new Map();
        let valid = true;
        for (const node of properties(record)) {
            if (!this.take(location)) return null;
            if (node.namespaceURI !== ns || !allowed.includes(node.localName) || byName.has(node.localName)) {
                valid = false;
                if (byName.has(node.localName)) byName.set(node.localName, null);
            } else {
                byName.set(node.localName, node);
            }
        }
        this.note(UNDEFINED_FIELDS, valid ? 'pass' : 'fail', location,
            valid ? 'Only defined extension fields are present.' : 'The extension record contains an undefined or duplicate field.');
        return byName;
    }

    literal(fields, ns, name, number, path, kind = 'text') {
        const location = path + '/' + name;
        const node = fields.get(name);
        if (!node || node.prefix !== namespaces.get(ns)) {
            this.test(number, false, location, 'Required field is missing, duplicated or uses the wrong prefix.');
            return null;
        }
        const value = shape(node);
        if (value.kind === 'opaque') {
            this.unknown([schemaRule(number)], location, 'The extension field uses an unsupported RDF form.');
            return null;
        }
        const valueText = (value.value ?? '').trim();
        const valid = kind === 'uri'
            ? ['text', 'uri'].includes(value.kind) && absoluteNamespaceUri(valueText)
            : value.kind === 'text' && (kind !== 'category' || ['internal', 'external'].includes(valueText));
        this.test(number, valid, location, 'The extension field does not have the required value type or category.');
        return valid ? valueText : null;
    }

    sequence(fields, ns, name, number, path, optional = false) {
        const location = path + '/' + name;
        if (optional && !fields.has(name)) return [];
        const node = fields.get(name);
        if (!node || node.prefix !== namespaces.get(ns)) {
            this.test(number, false, location, 'Required Seq field is missing, duplicated or uses the wrong prefix.');
            return null;
        }
        const value = shape(node);
        if (optional && value.kind === 'text' && !value.value.trim()) {
            this.test(number, true, location);
            return [];
        }
        if (value.kind === 'opaque') {
            this.unknown([schemaRule(number)], location, 'The extension sequence uses an unsupported RDF form.');
            return null;
        }
        const valid = value.kind === 'array' && value.name === 'Seq' && !significantText(value.container) &&
            value.items.every(item => is(item, RDF, 'li'));
        this.test(number, valid, location, 'The extension field must contain an RDF Seq of list items.');
        return valid ? value.items : null;
    }

    records(items, path, visit) {
        if (!items) return false;
        let complete = true;
        for (const [index, item] of items.entries()) {
            const location = path + '[' + (index + 1) + ']';
            if (!this.take(location)) return false;
            const record = listItem(item);
            if (record) visit(record, location);
            else {
                complete = false;
                this.unknown(extensionRules, location, 'The RDF list item is not an inspectable extension record.');
            }
        }
        return complete;
    }

    schema(record, path) {
        this.counts.schemas++;
        const fields = this.fields(record, SCHEMA, ['schema', 'namespaceURI', 'prefix', 'property', 'valueType'], path);
        if (!fields) return;
        this.literal(fields, SCHEMA, 'schema', 2, path);
        const namespace = this.literal(fields, SCHEMA, 'namespaceURI', 3, path, 'uri');
        this.literal(fields, SCHEMA, 'prefix', 4, path);
        if (!namespace) this.complete = false;
        const items = this.sequence(fields, SCHEMA, 'property', 5, path);
        const typeItems = this.sequence(fields, SCHEMA, 'valueType', 6, path, true);
        const types = new Map();
        const pending = [];
        let typesComplete = true;
        typesComplete = this.records(typeItems, path + '/valueType', (record, location) => {
            this.counts.valueTypes++;
            const fields = this.fields(record, TYPE, ['type', 'namespaceURI', 'prefix', 'description', 'field'], location);
            if (!fields) {
                typesComplete = false;
                return;
            }
            const name = this.literal(fields, TYPE, 'type', 11, location);
            const namespace = this.literal(fields, TYPE, 'namespaceURI', 12, location, 'uri');
            this.literal(fields, TYPE, 'prefix', 13, location);
            this.literal(fields, TYPE, 'description', 14, location);
            const members = new Map();
            let membersComplete = true;
            membersComplete = this.records(this.sequence(fields, TYPE, 'field', 15, location, true), location + '/field', (record, location) => {
                this.counts.fields++;
                const fields = this.fields(record, FIELD, ['name', 'valueType', 'description'], location);
                if (!fields) {
                    membersComplete = false;
                    return;
                }
                const name = this.literal(fields, FIELD, 'name', 16, location);
                const type = this.literal(fields, FIELD, 'valueType', 17, location);
                if (!name || !type || members.has(name)) membersComplete = false;
                else members.set(name, type);
                pending.push([type, 17, location + '/valueType']);
                this.literal(fields, FIELD, 'description', 18, location);
            }) && membersComplete;
            if (!name || types.has(name)) {
                if (name) types.set(name, null);
                typesComplete = false;
            } else {
                types.set(name, { namespace, fields: members, complete: membersComplete });
            }
        }) && typesComplete;
        const declared = namespace ? this.schemas.get(namespace) || new Map() : new Map();
        if (namespace) this.schemas.set(namespace, declared);
        this.complete = this.records(items, path + '/property', (record, location) => {
            this.counts.properties++;
            const fields = this.fields(record, PROPERTY, ['name', 'valueType', 'category', 'description'], location);
            if (!fields) return;
            const name = this.literal(fields, PROPERTY, 'name', 7, location);
            const valueType = this.literal(fields, PROPERTY, 'valueType', 8, location);
            this.literal(fields, PROPERTY, 'category', 9, location, 'category');
            this.literal(fields, PROPERTY, 'description', 10, location);
            if (!name) this.complete = false;
            else if (declared.has(name)) declared.set(name, null);
            else declared.set(name, { valueType, types });
            pending.push([valueType, 8, location + '/valueType']);
        }) && this.complete;
        for (const [value, number, location] of pending) {
            if (value === null) continue;
            const info = typeInfo(value);
            if (info.name && (types.has(info.name) || builtInTypes.has(info.type))) continue;
            if (typesComplete) this.test(number, false, location, 'The extension value type is not defined.');
            else this.unknown([schemaRule(number)], location, 'Custom type declarations could not be inspected completely.');
        }
    }

    container(node, path) {
        const value = shape(node);
        if (value.kind === 'opaque') {
            this.complete = false;
            if (node.prefix !== 'pdfaExtension') this.test(1, false, path, 'The container does not use the required pdfaExtension prefix.');
            this.unknown(extensionRules, path, 'The extension container uses an unsupported RDF form.');
            return;
        }
        const bag = value.kind === 'array' && value.name === 'Bag' && !significantText(value.container) &&
            value.items.every(item => is(item, RDF, 'li'));
        this.test(1, bag && node.prefix === 'pdfaExtension', path,
            'The extension container must use the pdfaExtension prefix and an RDF Bag.');
        if (bag) this.complete = this.records(value.items, path, (record, path) => this.schema(record, path)) && this.complete;
        else this.complete = false;
    }

    metadataProperty(node, path) {
        if (node.namespaceURI === RDF) {
            this.unknown([DECLARATION, VALUE], path, 'The RDF property syntax is outside the supported scope.');
            return;
        }
        const ns = node.namespaceURI || '';
        const standard = predefined.get(ns);
        const builtIn = standard && Object.hasOwn(standard, node.localName) ? standard[node.localName] : null;
        const declarations = this.schemas.get(ns);
        const custom = declarations?.has(node.localName);
        if (!builtIn && !custom) {
            const status = this.complete && !standardNamespace(ns) ? 'fail' : 'unknown';
            this.note(DECLARATION, status, path, 'No matching predefined or extension property was established.');
            this.unknown([VALUE], path, 'A property type could not be established.');
            return;
        }
        const declaration = custom ? declarations.get(node.localName) : null;
        const value = builtIn || declaration?.valueType;
        const info = value ? typeInfo(value) : null;
        const status = info ? checkValue(node, info, builtIn ? null : declaration.types, this.valueBudget) : 'unknown';
        this.note(DECLARATION, 'pass', path, 'The property is predefined or described by the extension schema.');
        this.note(VALUE, status, path, status === 'fail' ? 'The property does not match its declared type.' :
            status === 'pass' ? 'The property value type was checked.' : 'This property value form could not be fully inspected.');
    }

    inspect(doc) {
        const root = doc?.documentElement;
        const roots = is(root, RDF, 'RDF') ? [root] : is(root, XMP_META, 'xmpmeta') || is(root, XMP_META, 'xapmeta')
            ? children(root).filter(child => is(child, RDF, 'RDF')) : [];
        if (roots.length !== 1) {
            this.unknown(ruleIds, '/Metadata', 'No unambiguous document XMP RDF packet could be inspected.');
            return;
        }
        const values = [];
        const subjects = new Set();
        for (const [index, description] of children(roots[0]).entries()) {
            const path = '/Metadata/rdf:RDF/Description[' + (index + 1) + ']';
            if (!this.take(path)) return;
            if (!is(description, RDF, 'Description') ||
                ['nodeID', 'ID'].some(key => description.hasAttributeNS(RDF, key))) {
                this.complete = false;
                this.unknown(ruleIds, path, 'This top-level RDF form is outside the supported scope.');
                continue;
            }
            subjects.add(description.getAttributeNS(RDF, 'about') ?? '');
            for (const node of properties(description)) {
                if (!this.take(path)) return;
                const location = path + '/' + expandedName(node);
                if (is(node, EXT, 'schemas')) this.container(node, location);
                else values.push([node, location]);
            }
        }
        if (subjects.size > 1) {
            this.unknown([DECLARATION, VALUE], '/Metadata/rdf:RDF', 'Property and schema declarations span several RDF subjects.');
            return;
        }
        for (const [node, location] of values) this.metadataProperty(node, location);
    }

    finish() {
        return {
            checks: ruleIds.map(id => this.checks.get(id) || {
                id, status: 'not-applicable', location: '/Metadata', detail: 'No applicable element was found in the inspected document XMP.',
            }),
            counts: this.counts,
        };
    }
}

export function inspectPdfAXmp(doc) {
    const inspection = new XmpInspection();
    inspection.inspect(doc);
    return inspection.finish();
}
