import { EpcQrPayload } from "https://streetblock.github.io/epc-qr-payload/libs/EPCpayload.js";
import { QrCore } from "https://streetblock.github.io/QR-Atelier/libs/QRcore.js";
import { QrSvgRenderer } from "https://streetblock.github.io/QR-Atelier/libs/QRsvg.js";

const PDFAttachmentExtractor = window.PDFAttachmentExtractor;
const InvoiceXMLParser = window.InvoiceXMLParser;

document.addEventListener("DOMContentLoaded", () => {
    if (typeof pdfjsLib !== "undefined") {
        pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    }

    class UIManager {
        constructor() {
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
            this.currentPaymentPayload = "";

            this.bindEvents();
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
                if (!this.currentPaymentPayload) return;

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

        renderInvoice(data, filename) {
            this.hideLoading();
            this.invoiceView.classList.remove("hidden");
            this.updateStatus("Erfolg", "bg-green-500");

            const paymentMeansLabels = {
                "10": "Bargeld",
                "20": "Scheck",
                "30": "Überweisung",
                "48": "Kartenzahlung",
                "49": "Lastschrift",
                "58": "SEPA-Überweisung",
                "59": "SEPA-Lastschrift"
            };

            const formatPaymentMeans = (code) => {
                const normalized = String(code || "").trim();
                if (!normalized || normalized === "Unbekannt") return "Unbekannt";
                const label = paymentMeansLabels[normalized];
                return label ? `${label} (${normalized})` : `Code ${normalized}`;
            };

            const setText = (id, value) => {
                const element = document.getElementById(id);
                element.textContent = value && value.trim ? value.trim() : (value ?? "-");
            };

            const escapeHtml = (value) => String(value ?? "")
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#39;");

            const cleanValue = (value) => {
                const normalized = value && value.trim ? value.trim() : String(value ?? "").trim();
                return normalized && normalized !== "Unbekannt" ? normalized : "";
            };

            const renderPartySummary = (id, partyName, fields) => {
                const element = document.getElementById(id);
                const normalizedFields = fields
                    .map((field) => ({
                        label: field.label,
                        value: cleanValue(field.value),
                        multiline: Boolean(field.multiline)
                    }))
                    .filter((field) => field.value);

                const addressField = normalizedFields.find((field) => field.multiline);
                const inlineFields = normalizedFields.filter((field) => !field.multiline);

                element.innerHTML = `
                    <div class="space-y-3">
                        <div>
                            <p class="text-lg font-bold text-gray-800 break-words">${escapeHtml(partyName || "-")}</p>
                        </div>
                        <div class="space-y-2 text-sm text-gray-700">
                            ${inlineFields.map(({ label, value }) => `
                                <p><span class="font-semibold">${escapeHtml(label)}:</span> <span class="break-words">${escapeHtml(value)}</span></p>
                            `).join("")}
                            ${addressField ? `
                                <div>
                                    <p class="text-xs font-bold uppercase text-gray-400 mb-1">${escapeHtml(addressField.label)}</p>
                                    <p class="whitespace-pre-line break-words text-gray-700">${escapeHtml(addressField.value)}</p>
                                </div>
                            ` : ""}
                        </div>
                    </div>
                `;
            };

            setText("val-inv-number", data.invoiceNumber);
            setText("val-date", data.issueDate);
            setText("val-total", `${data.totalAmount} ${data.currency}`);
            setText("val-invoice-type", data.invoiceTypeDisplay);
            renderPartySummary("val-seller", data.sellerName, [
                { label: "Ansprechpartner", value: data.sellerContactPerson },
                { label: "Telefon", value: data.sellerPhone },
                { label: "E-Mail", value: data.sellerEmail },
                { label: "USt-Id", value: data.sellerVatId },
                { label: "Adresse", value: data.sellerAddress, multiline: true }
            ]);
            renderPartySummary("val-buyer", data.buyerName, [
                { label: "USt-Id", value: data.buyerVatId },
                { label: "Adresse", value: data.buyerAddress, multiline: true }
            ]);
            setText("val-seller-tax-reference", data.sellerTaxReference);
            setText("val-seller-communication-id", data.sellerCommunicationId);
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
        }

        renderPaymentSection(data) {
            const paymentMeansCode = String(data.paymentMeans || "").trim();
            const isEligibleCode = paymentMeansCode === "30" || paymentMeansCode === "58";
            const hasIban = Boolean(data.iban && data.iban !== "Unbekannt");
            const hasAmount = Boolean(data.totalAmount && data.totalAmount !== "0.00");
            const isEuro = data.currency === "EUR";
            const canCreatePayload = isEligibleCode && hasIban && hasAmount && isEuro && typeof EpcQrPayload?.create === "function";

            if (!canCreatePayload) {
                this.paymentPanel.classList.add("hidden");
                this.currentPaymentPayload = "";
                this.paymentPayload.value = "";
                this.paymentQr.innerHTML = "";

                if (paymentMeansCode === "10") {
                    this.paymentNote.textContent = "Barzahlung erkannt: Kein EPC-QR-Code, weil dafür eine Banküberweisung gedacht ist.";
                } else if (!isEligibleCode) {
                    this.paymentNote.textContent = `Zahlungsart ${paymentMeansCode || "Unbekannt"}: Kein EPC-QR-Code, weil nur Überweisung (30) und SEPA-Überweisung (58) unterstützt werden.`;
                } else if (!isEuro) {
                    this.paymentNote.textContent = "Kein EPC-QR-Code, weil der Standard nur für EUR-Rechnungen gedacht ist.";
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
                invoiceNumber: data.invoiceNumber,
                remittanceText: data.invoiceNumber && data.invoiceNumber !== "Unbekannt"
                    ? `Rechnung ${data.invoiceNumber}`
                    : data.sellerName,
                information: data.issueDate && data.issueDate !== "Unbekannt"
                    ? `Rechnungsdatum ${data.issueDate}`
                    : ""
            };

            try {
                const paymentResult = EpcQrPayload.create(paymentData);
                const payload = paymentResult.payload;
                const qrData = new QrCore(payload, paymentResult.qrOptions).generate();
                const qrSvg = new QrSvgRenderer(qrData, {
                    size: 240,
                    margin: 2,
                    background: "#ffffff",
                    colorStart: "#0f766e",
                    colorEnd: "#0f766e",
                    dotStyle: "square",
                    cornerStyle: "square"
                }).render();

                this.currentPaymentPayload = payload;
                this.paymentPanel.classList.remove("hidden");
                this.paymentSummary.textContent = `${data.sellerName} | ${data.totalAmount} ${data.currency}`;
                this.paymentRecipient.textContent = data.sellerName || "-";
                this.paymentReference.textContent = paymentData.remittanceText || "-";
                this.paymentIban.textContent = data.iban || "-";
                this.paymentAmount.textContent = `${data.totalAmount} ${data.currency}`;
                this.paymentPayload.value = payload;
                this.paymentQr.innerHTML = qrSvg;
                this.paymentNote.textContent = "Der Payload kann direkt in eine Banking-App oder in einen QR-Code-Generator übernommen werden.";
            } catch (error) {
                console.error(error);
                this.paymentPanel.classList.add("hidden");
                this.currentPaymentPayload = "";
                this.paymentPayload.value = "";
                this.paymentQr.innerHTML = "";
                this.paymentNote.textContent = "EPC-Payload konnte aus den Rechnungsdaten nicht erstellt werden.";
            }
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

                console.log("Extracted XML:", xmlData.filename);

                const parser = new InvoiceXMLParser(xmlData.content);
                const invoiceData = parser.parse();

                this.renderInvoice(invoiceData, xmlData.filename);
            } catch (err) {
                console.error(err);
                this.showError(err.message);
            }
        }
    }

    new UIManager();
});
