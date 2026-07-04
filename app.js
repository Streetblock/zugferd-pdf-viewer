const EPC_MODULE_URL = "https://streetblock.github.io/epc-qr-payload/libs/EPCpayload.js";
const QR_CORE_URL = "https://streetblock.github.io/QR-Atelier/libs/QRcore.js";
const QR_SVG_URL = "https://streetblock.github.io/QR-Atelier/libs/QRsvg.js";

const PDFAttachmentExtractor = window.PDFAttachmentExtractor;
const InvoiceXMLParser = window.InvoiceXMLParser;

function normalizeText(value) {
    return String(value ?? "").trim();
}

function normalizeAmount(value) {
    if (value === null || value === undefined || value === "") {
        throw new Error("Amount is missing.");
    }

    if (typeof value === "number") {
        if (!Number.isFinite(value)) {
            throw new Error("Amount is not finite.");
        }
        return `EUR${value.toFixed(2)}`;
    }

    const raw = normalizeText(value).replace(/\s+/g, "").replace(/,/g, ".");
    if (!raw) {
        throw new Error("Amount is missing.");
    }

    if (/^[A-Za-z]{3}\d+(\.\d{1,2})?$/.test(raw)) {
        return raw.toUpperCase();
    }

    if (/^\d+(\.\d{1,2})?$/.test(raw)) {
        return `EUR${raw}`;
    }

    const parsed = Number.parseFloat(raw);
    if (Number.isNaN(parsed)) {
        throw new Error("Amount could not be parsed.");
    }

    return `EUR${parsed.toFixed(2)}`;
}

function buildFallbackEpcPayload(data) {
    const bic = normalizeText(data.bic).replace(/\s+/g, "").toUpperCase();
    const name = normalizeText(data.name || data.recipient || data.payeeName);
    const iban = normalizeText(data.iban).replace(/\s+/g, "").toUpperCase();
    const amount = normalizeAmount(data.amount);
    const purpose = normalizeText(data.purpose).toUpperCase();
    const remittanceReference = normalizeText(data.remittanceReference || data.reference).toUpperCase();
    const remittanceText = normalizeText(data.remittanceText || data.message);
    const information = normalizeText(data.information || data.additionalInfo);

    if (!name) {
        throw new Error("Recipient name is missing.");
    }
    if (!iban) {
        throw new Error("IBAN is missing.");
    }

    const lines = [
        "BCD",
        "002",
        "1",
        "SCT",
        bic,
        name,
        iban,
        amount,
        purpose,
        remittanceReference,
        remittanceText,
        information
    ];

    while (lines.length > 0 && lines[lines.length - 1] === "") {
        lines.pop();
    }

    return lines.join("\n");
}

async function loadOptionalModules() {
    if (window.location.protocol === "file:") {
        return {
            epc: null,
            qrCore: null,
            qrSvg: null,
            errors: []
        };
    }

    const [epc, qrCore, qrSvg] = await Promise.allSettled([
        import(EPC_MODULE_URL),
        import(QR_CORE_URL),
        import(QR_SVG_URL)
    ]);

    return {
        epc: epc.status === "fulfilled" ? epc.value : null,
        qrCore: qrCore.status === "fulfilled" ? qrCore.value.QrCore : null,
        qrSvg: qrSvg.status === "fulfilled" ? qrSvg.value.QrSvgRenderer : null,
        errors: [epc, qrCore, qrSvg]
            .filter((result) => result.status === "rejected")
            .map((result) => result.reason)
    };
}

