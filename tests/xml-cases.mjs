// Shared input transformations for JS, browser and optional Mustang comparison.
export const cases = [
    { name: 'valid', edit: x => x, status: 'valid' },
    { name: 'wrong total', edit: x => x.replace('<ram:GrandTotalAmount>119.00', '<ram:GrandTotalAmount>120.00'), status: 'invalid', rule: 'BR-CO-15' },
    { name: 'missing invoice number', edit: x => x.replace('<ram:ID>TEST-2026-001</ram:ID>', ''), status: 'invalid', stage: 'xsd' },
    { name: 'invalid unit code', edit: x => x.replace('unitCode="C62"', 'unitCode="INVALID"'), status: 'invalid', rule: 'FX-SCH-A-000613' },
    { name: 'invalid decimal', edit: x => x.replace('<ram:GrandTotalAmount>119.00', '<ram:GrandTotalAmount>abc'), status: 'invalid', stage: 'xsd' },
    { name: 'missing seller tax registration', edit: x => x.replace(/<ram:SpecifiedTaxRegistration>.*?<\/ram:SpecifiedTaxRegistration>/, ''), status: 'invalid', rule: 'BR-S-02' },
    { name: 'wrong VAT amount', edit: x => x.replace('<ram:CalculatedAmount>19.00', '<ram:CalculatedAmount>20.00'), status: 'invalid', rule: 'BR-S-09' },
    { name: 'unsupported basic profile', edit: x => x.replace('urn:cen.eu:en16931:2017', 'urn:cen.eu:en16931:2017#compliant#urn:factur-x.eu:1p0:basic'), status: 'unsupported' },
    { name: 'spoofed profile', edit: x => x.replace('urn:cen.eu:en16931:2017', 'fake:en16931'), status: 'unsupported' },
    { name: 'wrong namespace', edit: x => x.replace('CrossIndustryInvoice:100', 'CrossIndustryInvoice:999'), status: 'unsupported' },
    { name: 'malformed', edit: x => x.slice(0, -100), status: 'invalid', stage: 'parse' },
    { name: 'external entity', edit: x => x.replace('<rsm:CrossIndustryInvoice ', '<!DOCTYPE rsm:CrossIndustryInvoice [<!ENTITY secret SYSTEM "file:///never-read-this">]><rsm:CrossIndustryInvoice '), status: 'invalid', stage: 'parse' }
];
