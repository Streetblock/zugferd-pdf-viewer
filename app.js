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
        }

        resetUI() {
            this.errorBox.classList.add("hidden");
            this.invoiceView.classList.add("hidden");
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
                if (!normalized || normalized === "Unbekannt") {
                    return "Unbekannt";
                }
                const label = paymentMeansLabels[normalized];
                return label ? `${label} (${normalized})` : `Code ${normalized}`;
            };

            const setText = (id, value) => {
                document.getElementById(id).textContent = value && value.trim ? value.trim() : (value ?? "-");
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
