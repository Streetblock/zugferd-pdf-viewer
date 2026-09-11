# ZUGFeRD Viewer

Der Viewer liest PDF-Anhänge und zeigt die Rechnungsdaten aus dem XML an.
Mustangproject 2.26.0 dient ausschließlich als **optionale Entwicklungsreferenz**
für die geplante gemeinsame JavaScript-Bibliothek für Node und Browser.

## Normaler Betrieb – ohne Java

`index.html` statisch bereitstellen oder lokal starten:

```powershell
npm start
```

Dann http://127.0.0.1:8765 öffnen. Der normale Server lädt den Mustang-Adapter
nicht, startet kein Java und aktiviert keinen Validierungsdienst.
Der Viewer prüft derzeit XML-Wohlgeformtheit und Profilkennung. Vollständige
XSD-, Schematron- und PDF/A-Konformität bleiben ohne Referenzmodus **offen**.
Die Java-freie Vollprüfung ist noch nicht implementiert.

## Optionale Referenz für Entwickler

Node.js 20+ und JDK 17+ erforderlich. Installation ausdrücklich separat:

```powershell
./tools/install-validator.ps1
npm run dev:reference
```

Vor dem Wechsel einen bereits laufenden Server auf Port 8765 beenden.
Nur in diesem Modus wird die Originaldatei an den lokalen Dienst geschickt.
Mustang prüft profilabhängige XSD-/Schematron-Regeln und PDF/A-3 mittels veraPDF.
Zusätzlich werden MIME-Type, AFRelationship und Dokument-AF-Zuordnung geprüft.
Die JAR wird mit SHA-256 geprüft, ist per `.gitignore` ausgeschlossen und gehört
weder ins Repository noch in die ausgelieferte Anwendung. Im Repository liegen
nur Adapter, Installationsskript und Tests. Es gibt keinen automatischen Download
bei `npm install`, `npm start` oder `npm test`.

Temporäre Prüfdateien werden nach Abschluss und abgefangenen Fehlern gelöscht;
bei einem Rechner-/Prozessabsturz können Kopien im Temp-Verzeichnis verbleiben.
Keine Rechnung wird an einen externen Prüfdienst gesendet. Der bestehende Viewer
lädt PDF.js, Styling und optionale QR-Bibliotheken von externen Quellen; vollständig
offline gebündelt ist er noch nicht.

## Prüfanzeige

- Getrennte Ergebnisse für Profil, XML-Regeln, PDF/A und XML-Einbettung.
- Validator-Meldungen mit Regelkennung und Fundstelle.
- JSON-Bericht mit originalem Mustang-Bericht, Version, Prüfzeit und Prüfsummen.
- Downloads der unveränderten Originaldatei und der ursprünglichen XML-Bytes.
- Mehrere mögliche Rechnungs-XML-Anhänge führen zum Abbruch.
- Fehlende oder unvollständige Prüfungen ergeben keine positive Gesamtbestätigung.

BASIC wird grundsätzlich berücksichtigt; MINIMUM und BASIC-WL werden als für
vollständige deutsche B2B-E-Rechnungen ungeeignet ausgewiesen. Die genaue
ZUGFeRD-Unterversion lässt sich nicht immer aus der XML-Profilkennung ablesen.
Der B2G-Schalter verlangt zusätzlich BuyerReference, ersetzt aber keine vollständige
XRechnung-Prüfung und bestätigt weder Leitweg-ID-Prüfziffer noch Empfängerzuordnung.

Die maßgeblichen Rechnungswerte stammen aus dem XML. PDF-Bild und XML werden
nicht inhaltlich abgeglichen. Steuerliche Sachverhalte, Echtheit und Archivprozesse
werden nicht bestätigt. Downloads und SHA-256 sind kein revisionssicheres Archiv.

## Tests und reproduzierbare Referenzberichte

```powershell
npm ci
npm test
```

Die normalen Tests benötigen kein Java. Für die separat installierte Referenz:

```powershell
npm run test:reference
npm run reference -- tests/fixtures/invoice.xml referenz.json
```

Referenztests prüfen die synthetische gültige Rechnung sowie Varianten mit
fehlender Rechnungsnummer und falscher Gesamtsumme. Fehlt Mustang/JDK, schlägt
nur der ausdrücklich gestartete Referenztest mit einem Installationshinweis fehl.
Der Berichtsgenerator überschreibt weder vorhandene Berichte noch Originaldateien.

## Entwicklungspfad

1. Ergebnisformat und Referenzfälle anhand von Mustang festlegen.
2. Original-XSDs und Schematron-Regeln versioniert mit JS-/WASM-Laufzeiten ausführen.
3. Dieselben Eingabedateien in Node und Browser gegen die Referenzergebnisse testen;
   Abweichungen anhand konkreter Regeln untersuchen.
4. Java-freie PDF/A-Engine auswählen und deren vollständigen Prüfumfang nachweisen.
   Reine Metadatenprüfungen dürfen keine PDF/A-Konformität bestätigen.
5. Den vorhandenen Viewer auf die gemeinsame Bibliothek umstellen und die Prüfung
   im Browser in einem Worker ausführen. Alle Laufzeitdateien lokal bündeln.

## Quellen und Lizenzhinweise

- [Mustangproject 2.26.0](https://github.com/ZUGFeRD/mustangproject/releases/tag/core-2.26.0)
  (Apache-2.0; eingebundene Komponenten haben eigene Lizenzbedingungen).
- [veraPDF: Validierungsumfang](https://docs.verapdf.org/validation/)
- [BMF-FAQ zur E-Rechnung](https://www.bundesfinanzministerium.de/Content/DE/FAQ/e-rechnung.html)
- [FeRD: ZUGFeRD-Profile](https://www.ferd-net.de/standards/zugferd-faq)

Referenz-Pin: `Mustang-CLI-2.26.0.jar`, SHA-256
`42d7868cb68264874a7b8cab4c3587b03b23ccc7cd72373da917f66758bb9736`.
Lizenz-/Notice-Texte der JAR: `java -jar tools/Mustang-CLI-2.26.0.jar --action license`.