document.addEventListener("DOMContentLoaded", () => {
    if (typeof pdfjsLib !== "undefined") {
        pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    }

    class UIManager {
        constructor(optionalModules = null) {
            this.dropZone = document.getElementById("drop-zone");
            this.fileInput = document.getElementById("file-input");
            this.loader = document.getElementById("loader");
            this.invoiceView = document.getElementById("invoice-view");
            this.errorBox = document.getElementById("error-box");
            this.errorText = document.getElementById("error-text");
            this.statusBadge = document.getElementById("status-badge");
            this.paymentPanel = document.getElementById("payment-panel");
            this.paymentSummary = document.getElementById("payment-summary");
            this.paymentRecipient = document.getElementById("payment-recipient");
            this.paymentReference = document.getElementById("payment-reference");
            this.paymentIban = document.getElementById("payment-iban");
            this.paymentAmount = document.getElementById("payment-amount");
            this.paymentPayload = document.getElementById("payment-payload");
            this.paymentNote = document.getElementById("payment-note");
            this.paymentQr = document.getElementById("payment-qr");
            this.copyPaymentPayloadButton = document.getElementById("copy-payment-payload");
            this.xmlDebugPanel = document.getElementById("xml-debug-panel");
            this.xmlDebugSummary = document.getElementById("xml-debug-summary");
            this.xmlDebugList = document.getElementById("xml-debug-list");
            this.currentPaymentPayload = "";
            this.currentXmlAttachments = [];
            this.optionalModules = optionalModules || { epc: null, qrCore: null, qrSvg: null, errors: [] };

            this.bindEvents();
        }

        setOptionalModules(optionalModules) {
            this.optionalModules = optionalModules || { epc: null, qrCore: null, qrSvg: null, errors: [] };
            if (this.currentPaymentPayload && this.paymentPanel && !this.paymentPanel.classList.contains("hidden")) {
                this.renderQrFromPayload(this.currentPaymentPayload);
            }
        }

        bindEvents() {
            this.dropZone.addEventListener("click", () => this.fileInput.click());
            this.fileInput.addEventListener("change", (e) => this.handleFiles(e.target.files));

            this.dropZone.addEventListener("dragover", (e) => {
                e.preventDefault();
                this.dropZone.classList.add("drag-active");
            });

            ["dragleave", "dragend", "drop"].forEach((event) => {
                this.dropZone.addEventListener(event, () => this.dropZone.classList.remove("drag-active"));
            });

            this.dropZone.addEventListener("drop", (e) => {
                e.preventDefault();
                if (e.dataTransfer.files.length) {
                    this.handleFiles(e.dataTransfer.files);
                }
            });

            this.copyPaymentPayloadButton.addEventListener("click", async () => {
                if (!this.currentPaymentPayload) {
                    return;
                }

                try {
                    await navigator.clipboard.writeText(this.currentPaymentPayload);
                    this.copyPaymentPayloadButton.textContent = "Kopiert";
                } catch (error) {
                    console.error(error);
                    this.copyPaymentPayloadButton.textContent = "Nicht kopiert";
                } finally {
                    window.setTimeout(() => {
                        this.copyPaymentPayloadButton.textContent = "QR-Daten kopieren";
                    }, 1500);
                }
            });
        }

        resetUI() {
            this.errorBox.classList.add("hidden");
            this.invoiceView.classList.add("hidden");
            this.paymentPanel.classList.add("hidden");
            this.currentPaymentPayload = "";
            this.paymentPayload.value = "";
            this.paymentNote.textContent = "";
            this.paymentQr.innerHTML = "";
            this.xmlDebugPanel.classList.add("hidden");
            this.xmlDebugSummary.textContent = "";
            this.xmlDebugList.innerHTML = "";
            this.currentXmlAttachments = [];
            this.dropZone.classList.remove("hidden");
        }

        showLoading() {
            this.dropZone.classList.add("hidden");
            this.loader.classList.remove("hidden");
            this.updateStatus("Analysiere...", "bg-yellow-500");
        }

        hideLoading() {
            this.loader.classList.add("hidden");
        }

        showError(msg) {
            this.hideLoading();
            this.dropZone.classList.remove("hidden");
            this.errorBox.classList.remove("hidden");
            this.errorText.textContent = msg;
            this.updateStatus("Fehler", "bg-red-500");
        }

        updateStatus(text, colorClass) {
            this.statusBadge.classList.remove("hidden", "bg-gray-600", "bg-green-500", "bg-red-500", "bg-yellow-500");
            this.statusBadge.classList.add(colorClass);
            this.statusBadge.textContent = text;
        }

        renderInvoice(data, filename, xmlAttachments = []) {
            this.hideLoading();
            this.invoiceView.classList.remove("hidden");
            this.updateStatus("Erfolg", "bg-green-500");

            const paymentMeansLabels = {
                "10": "Bargeld",
                "20": "Scheck",
                "30": "Uberweisung",
                "48": "Kartenzahlung",
                "49": "Lastschrift",
                "58": "SEPA-Uberweisung",
                "59": "SEPA-Lastschrift"
            };

            const formatPaymentMeans = (code) => {
                const normalized = String(code || "").trim();
                if (!normalized || normalized === "Unbekannt") {
                    return "Unbekannt";
                }
                const label = paymentMeansLabels[normalized];
                return label ? `${label} (${normalized})` : `Code ${normalized}`;
            };

            const setText = (id, value) => {
                const element = document.getElementById(id);
                element.textContent = value && value.trim ? value.trim() : (value ?? "-");
            };

            setText("val-inv-number", data.invoiceNumber);
            setText("val-date", data.issueDate);
            setText("val-total", `${data.totalAmount} ${data.currency}`);
            setText("val-seller", data.sellerName);
            setText("val-buyer", data.buyerName);
            setText("val-seller-address", data.sellerAddress);
            setText("val-buyer-vat", data.buyerVatId || "Unbekannt");
            setText("val-seller-vat", data.sellerVatId);
            setText("val-buyer-reference", data.buyerReference);
            setText("val-payment-means", formatPaymentMeans(data.paymentMeans));
            setText("val-due-date", data.dueDate);
            setText("val-iban", data.iban);
            setText("val-bic", data.bic);
            setText("val-net-amount", `${data.netAmount} ${data.currency}`);
            setText("val-tax-amount", `${data.taxAmount} ${data.currency}`);
            setText("val-line-count", data.lineItemCount);
            setText("val-filename", filename);

            this.renderPaymentSection(data);
            this.renderXmlDebug(xmlAttachments);
        }

        renderPaymentSection(data) {
            const paymentMeansCode = String(data.paymentMeans || "").trim();
            const isEligibleCode = paymentMeansCode === "30" || paymentMeansCode === "58";
            const hasIban = Boolean(data.iban && data.iban !== "Unbekannt");
            const hasAmount = Boolean(data.totalAmount && data.totalAmount !== "0.00");
            const isEuro = data.currency === "EUR";
            const canCreatePayload = isEligibleCode && hasIban && hasAmount && isEuro;
            this.paymentPanel.classList.remove("hidden");
            this.paymentSummary.textContent = `${data.sellerName} | ${data.totalAmount} ${data.currency}`;
            this.paymentRecipient.textContent = data.sellerName || "-";
            this.paymentReference.textContent = data.invoiceNumber && data.invoiceNumber !== "Unbekannt"
                ? `Rechnung ${data.invoiceNumber}`
                : data.sellerName || "-";
            this.paymentIban.textContent = data.iban || "-";
            this.paymentAmount.textContent = `${data.totalAmount} ${data.currency}`;

            if (!canCreatePayload) {
                this.currentPaymentPayload = "";
                this.paymentPayload.value = "";
                this.paymentQr.innerHTML = "";

                if (paymentMeansCode === "10") {
                    this.paymentNote.textContent = "Barzahlung erkannt: Kein EPC-QR-Code, weil dafuer eine Bankueberweisung gedacht ist.";
                } else if (!isEligibleCode) {
                    this.paymentNote.textContent = `Zahlungsart ${paymentMeansCode || "Unbekannt"}: Kein EPC-QR-Code, weil nur Uberweisung (30) und SEPA-Uberweisung (58) unterstuetzt werden.`;
                } else if (!isEuro) {
                    this.paymentNote.textContent = "Kein EPC-QR-Code, weil der Standard nur fuer EUR-Rechnungen gedacht ist.";
                } else if (!hasIban) {
                    this.paymentNote.textContent = "Kein EPC-QR-Code, weil die IBAN fehlt.";
                } else if (!hasAmount) {
                    this.paymentNote.textContent = "Kein EPC-QR-Code, weil kein Betrag ermittelt werden konnte.";
                } else {
                    this.paymentNote.textContent = "EPC-Payload konnte nicht erzeugt werden.";
                }

                return;
            }

            const paymentData = {
                name: data.sellerName,
                iban: data.iban,
                bic: data.bic && data.bic !== "Unbekannt" ? data.bic : "",
                amount: data.totalAmount,
                remittanceText: data.invoiceNumber && data.invoiceNumber !== "Unbekannt"
                    ? `Rechnung ${data.invoiceNumber}`
                    : data.sellerName
            };

            let payload;
            try {
                if (this.optionalModules.epc?.EpcQrPayload?.create) {
                    payload = this.optionalModules.epc.EpcQrPayload.create(paymentData).payload;
                } else if (this.optionalModules.epc?.generate) {
                    payload = this.optionalModules.epc.generate(paymentData);
                } else {
                    payload = buildFallbackEpcPayload(paymentData);
                }
            } catch (error) {
                console.error(error);
                this.currentPaymentPayload = "";
                this.paymentPayload.value = "";
                this.paymentQr.innerHTML = "";
                this.paymentNote.textContent = `EPC-Payload konnte nicht erstellt werden: ${error.message}`;
                return;
            }

            this.currentPaymentPayload = payload;
            this.paymentPayload.value = payload;
            this.renderQrFromPayload(payload);
        }

        renderQrFromPayload(payload) {
            const qrCore = this.optionalModules.qrCore;
            const qrSvgRenderer = this.optionalModules.qrSvg;

            if (qrCore && qrSvgRenderer) {
                try {
                    const qrData = new qrCore(payload, { errorCorrectionLevel: "M", maxVersion: 13 }).generate();
                    const qrSvg = new qrSvgRenderer(qrData, {
                        size: 240,
                        margin: 2,
                        background: "#ffffff",
                        colorStart: "#0f766e",
                        colorEnd: "#0f766e",
                        dotStyle: "square",
                        cornerStyle: "square"
                    }).render();

                    this.paymentQr.innerHTML = qrSvg;
                    this.paymentNote.textContent = "Der Payload kann direkt in eine Banking-App oder in einen QR-Code-Generator uebernommen werden.";
                    return;
                } catch (error) {
                    console.error(error);
                    this.paymentQr.innerHTML = "";
                    this.paymentNote.textContent = `QR-Vorschau konnte nicht gerendert werden: ${error.message}`;
                    return;
                }
            }

            this.paymentQr.innerHTML = `
                <div class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    QR-Bibliotheken lokal nicht verfuegbar. Der EPC-Payload ist unten trotzdem sichtbar.
                </div>
            `;
            this.paymentNote.textContent = "Der Payload ist verfuegbar, aber die QR-Vorschau konnte lokal nicht geladen werden.";
        }

        renderXmlDebug(xmlAttachments) {
            const attachments = Array.isArray(xmlAttachments) ? xmlAttachments : [];
            this.currentXmlAttachments = attachments;

            if (!attachments.length) {
                this.xmlDebugPanel.classList.add("hidden");
                this.xmlDebugSummary.textContent = "Keine eingebetteten XML-Dateien gefunden.";
                this.xmlDebugList.innerHTML = "";
                return;
            }

            this.xmlDebugPanel.classList.remove("hidden");
            this.xmlDebugSummary.textContent = `${attachments.length} XML-Datei${attachments.length === 1 ? "" : "en"} gefunden. Mit den Buttons kannst du sie direkt herunterladen.`;

            this.xmlDebugList.innerHTML = attachments.map((attachment, index) => {
                const safeId = `xml-download-${index}`;
                const sizeInfo = attachment.content ? `${attachment.content.length} Zeichen` : "unbekannte Groesse";
                return `
                    <div class="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3 md:flex-row md:items-center md:justify-between">
                        <div>
                            <p class="font-semibold text-gray-800 break-all">${attachment.filename}</p>
                            <p class="text-xs text-gray-500">${sizeInfo}</p>
                        </div>
                        <button type="button" id="${safeId}" class="inline-flex items-center justify-center rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-900">
                            Exportieren
                        </button>
                    </div>
                `;
            }).join("");

            attachments.forEach((attachment, index) => {
                const button = document.getElementById(`xml-download-${index}`);
                if (!button) return;
                button.addEventListener("click", () => {
                    this.downloadXmlAttachment(attachment);
                });
            });
        }

        downloadXmlAttachment(attachment) {
            const blob = new Blob([attachment.content], { type: "application/xml;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = attachment.filename || "attachment.xml";
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        }

        renderPaymentSection(data) {
            const paymentMeansCode = String(data.paymentMeans || "").trim();
            const isEligibleCode = paymentMeansCode === "30" || paymentMeansCode === "58";
            const hasIban = Boolean(data.iban && data.iban !== "Unbekannt");
            const hasAmount = Boolean(data.totalAmount && data.totalAmount !== "0.00");
            const isEuro = data.currency === "EUR";
            const canCreatePayload = isEligibleCode && hasIban && hasAmount && isEuro;

            if (!canCreatePayload) {
                this.paymentPanel.classList.add("hidden");
                this.currentPaymentPayload = "";
                this.paymentPayload.value = "";
                this.paymentQr.innerHTML = "";

                if (paymentMeansCode === "10") {
                    this.paymentNote.textContent = "Barzahlung erkannt: Kein EPC-QR-Code, weil dafuer eine Bankueberweisung gedacht ist.";
                } else if (!isEligibleCode) {
                    this.paymentNote.textContent = `Zahlungsart ${paymentMeansCode || "Unbekannt"}: Kein EPC-QR-Code, weil nur Ueberweisung (30) und SEPA-Ueberweisung (58) unterstuetzt werden.`;
                } else if (!isEuro) {
                    this.paymentNote.textContent = "Kein EPC-QR-Code, weil der Standard nur fuer EUR-Rechnungen gedacht ist.";
                } else if (!hasIban) {
                    this.paymentNote.textContent = "Kein EPC-QR-Code, weil die IBAN fehlt.";
                } else if (!hasAmount) {
                    this.paymentNote.textContent = "Kein EPC-QR-Code, weil kein Betrag ermittelt werden konnte.";
                } else {
                    this.paymentNote.textContent = "EPC-Payload konnte nicht erzeugt werden.";
                }

                return;
            }

            const paymentData = {
                name: data.sellerName,
                iban: data.iban,
                bic: data.bic && data.bic !== "Unbekannt" ? data.bic : "",
                amount: data.totalAmount,
                remittanceText: data.invoiceNumber && data.invoiceNumber !== "Unbekannt"
                    ? `Rechnung ${data.invoiceNumber}`
                    : data.sellerName,
                information: data.issueDate && data.issueDate !== "Unbekannt"
                    ? `Rechnungsdatum ${data.issueDate}`
                    : ""
            };

            try {
                const payload = this.createPaymentPayload(paymentData);
                this.currentPaymentPayload = payload;
                this.paymentPanel.classList.remove("hidden");
                this.paymentSummary.textContent = `${data.sellerName} | ${data.totalAmount} ${data.currency}`;
                this.paymentRecipient.textContent = data.sellerName || "-";
                this.paymentReference.textContent = paymentData.remittanceText || "-";
                this.paymentIban.textContent = data.iban || "-";
                this.paymentAmount.textContent = `${data.totalAmount} ${data.currency}`;
                this.paymentPayload.value = payload;
                this.renderQrFromPayload(payload);
            } catch (error) {
                console.error(error);
                this.paymentPanel.classList.add("hidden");
                this.currentPaymentPayload = "";
                this.paymentPayload.value = "";
                this.paymentQr.innerHTML = "";
                this.paymentNote.textContent = "EPC-Payload konnte aus den Rechnungsdaten nicht erstellt werden.";
            }
        }

        createPaymentPayload(paymentData) {
            if (this.optionalModules.epc?.EpcQrPayload?.create) {
                return this.optionalModules.epc.EpcQrPayload.create(paymentData).payload;
            }

            if (this.optionalModules.epc?.generate) {
                return this.optionalModules.epc.generate(paymentData);
            }

            return buildFallbackEpcPayload(paymentData);
        }

        renderQrFromPayload(payload) {
            const qrCore = this.optionalModules.qrCore;
            const qrSvgRenderer = this.optionalModules.qrSvg;

            if (qrCore && qrSvgRenderer) {
                try {
                    const qrData = new qrCore(payload, { errorCorrectionLevel: "M", maxVersion: 13 }).generate();
                    const qrSvg = new qrSvgRenderer(qrData, {
                        size: 240,
                        margin: 2,
                        background: "#ffffff",
                        colorStart: "#0f766e",
                        colorEnd: "#0f766e",
                        dotStyle: "square",
                        cornerStyle: "square"
                    }).render();

                    this.paymentQr.innerHTML = qrSvg;
                    this.paymentNote.textContent = "Der Payload kann direkt in eine Banking-App oder in einen QR-Code-Generator uebernommen werden.";
                    return;
                } catch (error) {
                    console.error(error);
                    this.paymentQr.innerHTML = "";
                    this.paymentNote.textContent = `QR-Vorschau konnte nicht gerendert werden: ${error.message}`;
                    return;
                }
            }

            this.paymentQr.innerHTML = `
                <div class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    QR-Bibliotheken lokal nicht verfuegbar. Der EPC-Payload ist unten trotzdem sichtbar.
                </div>
            `;
            this.paymentNote.textContent = "Der Payload ist verfuegbar, aber die QR-Vorschau konnte lokal nicht geladen werden.";
        }

        async handleFiles(files) {
            if (files.length === 0) return;

            const file = files[0];
            const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
            if (!isPdf) {
                this.showError("Bitte waehlen Sie eine PDF-Datei aus.");
                return;
            }

            this.resetUI();
            this.showLoading();

            try {
                const extractor = new PDFAttachmentExtractor();
                const xmlData = await extractor.extractXML(file);

                this.renderXmlDebug(xmlData.xmlAttachments);
                console.log("Extracted XML:", xmlData.filename);

                const parser = new InvoiceXMLParser(xmlData.content);
                const invoiceData = parser.parse();

                this.renderInvoice(invoiceData, xmlData.filename, xmlData.xmlAttachments);
            } catch (err) {
                console.error(err);
                this.showError(err.message);
            }
        }
    }

    const uiManager = new UIManager();
    loadOptionalModules().then((mods) => {
        uiManager.setOptionalModules(mods);
    }).catch((error) => {
        console.warn("QR modules could not be loaded:", error);
    });
});
