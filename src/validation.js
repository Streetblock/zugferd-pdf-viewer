/* All decisions remain separate from the tolerant display parser. */
window.InvoiceValidation = (() => {
    const CII = 'urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100';
    const RAM = 'urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100';
    const child = (node, name, ns) => [...(node?.children || [])].find(n => n.localName === name && (!ns || n.namespaceURI === ns));
    const at = (node, ...names) => names.reduce((n, name) => child(n, name), node);
    const text = node => node?.textContent?.trim() || '';
    const check = (id, status, title, detail) => ({ id, status, title, detail });

    function decode(bytes) {
        if (typeof bytes === 'string') return bytes;
        let encoding = 'utf-8';
        if ((bytes[0] === 255 && bytes[1] === 254) || (bytes[0] === 60 && bytes[1] === 0)) encoding = 'utf-16le';
        else if ((bytes[0] === 254 && bytes[1] === 255) || (bytes[0] === 0 && bytes[1] === 60)) encoding = 'utf-16be';
        else {
            const header = new TextDecoder('ascii').decode(bytes.slice(0, 200));
            encoding = header.match(/<\?xml[^>]*encoding\s*=\s*["']([^"']+)/i)?.[1] || encoding;
        }
        return new TextDecoder(encoding, { fatal: true }).decode(bytes);
    }

    function parse(xml) {
        if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('XML mit DTD oder Entitäten wird nicht verarbeitet.');
        const doc = new DOMParser().parseFromString(xml, 'application/xml');
        if (doc.querySelector('parsererror')) throw new Error('XML ist nicht wohlgeformt.');
        return doc;
    }

    function profile(id) {
        if (id === 'urn:cen.eu:en16931:2017') return 'EN 16931';
        if (/^urn:(factur-x\.eu:1p0|zugferd\.de:2p0):(minimum|basicwl|basic)$/.test(id)) {
            return id.endsWith(':basicwl') ? 'BASIC-WL' : id.split(':').pop().toUpperCase();
        }
        if (/^urn:cen\.eu:en16931:2017#conformant#urn:(factur-x\.eu:1p0|zugferd\.de:2p0):extended$/.test(id)) return 'EXTENDED';
        if (/^urn:cen\.eu:en16931:2017#compliant#urn:(factur-x\.eu:1p0|zugferd\.de:2p0):basic$/.test(id)) return 'BASIC';
        if (id === 'urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0') return 'XRechnung 3.0 (CII)';
        if (/^urn:cen\.eu:en16931:2017#compliant#urn:xeinkauf\.de:kosit:xrechnung_[0-9]+\.[0-9]+$/.test(id)) return 'XRECHNUNG';
        if (id.startsWith('urn:ferd:CrossIndustryDocument:invoice:1p0:')) return 'ZUGFeRD 1 (veraltet)';
        return 'Unbekannt';
    }

    function preflight(xml, { isPdf = false, b2g = false } = {}) {
        const doc = parse(xml), root = doc.documentElement;
        if (root.localName !== 'CrossIndustryInvoice' || root.namespaceURI !== CII) {
            throw new Error('Unterstützt wird CII (ZUGFeRD 2.x / Factur-X und XRechnung 3.0). Dieses XML hat eine andere Rechnungs-Syntax; UBL wird noch nicht unterstützt.');
        }
        const context = child(root, 'ExchangedDocumentContext', CII);
        const guideline = child(context, 'GuidelineSpecifiedDocumentContextParameter', RAM);
        const id = text(child(guideline, 'ID', RAM));
        const name = profile(id);
        const transaction = child(root, 'SupplyChainTradeTransaction', CII);
        const agreement = child(transaction, 'ApplicableHeaderTradeAgreement', RAM);
        const reference = text(child(agreement, 'BuyerReference', RAM));
        const buyerCountry = text(at(agreement, 'BuyerTradeParty', 'PostalTradeAddress', 'CountryID'));
        const excluded = ['MINIMUM', 'BASIC-WL', 'ZUGFeRD 1 (veraltet)'].includes(name);
        const checks = [
            check('syntax', 'pass', 'XML lesbar', 'CII-Namensraum erkannt. Wohlgeformtheit ersetzt keine XSD-Prüfung.'),
            check('profile', excluded ? 'fail' : name === 'Unbekannt' ? 'unknown' : 'info', `Profilkennung: ${name}`,
                excluded ? 'Dieses Profil genügt nicht als vollständige deutsche B2B-E-Rechnung.'
                : `${id || 'Profilkennung fehlt.'} — Die Profilkennung allein ist kein Konformitätsnachweis.`
                    + (name === 'BASIC' ? ' BASIC ist grundsätzlich zulässig; bei ZUGFeRD gilt dies ab Version 2.0.1. Die genaue Unterversion ist nicht immer aus der XML-Kennung bestimmbar.' : ' Das XML-Ergebnis steht separat unter XSD und Schematron.')),
            check('reference', b2g && !reference ? 'fail' : 'info', 'Käuferreferenz / Leitweg-ID',
                name === 'XRechnung 3.0 (CII)' ? `${reference ? 'Vorhanden: ' + reference + '.' : 'BuyerReference fehlt.'} Die XRechnung-Regeln prüfen BT-10 unabhängig vom B2G-Schalter. Empfängerzuordnung und Leitweg-ID-Prüfziffer werden nicht geprüft.`
                : b2g ? (reference ? `Vorhanden: ${reference}. Der Schalter prüft nur das Vorhandensein; Zuordnung und Leitweg-ID-Prüfziffer werden nicht geprüft.` : 'Für den gewählten B2G-Kontext fehlt BuyerReference (BT-10).')
                    : (reference ? `Vorhanden: ${reference}.` : 'Im allgemeinen B2B-Kontext nicht pauschal verpflichtend.')),
            check('xml', 'unknown', 'XSD und Schematron', 'JavaScript-Prüfung noch nicht abgeschlossen.'),
            check('pdf', isPdf ? 'unknown' : 'info', 'PDF/A-3 und Einbettung', isPdf ? 'Noch nicht geprüft.' : 'Bei einer reinen XML-Datei nicht anwendbar.'),
            check('authority', 'info', 'XML ist die Datenquelle', 'Alle angezeigten Rechnungswerte stammen aus dem XML. Ein inhaltlicher Abgleich mit dem PDF-Bild erfolgt nicht.'),
            check('archive', 'info', 'Original aufbewahren', 'Originaldatei bzw. ursprüngliches XML unversehrt aufbewahren. Download und SHA-256-Prüfsumme sind kein revisionssicheres Archiv; GoBD-Prozesse werden hier nicht geprüft.')
        ];
        return { profile: name, profileId: id, buyerCountry, isPdf, b2g, checks, issues: [] };
    }

    function applyXmlReport(result, report) {
        if (report.sourceSha256 !== result.xmlSha256) throw new Error('XML-Prüfsumme stimmt nicht mit dem JS-Bericht überein.');
        const stages = report.schematron.stages || [];
        const complete = result.profile !== 'XRechnung 3.0 (CII)' || (stages.length === 2
            && ['cen', 'xrechnung'].every(key => stages.some(s => s.key === key && s.status === 'valid' && s.fired > 0)));
        const passed = report.status === 'valid' && report.profileId === result.profileId
            && report.xsd.status === 'valid' && report.schematron.status === 'valid' && report.schematron.fired > 0 && complete;
        const status = passed ? 'pass' : report.status === 'invalid' ? 'fail' : 'unknown';
        const detail = passed ? `${result.profile}-Profilregeln bestanden: XSD und ${report.schematron.fired} ausgeführte Schematron-Regeln. ${report.ruleset}.`
            : report.status === 'unsupported' ? 'Dieses Profil wird angezeigt, aber von der JS-Prüfung noch nicht unterstützt.'
            : status === 'fail' ? 'Die XML-Prüfung meldet Fehler. Regelkennungen und Fundstellen stehen unter „Fehler und Warnungen“.'
            : 'Die XML-Prüfung wurde nicht vollständig abgeschlossen. Siehe Detailmeldungen.';
        result.checks = result.checks.map(c => c.id === 'xml' ? check('xml', status, 'XSD und Schematron (JavaScript)', detail) : c);
        result.xmlValidation = report;
        result.issues = report.issues;
        result.engine = report.engine;
        result.checkedAt = report.checkedAt;
        return result;
    }

    // Keep the independent JS result authoritative in the normal viewer. Reference-only
    // extras are retained in the download, including PDF/A; they cannot turn a JS failure green.
    function applyReferenceComparison(result, response) {
        const reference = applyReport({ ...result, checks: result.checks.filter(c => c.id !== 'reference-engine'), issues: [] }, response, result.xmlSha256);
        const jsStatus = result.checks.find(c => c.id === 'xml')?.status;
        const referenceStatus = reference.checks.find(c => c.id === 'xml')?.status;
        result.referenceValidation = reference;
        result.checks.push(check('reference-engine', jsStatus === referenceStatus ? 'info' : 'unknown', 'Mustang-Entwicklungsreferenz',
            jsStatus === referenceStatus ? 'XML-Ergebnis stimmt überein. Zusätzliche Mustang-Prüfungen stehen separat im JSON-Bericht.'
                : 'XML-Ergebnisse weichen ab oder sind nicht vergleichbar. Separate Berichte im JSON-Download prüfen.'));
        return result;
    }

    function applyReport(result, response, xmlHash) {
        const doc = parse(response.report);
        const root = doc.documentElement;
        if (root.localName !== 'validation') throw new Error('Ungültiger Validatorbericht.');
        const xml = child(root, 'xml'), pdf = child(root, 'pdf');
        const statusOf = node => child(node, 'summary')?.getAttribute('status');
        const validXml = statusOf(xml) === 'valid';
        const engineProfile = text(at(xml, 'info', 'profile'));
        const fired = Number(text(at(xml, 'info', 'rules', 'fired')));
        const confirmed = validXml && fired > 0 && engineProfile === result.profileId;
        const replace = item => { result.checks = result.checks.map(c => c.id === item.id ? item : c); };
        replace(check('xml', confirmed ? 'pass' : statusOf(xml) === 'invalid' ? 'fail' : 'unknown',
            'XSD und Schematron', confirmed ? `${response.engine}: Profilregeln bestanden (${fired} ausgeführte Schematron-Regeln).`
                : statusOf(xml) === 'invalid' ? 'Die XML-Prüfung meldet Fehler. Details stehen im Prüfbericht.'
                : 'Kein eindeutiger vollständiger Nachweis für das angezeigte XML-Profil.'));
        if (result.isPdf) {
            // veraPDF failures may appear as warnings in Mustang. Never infer PDF/A success from the global summary.
            const pdfText = pdf?.textContent || '';
            const passed = statusOf(pdf) === 'valid' && /isCompliant=true/.test(pdfText) && /flavour=3[abu]/.test(pdfText);
            replace(check('pdf', passed ? 'pass' : pdf ? 'fail' : 'unknown', 'PDF/A-3 (veraPDF) und XMP',
                passed ? 'PDF/A-3-Prüfung und Mustang-XMP-Prüfung bestanden.' : 'PDF/A-3-Konformität nicht bestätigt. Siehe Originalbericht.'));
            const attachment = response.attachments?.find(a => a.sha256 === xmlHash);
            let state = 'unknown', detail = 'Der geprüfte PDF-Anhang konnte nicht eindeutig an das angezeigte XML gebunden werden.';
            if (attachment) {
                const mimeOk = ['text/xml', 'application/xml'].includes(attachment.mime);
                const relationOk = attachment.relationship === 'Alternative';
                const sourceCase = attachment.relationship === 'Source' && result.buyerCountry && result.buyerCountry !== 'DE';
                state = !mimeOk || !attachment.associated || (!relationOk && !sourceCase) ? 'fail' : sourceCase ? 'unknown' : 'pass';
                detail = `MIME: ${attachment.mime || 'fehlt'}; AFRelationship: ${attachment.relationship || 'fehlt'}; im Dokument-AF: ${attachment.associated ? 'ja' : 'nein'}.`
                    + (sourceCase ? ' Source kann bei ausländischem Empfänger und aus XML erzeugtem PDF zulässig sein; Erzeugungsweg manuell prüfen.' : ' Für deutsche Empfänger wird Alternative erwartet.');
            }
            result.checks.push(check('embedding', state, 'XML-Einbettung', detail));
        }
        result.issues = [...root.querySelectorAll('error, fatal, exception, warning, notice')].map(n => ({
            severity: n.localName, rule: n.getAttribute('id') || text(n).match(/\[ID ([^\]]+)\]/)?.[1] || n.getAttribute('type') || '',
            location: n.getAttribute('location') || n.getAttribute('part') || n.parentElement?.localName || '',
            message: text(n)
        }));
        // A fatal validator failure must never result in an overall success.
        if (statusOf(root) === 'invalid' && !result.checks.some(c => c.status === 'fail')) {
            result.checks.push(check('engine', 'fail', 'Validator-Gesamtergebnis', 'Mustang meldet die Datei als ungültig.'));
        }
        result.engine = response.engine;
        result.checkedAt = response.checkedAt;
        result.sourceSha256 = response.sourceSha256;
        result.rawReport = response.report;
        result.jarSha256 = response.jarSha256;
        return result;
    }

    function summary(result) {
        if (result.checks.find(c => c.id === 'xml')?.status === 'fail') return { label: `XML-Prüfung: Regelfehler · Profil ${result.profile}`, status: 'fail' };
        if (result.checks.some(c => c.status === 'fail')) return { label: 'Prüfung: Anforderungen nicht erfüllt', status: 'fail' };
        if (result.xmlValidation?.status === 'unsupported') return { label: `XML-Profil ${result.profile}: noch nicht unterstützt`, status: 'unknown' };
        if (result.checks.some(c => c.status === 'unknown')) return { label: result.isPdf && result.checks.find(c => c.id === 'xml')?.status === 'pass'
            ? 'XML bestanden · PDF/A-Prüfung offen' : 'Konformität noch nicht bestätigt', status: 'unknown' };
        return { label: `XML-Prüfung bestanden · Profil ${result.profile}`, status: 'pass' };
    }
    async function hash(bytes) {
        const value = await crypto.subtle.digest('SHA-256', bytes);
        return [...new Uint8Array(value)].map(b => b.toString(16).padStart(2, '0')).join('');
    }
    return { decode, parse, profile, preflight, applyXmlReport, applyReferenceComparison, applyReport, summary, hash };
})();
