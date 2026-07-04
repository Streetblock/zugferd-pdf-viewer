window.PDFAttachmentExtractor = class PDFAttachmentExtractor {
    async extractXML(file) {
        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdfDoc = await loadingTask.promise;

        const attachments = await pdfDoc.getAttachments();
        if (!attachments || Object.keys(attachments).length === 0) {
            throw new Error("Keine Anhange in dieser PDF gefunden. Ist es ein ZUGFeRD/PDF-A3 Dokument?");
        }

        const entry = Object.entries(attachments).find(([key, att]) => {
            const filename = (att?.filename || att?.name || key || "").toLowerCase();
            return filename.endsWith(".xml") || filename.includes("zugferd") || filename.includes("factur-x");
        });

        if (!entry) {
            throw new Error("Kein XML-Anhang gefunden. Dies scheint keine gueltige E-Rechnung zu sein.");
        }

        const [, xmlAttachment] = entry;
        const payload = xmlAttachment.content || xmlAttachment.data || xmlAttachment.bytes;
        const xmlString = typeof payload === "string"
            ? payload
            : new TextDecoder("utf-8").decode(payload);

        return {
            filename: xmlAttachment.filename || xmlAttachment.name || "attachment.xml",
            content: xmlString
        };
    }
};

window.InvoiceXMLParser = class InvoiceXMLParser {
    constructor(xmlString) {
        const parser = new DOMParser();
        this.xmlDoc = parser.parseFromString(xmlString, "text/xml");

        const errorNode = this.xmlDoc.querySelector("parsererror");
        if (errorNode) {
            throw new Error("Fehler beim Lesen des XML Inhalts.");
        }
    }

    _findFirstByLocalName(root, localName) {
        if (!root) return null;

        if (root.localName === localName || root.tagName === localName) {
            return root;
        }

        const elements = root.getElementsByTagName("*");
        for (let i = 0; i < elements.length; i++) {
            const el = elements[i];
            if (el.localName === localName || el.tagName === localName) {
                return el;
            }
        }
        return null;
    }

    _findAllByLocalName(root, localName) {
        if (!root) return [];

        const matches = [];
        if (root.localName === localName || root.tagName === localName) {
            matches.push(root);
        }

        const elements = root.getElementsByTagName("*");
        for (let i = 0; i < elements.length; i++) {
            const el = elements[i];
            if (el.localName === localName || el.tagName === localName) {
                matches.push(el);
            }
        }
        return matches;
    }

    _findChildByLocalName(root, localName) {
        if (!root) return null;

        for (let i = 0; i < root.children.length; i++) {
            const el = root.children[i];
            if (el.localName === localName || el.tagName === localName) {
                return el;
            }
        }
        return null;
    }

    _getPathText(root, path) {
        let current = root;
        for (const segment of path) {
            current = this._findChildByLocalName(current, segment);
            if (!current) return null;
        }
        return current.textContent?.trim() || null;
    }

    _getPathAttribute(root, path, attributeName) {
        let current = root;
        for (const segment of path) {
            current = this._findChildByLocalName(current, segment);
            if (!current) return null;
        }
        return current.getAttribute(attributeName);
    }

    _getFirstTextByPaths(root, paths) {
        for (const path of paths) {
            const text = this._getPathText(root, path);
            if (text) return text;
        }
        return null;
    }

    _getFirstTextByScopes(roots, paths) {
        for (const root of roots) {
            const text = this._getFirstTextByPaths(root, paths);
            if (text) return text;
        }
        return null;
    }

    _normalizeDate(value) {
        if (!value) return null;
        if (/^\d{8}$/.test(value)) {
            return `${value.substr(6, 2)}.${value.substr(4, 2)}.${value.substr(0, 4)}`;
        }
        return value;
    }

    _formatAddress(addressRoot) {
        if (!addressRoot) return null;

        const street = this._getFirstTextByPaths(addressRoot, [
            ["LineOne"],
            ["StreetName"],
            ["StreetNameLine1"],
            ["Street"]
        ]);
        const street2 = this._getFirstTextByPaths(addressRoot, [
            ["LineTwo"],
            ["AdditionalStreetName"],
            ["StreetNameLine2"]
        ]);
        const postalCode = this._getFirstTextByPaths(addressRoot, [
            ["PostcodeCode"],
            ["PostalZone"],
            ["ZipCode"]
        ]);
        const city = this._getFirstTextByPaths(addressRoot, [
            ["CityName"],
            ["City"]
        ]);
        const country = this._getFirstTextByPaths(addressRoot, [
            ["CountryID"],
            ["IdentificationCode"]
        ]);

        const lines = [street, street2, [postalCode, city].filter(Boolean).join(" ").trim(), country]
            .filter(Boolean)
            .map((line) => line.trim())
            .filter(Boolean);

        return lines.length ? lines.join("\n") : null;
    }

    parse() {
        const data = {
            invoiceNumber: "Unbekannt",
            invoiceTypeCode: "Unbekannt",
            invoiceTypeLabel: "Unbekannt",
            invoiceTypeDisplay: "Unbekannt",
            issueDate: "Unbekannt",
            totalAmount: "0.00",
            currency: "EUR",
            sellerName: "Unbekannt",
            buyerName: "Unbekannt",
            sellerContactPerson: "Unbekannt",
            sellerPhone: "Unbekannt",
            sellerEmail: "Unbekannt",
            sellerCommunicationId: "Unbekannt",
            sellerAddress: "Unbekannt",
            buyerAddress: "Unbekannt",
            sellerVatId: "Unbekannt",
            sellerTaxReference: "Unbekannt",
            buyerVatId: "Unbekannt",
            buyerReference: "Unbekannt",
            paymentMeans: "",
            dueDate: "Unbekannt",
            iban: "Unbekannt",
            bic: "Unbekannt",
            netAmount: "Unbekannt",
            taxAmount: "Unbekannt",
            lineItemCount: "0"
        };

        const invoiceNode = this._findFirstByLocalName(this.xmlDoc, "ExchangedDocument") ||
                            this._findFirstByLocalName(this.xmlDoc, "Invoice");
        if (invoiceNode) {
            const invoiceNumber =
                this._getPathText(invoiceNode, ["ID"]) ||
                this._getPathText(invoiceNode, ["ExchangedDocumentNumber"]);
            if (invoiceNumber) data.invoiceNumber = invoiceNumber;

            const invoiceTypeCode =
                this._getPathText(invoiceNode, ["TypeCode"]) ||
                this._getPathText(invoiceNode, ["DocumentTypeCode"]);
            if (invoiceTypeCode) {
                const normalizedTypeCode = String(invoiceTypeCode).trim();
                const invoiceTypeLabels = {
                    "380": "Rechnung",
                    "381": "Gutschrift",
                    "382": "Stornorechnung",
                    "383": "Debit Note",
                    "384": "Korrekturrechnung"
                };
                data.invoiceTypeCode = normalizedTypeCode;
                data.invoiceTypeLabel = invoiceTypeLabels[normalizedTypeCode] || "Unbekannt";
                data.invoiceTypeDisplay = data.invoiceTypeLabel !== "Unbekannt"
                    ? `${data.invoiceTypeCode} = ${data.invoiceTypeLabel}`
                    : `Code ${data.invoiceTypeCode}`;
            }

            const issueDate =
                this._getPathText(invoiceNode, ["IssueDate"]) ||
                this._getPathText(invoiceNode, ["IssueDateTime", "DateTimeString"]) ||
                this._getPathText(invoiceNode, ["OccurrenceDateTime", "DateTimeString"]) ||
                this._getPathText(invoiceNode, ["DocumentDateTime", "DateTimeString"]);
            if (issueDate) {
                data.issueDate = this._normalizeDate(issueDate);
            }
        }

        const settlementNode = this._findFirstByLocalName(this.xmlDoc, "ApplicableHeaderTradeSettlement") ||
                               this._findFirstByLocalName(this.xmlDoc, "LegalMonetaryTotal");
        const invoiceRoot = this._findFirstByLocalName(this.xmlDoc, "Invoice") || this.xmlDoc.documentElement;
        if (settlementNode) {
            const totalCandidates = [
                ["SpecifiedTradeSettlementHeaderMonetarySummation", "GrandTotalAmount"],
                ["SpecifiedTradeSettlementHeaderMonetarySummation", "DuePayableAmount"],
                ["GrandTotalAmount"],
                ["DuePayableAmount"],
                ["PayableAmount"]
            ];

            for (const path of totalCandidates) {
                const totalText = this._getPathText(settlementNode, path);
                if (totalText) {
                    const parsedAmount = Number.parseFloat(totalText.replace(",", "."));
                    if (!Number.isNaN(parsedAmount)) {
                        data.totalAmount = parsedAmount.toFixed(2);
                    } else {
                        data.totalAmount = totalText;
                    }
                    data.currency = this._getPathAttribute(settlementNode, path, "currencyID") || data.currency;
                    break;
                }
            }
        }

        const agreementNode = this._findFirstByLocalName(this.xmlDoc, "ApplicableHeaderTradeAgreement") ||
                              this._findFirstByLocalName(this.xmlDoc, "SupplyChainTradeTransaction") ||
                              this.xmlDoc.documentElement;
        if (agreementNode) {
            data.buyerReference = this._getFirstTextByScopes([agreementNode, this.xmlDoc.documentElement], [
                ["BuyerReference"],
                ["BuyerReferenceID"]
            ]) || data.buyerReference;

            const sellerPartyNode = this._findFirstByLocalName(agreementNode, "SellerTradeParty") ||
                                    this._findFirstByLocalName(agreementNode, "AccountingSupplierParty") ||
                                    this._findFirstByLocalName(agreementNode, "SellerParty");
            const sellerContentNode = this._findFirstByLocalName(sellerPartyNode, "Party") || sellerPartyNode;
            const sellerName =
                this._getFirstTextByPaths(sellerContentNode, [
                    ["Name"],
                    ["PartyName", "Name"],
                    ["RegistrationName"]
                ]);
            if (sellerName) {
                data.sellerName = sellerName;
            }

            const sellerContactNode = this._findFirstByLocalName(sellerContentNode, "DefinedTradeContact");
            if (sellerContactNode) {
                data.sellerContactPerson = this._getFirstTextByPaths(sellerContactNode, [
                    ["PersonName"]
                ]) || data.sellerContactPerson;
                data.sellerPhone = this._getFirstTextByPaths(sellerContactNode, [
                    ["TelephoneUniversalCommunication", "CompleteNumber"],
                    ["TelephoneNumber"]
                ]) || data.sellerPhone;
                data.sellerEmail = this._getFirstTextByPaths(sellerContactNode, [
                    ["EmailURIUniversalCommunication", "URIID"],
                    ["EmailURI"]
                ]) || data.sellerEmail;
            }

            data.sellerCommunicationId = this._getFirstTextByPaths(sellerContentNode, [
                ["URIUniversalCommunication", "URIID"],
                ["ElectronicMail", "URIID"]
            ]) || data.sellerCommunicationId;

            data.sellerAddress = this._formatAddress(
                this._findFirstByLocalName(sellerContentNode, "PostalTradeAddress") ||
                this._findFirstByLocalName(sellerContentNode, "PostalAddress")
            ) || data.sellerAddress;

            const sellerTaxRegistrationNodes = this._findAllByLocalName(sellerContentNode, "SpecifiedTaxRegistration");
            for (const taxRegistrationNode of sellerTaxRegistrationNodes) {
                const taxId = this._getPathText(taxRegistrationNode, ["ID"]);
                if (!taxId) continue;

                const schemeId = (this._getPathAttribute(taxRegistrationNode, ["ID"], "schemeID") || "").toUpperCase();
                if (schemeId === "VA" || data.sellerVatId === "Unbekannt") {
                    data.sellerVatId = taxId;
                } else if (data.sellerTaxReference === "Unbekannt") {
                    data.sellerTaxReference = taxId;
                }
            }

            if (data.sellerVatId === "Unbekannt") {
                data.sellerVatId = this._getFirstTextByPaths(sellerContentNode, [
                    ["PartyTaxScheme", "CompanyID"],
                    ["VATIdentifier"]
                ]) || data.sellerVatId;
            }

            const buyerPartyNode = this._findFirstByLocalName(agreementNode, "BuyerTradeParty") ||
                                   this._findFirstByLocalName(agreementNode, "AccountingCustomerParty") ||
                                   this._findFirstByLocalName(agreementNode, "BuyerParty");
            const buyerContentNode = this._findFirstByLocalName(buyerPartyNode, "Party") || buyerPartyNode;
            const buyerName =
                this._getFirstTextByPaths(buyerContentNode, [
                    ["Name"],
                    ["PartyName", "Name"],
                    ["RegistrationName"]
                ]);
            if (buyerName) {
                data.buyerName = buyerName;
            }
            data.buyerAddress = this._formatAddress(
                this._findFirstByLocalName(buyerContentNode, "PostalTradeAddress") ||
                this._findFirstByLocalName(buyerContentNode, "PostalAddress")
            ) || data.buyerAddress;

            const buyerTaxRegistrationNodes = this._findAllByLocalName(buyerContentNode, "SpecifiedTaxRegistration");
            for (const taxRegistrationNode of buyerTaxRegistrationNodes) {
                const taxId = this._getPathText(taxRegistrationNode, ["ID"]);
                if (!taxId) continue;

                const schemeId = (this._getPathAttribute(taxRegistrationNode, ["ID"], "schemeID") || "").toUpperCase();
                if (schemeId === "VA" || data.buyerVatId === "Unbekannt") {
                    data.buyerVatId = taxId;
                }
            }

            if (data.buyerVatId === "Unbekannt") {
                data.buyerVatId = this._getFirstTextByPaths(buyerContentNode, [
                    ["PartyTaxScheme", "CompanyID"],
                    ["VATIdentifier"]
                ]) || data.buyerVatId;
            }
        }

        if (settlementNode) {
            data.dueDate = this._normalizeDate(this._getFirstTextByScopes([settlementNode, invoiceRoot], [
                ["SpecifiedTradePaymentTerms", "DueDateDateTime", "DateTimeString"],
                ["SpecifiedTradePaymentTerms", "DueDate"],
                ["PaymentTerms", "PaymentDueDate"]
            ])) || data.dueDate;

            data.paymentMeans = this._getFirstTextByScopes([settlementNode, invoiceRoot], [
                ["SpecifiedTradeSettlementPaymentMeans", "TypeCode"],
                ["PaymentMeans", "PaymentMeansCode"]
            ]) || data.paymentMeans;

            data.iban = this._getFirstTextByScopes([settlementNode, invoiceRoot], [
                ["SpecifiedTradeSettlementPaymentMeans", "PayeePartyCreditorFinancialAccount", "IBANID"],
                ["SpecifiedTradeSettlementPaymentMeans", "PayeeFinancialAccount", "ID"],
                ["PaymentMeans", "PayeeFinancialAccount", "ID"]
            ]) || data.iban;

            data.bic = this._getFirstTextByScopes([settlementNode, invoiceRoot], [
                ["SpecifiedTradeSettlementPaymentMeans", "PayeeSpecifiedCreditorFinancialInstitution", "BICID"],
                ["SpecifiedTradeSettlementPaymentMeans", "PayeeFinancialAccount", "FinancialInstitutionBranch", "ID"],
                ["PaymentMeans", "PayeeFinancialAccount", "FinancialInstitutionBranch", "ID"]
            ]) || data.bic;

            data.netAmount = this._getFirstTextByPaths(settlementNode, [
                ["SpecifiedTradeSettlementHeaderMonetarySummation", "TaxBasisTotalAmount"],
                ["SpecifiedTradeSettlementHeaderMonetarySummation", "LineTotalAmount"],
                ["TaxExclusiveAmount"]
            ]) || data.netAmount;

            const taxCandidates = this._findAllByLocalName(settlementNode, "ApplicableTradeTax")
                .map((taxNode) => this._getFirstTextByPaths(taxNode, [
                    ["CalculatedAmount"],
                    ["TaxAmount"]
                ]))
                .filter(Boolean);

            if (taxCandidates.length > 0) {
                const sum = taxCandidates.reduce((acc, value) => {
                    const parsed = Number.parseFloat(value.replace(",", "."));
                    return Number.isNaN(parsed) ? acc : acc + parsed;
                }, 0);
                data.taxAmount = sum.toFixed(2);
            } else {
                data.taxAmount = this._getFirstTextByPaths(settlementNode, [
                    ["SpecifiedTradeSettlementHeaderMonetarySummation", "TaxTotalAmount"],
                    ["TaxTotalAmount"],
                    ["TaxAmount"]
                ]) || data.taxAmount;
            }
        }

        const lineItemTags = [
            "SpecifiedTradeLineItem",
            "IncludedSupplyChainTradeLineItem",
            "InvoiceLine"
        ];
        const lineItems = lineItemTags.reduce((count, tagName) => count + this._findAllByLocalName(this.xmlDoc, tagName).length, 0);
        data.lineItemCount = String(lineItems);

        return data;
    }
};
