// Expected contracts are explicit, independent of the production profile registry.
const base = 'urn:cen.eu:en16931:2017';
export const profileCases = ['basic', 'extended'].flatMap(profile => {
    const id = base + (profile === 'basic' ? '#compliant#' : '#conformant#') + 'urn:factur-x.eu:1p0:' + profile;
    const common = { fixture: 'invoice-' + profile + '.xml', profile: profile.toUpperCase(), id };
    return [
        { name: profile + ' valid', edit: x => x, status: 'valid' },
        { name: profile + ' ZUGFeRD alias', edit: x => x.replace(id, id.replace('factur-x.eu:1p0', 'zugferd.de:2p0')), status: 'valid' },
        { name: profile + ' wrong total', edit: x => x.replace('<ram:GrandTotalAmount>119.00', '<ram:GrandTotalAmount>120.00'), status: 'invalid', rule: profile === 'extended' ? 'BR-FXEXT-CO-15' : 'BR-CO-15' },
        { name: profile + ' invalid decimal', edit: x => x.replace('<ram:GrandTotalAmount>119.00', '<ram:GrandTotalAmount>abc'), status: 'invalid', stage: 'xsd' },
        { name: profile + ' invalid unit code', edit: x => x.replace('unitCode="C62"', 'unitCode="INVALID"'), status: 'invalid', stage: 'schematron' },
        { name: profile + ' missing invoice number', edit: x => x.replace('<ram:ID>TEST-2026-001</ram:ID>', ''), status: 'invalid', stage: 'xsd', reference: false },
        { name: profile + ' missing seller tax registration', edit: x => x.replace(/<ram:SpecifiedTaxRegistration>.*?<\/ram:SpecifiedTaxRegistration>/, ''), status: 'invalid', rule: 'BR-S-02', reference: false },
        { name: profile + ' unsupported suffix', edit: x => x.replace(id, id + '#unrecognized-extension'), status: 'unsupported', reference: false }
    ].map(c => ({ ...common, ...c }));
});

// EXTENDED BrandName must not become valid by relabelling it as a narrower profile.
for (const [profile, id] of [['BASIC', base + '#compliant#urn:factur-x.eu:1p0:basic'], ['EN16931', base]]) {
    profileCases.push({ name: 'extended field relabelled ' + profile, fixture: 'invoice-extended.xml', profile,
        edit: x => x.replace(base + '#conformant#urn:factur-x.eu:1p0:extended', id), status: 'invalid', stage: 'xsd' });
}

// Guard the exact tolerance boundaries of both compiler-adapted EXTENDED rules.
// Compare the individual rule, since Mustang also applies its own arithmetic checks.
for (const [field, rule] of [['LineTotalAmount', 'BR-FXEXT-CO-10'], ['TaxBasisTotalAmount', 'BR-FXEXT-CO-13']]) {
    for (const amount of ['99.98', '99.99', '100.01', '100.02']) {
        profileCases.push({ name: `extended ${field} ${amount}`, fixture: 'invoice-extended.xml', profile: 'EXTENDED',
            edit: x => x.replace(/(<ram:SpecifiedTradeSettlementHeaderMonetarySummation>)([\s\S]*?)(<\/ram:SpecifiedTradeSettlementHeaderMonetarySummation>)/,
                (_, start, inner, end) => start + inner.replace(`<ram:${field}>100.00`, `<ram:${field}>${amount}`) + end),
            comparisonRule: rule, expectedFailure: ['99.98', '100.02'].includes(amount) });
    }
}
