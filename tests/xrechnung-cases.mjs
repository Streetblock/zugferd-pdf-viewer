// Synthetic data only. Shared by the JS tests, browser fixtures and KoSIT comparison.
export const XR_ID = 'urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0';
const remove = name => x => x.replace(new RegExp('<ram:' + name + '>[\\s\\S]*?</ram:' + name + '>'), '');
const iban = value => x => x.replace(/<ram:IBANID>.*?<\/ram:IBANID>/, '<ram:IBANID>' + value + '</ram:IBANID>');
export const xrechnungCases = [
    { name: 'xrechnung valid', edit: x => x, status: 'valid', clean: true },
    { name: 'xrechnung missing buyer reference', edit: remove('BuyerReference'), status: 'invalid', rule: 'BR-DE-15' },
    { name: 'xrechnung blank buyer reference', edit: x => x.replace('TEST-REFERENZ-001', ' '), status: 'invalid', rule: 'PEPPOL-EN16931-R008' },
    { name: 'xrechnung missing seller contact', edit: remove('DefinedTradeContact'), status: 'invalid', rule: 'BR-DE-2' },
    { name: 'xrechnung missing telephone', edit: remove('TelephoneUniversalCommunication'), status: 'invalid', rule: 'BR-DE-6' },
    { name: 'xrechnung missing contact email', edit: remove('EmailURIUniversalCommunication'), status: 'invalid', rule: 'BR-DE-7' },
    { name: 'xrechnung missing seller endpoint', edit: remove('URIUniversalCommunication'), status: 'invalid', rule: 'PEPPOL-EN16931-R020' },
    { name: 'xrechnung missing buyer endpoint', edit: x => x.replace(/(<ram:BuyerTradeParty>[\s\S]*?)<ram:URIUniversalCommunication>[\s\S]*?<\/ram:URIUniversalCommunication>/, '$1'), status: 'invalid', rule: 'PEPPOL-EN16931-R010' },
    { name: 'xrechnung missing business process', edit: remove('BusinessProcessSpecifiedDocumentContextParameter'), status: 'invalid', rule: 'PEPPOL-EN16931-R001' },
    { name: 'xrechnung missing payment means', edit: remove('SpecifiedTradeSettlementPaymentMeans'), status: 'invalid', rule: 'BR-DE-1' },
    { name: 'xrechnung seller contact cardinality', edit: x => x.replace('<ram:PersonName>Testkontakt</ram:PersonName>', '<ram:PersonName>Testkontakt</ram:PersonName><ram:DepartmentName>Buchhaltung</ram:DepartmentName>'), status: 'invalid', rule: 'CII-SR-465', severity: 'error', originalFlag: 'warning' },
    { name: 'xrechnung wrong total', edit: x => x.replace('<ram:GrandTotalAmount>119.00', '<ram:GrandTotalAmount>120.00'), status: 'invalid', rule: 'BR-CO-15', layer: 'cen' },
    { name: 'xrechnung invalid decimal', edit: x => x.replace('<ram:GrandTotalAmount>119.00', '<ram:GrandTotalAmount>abc'), status: 'invalid', stage: 'xsd' },
    { name: 'xrechnung unit warning override', edit: x => x.replace('unitCode="C62"', 'unitCode="INVALID"'), status: 'valid', rule: 'BR-CL-23', severity: 'warning', originalFlag: 'fatal' },
    { name: 'xrechnung invalid iban checksum', edit: iban('DE03100100100006820101'), status: 'valid', rule: 'BR-DE-19', severity: 'warning' },
    { name: 'xrechnung invalid iban format', edit: iban('123'), status: 'valid', rule: 'BR-DE-19', severity: 'warning' },
    { name: 'xrechnung valid iban spaces', edit: iban('DE02 1001 0010 0006 8201 01'), status: 'valid', clean: true },
    { name: 'xrechnung valid iban letters', edit: iban('GB82WEST12345698765432'), status: 'valid', clean: true },
    { name: 'xrechnung valid iban long', edit: iban('MT84MALT011000012345MTLCAST001S'), status: 'valid', clean: true },
    { name: 'xrechnung invalid iban long', edit: iban('MT85MALT011000012345MTLCAST001S'), status: 'valid', rule: 'BR-DE-19', severity: 'warning' },
    { name: 'xrechnung older version unsupported', edit: x => x.replace(XR_ID, XR_ID.replace('3.0', '2.3')), status: 'unsupported' },
    { name: 'xrechnung extension unsupported', edit: x => x.replace(XR_ID, XR_ID + '#conformant#urn:xeinkauf.de:kosit:extension:xrechnung_3.0'), status: 'unsupported' },
    { name: 'xrechnung cvd unsupported', edit: x => x.replace(XR_ID, XR_ID + '#compliant#urn:xeinkauf.de:kosit:xrechnung:cvd_0.9'), status: 'unsupported' },
    { name: 'xrechnung unknown suffix', edit: x => x.replace(XR_ID, XR_ID + ':fake'), status: 'unsupported' },
    { name: 'xrechnung ubl unsupported', edit: () => '<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"/>', status: 'unsupported', rule: 'SYNTAX-UNSUPPORTED' }
];
