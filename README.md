# ZUGFeRD Viewer

Der Viewer liest Rechnungs-XML aus PDF-Anhängen oder XML-Dateien und prüft
**XSD und Schematron für BASIC, EN16931, EXTENDED und XRechnung 3.0 CIUS (CII)
direkt im Browser**. Derselbe
Prüfkern funktioniert in Node. Die Laufzeit benötigt **kein Java und keinen
Validierungsserver**. Mustangproject bleibt eine optionale Entwicklungsreferenz.

Dieser Branch `feat/external-epc-qr` ergänzt den GiroCode-Bereich: Für
EUR-Rechnungen mit Zahlungsart 30 oder 58 erzeugt er den EPC-Zahlungspayload
aus den XML-Zahlungsdaten und zeigt den QR-Code über die bestehenden
Bibliotheken `epc-qr-payload` und `QR-Atelier`. Sind diese nicht verfügbar,
bleibt der lokal erzeugte Payload sichtbar. Bei einem Dateiwechsel werden
die vorherigen Zahlungsdaten und die QR-Anzeige zurückgesetzt.

Die Prüfungs-Commits für EN16931, BASIC, EXTENDED und XRechnung sowie die
kompakte Prüfanzeige wurden von `main` per Cherry-Pick übernommen. Der
Prüfkern und die Regelpakete sind auf beiden Branches identisch.

## Starten

```powershell
npm ci
npm start
```

Dann http://127.0.0.1:8765 öffnen. Alternativ den Projektordner statisch über
HTTPS bereitstellen. `file://` wird für die Prüfung nicht unterstützt.
`dist/`, `rules/` und `vendor/` gehören zur ausgelieferten Anwendung.

Die Dateiauswahl liest Rechnungen lokal. Der normale Server liefert nur Dateien;
`/api/validate` ist deaktiviert. Die XML-Engine lädt ausschließlich mitgelieferte
Regeln und Codelisten. PDF.js, Styling und optionale QR-Bibliotheken stammen noch
von externen Quellen; die gesamte Anwendung ist daher noch nicht offline gebündelt.

## Prüfumfang und Grenzen

- CII `CrossIndustryInvoice:100`, Profile BASIC, EN16931 und EXTENDED.
- XRechnung 3.0 CIUS in CII: Original-UN/CEFACT-D16B-XSD plus beide vollständigen
  Schematron-Stufen (CEN EN16931 und KoSIT XRechnung). Gepinnt auf XRechnung 3.0.2,
  KoSIT-Konfiguration `2026-08-31`, CEN `1.3.16`, XRechnung-Schematron `2.6.0`.
- Automatische Auswahl anhand exakter Profilkennungen. BASIC und EXTENDED
  unterstützen die Kennungen sowohl von Factur-X als auch von ZUGFeRD.
- Original-XSDs und profilbezogene Schematron-Regeln einschließlich Codelisten
  aus dem Mustang-Regelstand `ZF_250`. Keine automatische Auswahl sämtlicher
  ZUGFeRD-Unterversionen.
- Echte Schema-, Datentyp-, Pflichtfeld-, Steuer-, Summen- und Codeprüfungen.
- Originale Regelkennungen, XPath-Fundstellen, SVRL, Regelstand, Zeit und
  SHA-256 der geprüften XML-Bytes im JSON-Bericht.
- Status `valid`, `invalid`, `unsupported` oder `not-checked`. Nur vollständig
  abgeschlossene XSD- und Schematron-Prüfungen können `valid` ergeben.

Die XRechnung-Prüfung startet automatisch bei der exakten Kennung
`urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0`.
Ältere XRechnung-Versionen, XRechnung Extension, CVD sowie UBL Invoice/CreditNote
sind noch nicht unterstützt. Ein Ergebnis gilt ausschließlich für den angegebenen
Regelstand und die erkannte Syntax.
MINIMUM und BASIC-WL werden als für vollständige
deutsche B2B-E-Rechnungen ungeeignet ausgewiesen. Der B2G-Schalter prüft nur das
Vorhandensein von BuyerReference bei anderen Profilen. Bei XRechnung wird BT-10
unabhängig vom Schalter durch die Regeln geprüft. Leitweg-ID-Prüfziffer und
Empfängerzuordnung werden nicht geprüft.

XRechnung übernimmt die ausdrücklich konfigurierten KoSIT-Fehlerstufen. Beispiel:
`CII-SR-465` wird zum Fehler, `BR-CL-23` zur Warnung. Eine falsche IBAN-Prüfziffer
ist laut Originalregel `BR-DE-19` eine Warnung. `valid` bedeutet daher: keine
Fehler; vorhandene Warnungen bleiben sichtbar. Originalstufe und angewendete
Overrides stehen im JSON-Bericht. Die Prüfung bestätigt kein existierendes Bankkonto.

Die Anzeige trennt „XML-Prüfung bestanden · Profil …“, „XML-Prüfung: Regelfehler“
und „noch nicht unterstützt“. Ein erfolgreiches BASIC-/EXTENDED-Ergebnis bestätigt
die jeweils angegebenen Profilregeln, nicht pauschal alle EN16931-Ausprägungen.
Ein unbekanntes Profil oder ein Lade-/Laufzeitfehler kann keine grüne Bestätigung
erzeugen. Es gibt keinen automatischen Rückfall auf ein anderes Regelpaket.

Der Prüfbereich zeigt zunächst nur Ergebnis, gegebenenfalls die Anzahl der
Warnungen sowie „Prüfbericht (JSON)“ und „Original-XML“. Ein Klick auf die
Ergebniszeile öffnet alle Prüfdetails, Fehler, Hinweise und Prüfsummen. Bei jeder
neuen Dateiauswahl ist der Bereich wieder geschlossen, auch bei Regelfehlern.

Die vorhandene PDF-Extraktion liefert die ursprünglichen XML-Bytes an denselben
Prüfkern. Mehrere mögliche Rechnungsanhänge führen zum Abbruch. Eine PDF mit
gültigem XML zeigt **„XML bestanden · PDF/A-Prüfung offen“**. Die vollständige
Java-freie PDF/A-3- und Einbettungsprüfung ist noch nicht implementiert.
PDF-Bild und XML werden nicht inhaltlich abgeglichen. Echtheit von Kennungen,
steuerliche Sachverhalte und Archivprozesse werden nicht bestätigt. Downloads
und SHA-256 sind kein revisionssicheres Archiv.

Maximal 5 MiB XML pro Prüfung, 20 MiB Originaldatei im Viewer. DTD/Entitäten
werden abgelehnt und externe XML-Ressourcen sind deaktiviert. Die erste
Browserversion läuft im Hauptthread; große Dateien können die Oberfläche kurz
blockieren. Pro Instanz ist nur eine gleichzeitige Prüfung möglich. Worker-
Isolation und abbrechbare Rechenzeit sind nächste Schritte.

## JavaScript-API

Node.js 20+:

```js
import { readFile } from 'node:fs/promises';
import { createValidator } from './src/xml-validator/node.mjs';
const validator = await createValidator();
try {
    const result = await validator.validateXml(await readFile('rechnung.xml'));
    console.log(result.status, result.issues);
} finally {
    validator.dispose();
}
```

Browser, auf HTTP-Loopback oder HTTPS:

```html
<script src="./vendor/SaxonJS2.rt.js"></script>
<script type="module">
  import { createValidator } from './dist/xml-validator.mjs';
  const validator = await createValidator();
  // file stammt aus einem <input type="file">.
  // const result = await validator.validateXml(await file.arrayBuffer());
  // validator.dispose(); // nach Abschluss aller Prüfungen
</script>
```

Die API akzeptiert `Uint8Array`/Node `Buffer`, `ArrayBuffer` und UTF-8-Text.
Originalbytes sind insbesondere für UTF-16 und andere Kodierungen vorzuziehen.
`createValidator({ assetBaseUrl })` erlaubt im Browser einen anderen Ablageort
der Regeln; die URL bezeichnet jetzt den gemeinsamen Ordner `rules/` mit den
Unterordnern `basic/`, `en16931/`, `extended/`, `xrechnung/`.
`SUPPORTED_PROFILES` exportiert alle sechs unterstützten Kennungen. Die Pakete
werden erst beim ersten Dokument des jeweiligen Profils geladen und je Instanz
wiederverwendet. `dispose()` gibt alle geladenen XSD-Validatoren frei.
SaxonJS muss vorher geladen sein. Parameter- und Parallelitätsfehler werfen
Exceptions. Fehler beim Laden eines Regelpakets und bei seiner Ausführung
ergeben `not-checked` mit Detailmeldung. Ein fehlgeschlagener Ladevorgang wird
beim nächsten Prüfversuch wiederholt.

`schematron.stages` enthält pro Stufe Status, Anzahl ausgeführter Regeln,
SEF-SHA-256 und den unveränderten SVRL-Bericht. Bei XRechnung müssen `cen` und
`xrechnung` erfolgreich abgeschlossen sein; es gibt keinen Rückfall auf eine
einzige Stufe. Das bisherige `svrl`-Feld bleibt für einstufige Profile erhalten.
Bei mehreren Stufen ist `rulesetSha256` der SHA-256 der in Ausführungsreihenfolge
mit LF verbundenen SEF-Prüfsummen; die einzelnen Prüfsummen stehen in den Stufen.

## Bauen und testen

```powershell
npm run build
npm test
node tools/prepare-browser-tests.mjs
```

Der Build benötigt kein Java und keine Netzverbindung. Er prüft die Original-
Hashes aus `rules/<profil>/source-lock.json`, bündelt XSDs, kompiliert das XSLT
mit `xslt3` zum SEF und baut das Browsermodul mit eingebettetem libxml2-WASM.
Nur die Compilerkopie erhält ein virtuelles `xml:base`, damit persönliche
Dateipfade nicht im SEF landen. Für EXTENDED enthält `tools/compiler-input.mjs`
zusätzlich eine explizite SaxonJS-2.7-Kompatibilitätsanpassung an zwei numerischen
Ausdrücken. Grenzen und Rundungen bleiben erhalten; Originale und SVRL-Testtexte
bleiben unverändert. Die Anpassung und ihr Compiler-Eingabehash stehen im Manifest,
die Anpassung auch im JSON-Prüfbericht. Siehe [EXTENDED-Regelherkunft](rules/extended/PROVENANCE.md).
Für XRechnung verwendet die IBAN-Funktion in der Compilerkopie `xs:decimal`
statt `xs:integer`, um die Modulo-97-Rechnung jenseits der JS-Ganzzahlpräzision
exakt auszuführen. Der Build prüft außerdem Kennung, Regelstufen und Fehlerstufen
gegen das unveränderte KoSIT-Szenario. Siehe [XRechnung-Regelherkunft](rules/xrechnung/PROVENANCE.md).
Compiler-Metadaten können sich beim Neubauen ändern. Mit `npm run build -- basic`
oder `npm run build -- extended` lassen sich einzelne Pakete gezielt neu bauen.
Für XRechnung: `npm run build -- xrechnung`.

Normale Tests brauchen kein Java. Sie umfassen positive und negative Rechnungen,
Summen, Steuerangaben, Codes, XSD-Datentypen, Kodierungen, nicht unterstützte
Profile, beschädigte Regeln, DTD-Abwehr, Instanz-Lebensdauer, Prüfanzeige und Server.
Die erzeugten Dateien unter `.test-artifacts/browser/` sind synthetische
Positiv- und Negativfälle und werden nicht eingecheckt.

## Mustang ausschließlich als Entwicklungsreferenz

Optional JDK 17+ und die separat installierte, gepinnte JAR verwenden:

```powershell
./tools/install-validator.ps1
npm run test:reference
npm run reference -- tests/fixtures/invoice.xml referenz.json
```

27 Fälle für EN16931, BASIC und EXTENDED werden mit Mustang verglichen,
einschließlich Profilaliasen, Summen-/Codefehlern, XSD-Fehlern und der Abgrenzung
EXTENDED-spezifischer Felder. Acht Fälle prüfen separat die positiven und negativen
Toleranzgrenzen der beiden angepassten EXTENDED-Rechenregeln. Dort wird die konkrete
Regelmeldung verglichen, da Mustang zusätzlich eigene Rechenprüfungen ausführt.
Mustang ergänzt außerdem
Rechenprüfungen, XRechnung-Hinweise und kontextabhängig weitere Regeln. Diese
Zusatzprüfungen sind nicht Teil der JS-Engine; vollständige Meldungslisten und
Regelanzahlen müssen daher nicht gleich sein.

Für den ausdrücklichen Vergleich im Viewer gibt es weiterhin:

```powershell
npm run dev:reference
```

Vorher einen laufenden Server auf Port 8765 beenden. **Nur dieser Modus** sendet
Originaldateien zusätzlich an den lokalen Mustang-Dienst. Sein Bericht inklusive
PDF/A/veraPDF und Einbettungsprüfung steht separat unter `referenceValidation`
im JSON-Download. Er überschreibt das JS-Ergebnis nicht.

Die JAR gehört weder ins Repository noch in die Auslieferung. `npm install`,
`npm start`, `npm run build` und `npm test` laden oder starten sie nicht.
Temporäre Referenzdateien werden nach Abschluss und abgefangenen Fehlern gelöscht;
bei einem Rechner-/Prozessabsturz können Kopien im Temp-Verzeichnis verbleiben.

## KoSIT als zusätzliche XRechnung-Entwicklungsreferenz

Für einen Vergleich mit exakt derselben XRechnung-Konfiguration wird optional
KoSIT Validator 1.6.3 verwendet. Er ist ausschließlich ein Testwerkzeug; der
Viewer lädt und startet ihn nicht. Mustang bleibt für die bisherigen Profile erhalten.

```powershell
./tools/install-kosit.ps1
npm run test:kosit
```

Installation und Test benötigen Netz zum Download bzw. JDK 17+ zur Ausführung.
JAR und entpackte Konfiguration bleiben unter ignorierten Pfaden. Downloads und
verwendete Referenzdateien werden per SHA-256 geprüft. 20 synthetische Fälle
vergleichen Annahmeentscheidung und XSD-Ergebnis; bei schemafähigen Dokumenten
zusätzlich sämtliche Regelkennungen, angewendeten Fehlerstufen und XPath-Fundstellen.
Darunter sind gültige und ungültige IBANs mit Leerzeichen, Buchstaben und langen
Kontonummern. Die normalen Tests prüfen zusätzlich nicht unterstützte Varianten,
fehlende/beschädigte Regelstufen und unvollständige Berichte. Im Browser wurden
die gültige Beispieldatei und der absichtliche BT-10-Negativfall geprüft.

## Herkunft und Lizenzen

Siehe die Regelherkunft für [EN16931](rules/en16931/PROVENANCE.md),
[BASIC](rules/basic/PROVENANCE.md), [EXTENDED](rules/extended/PROVENANCE.md),
[XRechnung](rules/xrechnung/PROVENANCE.md) und
[Drittanbieter-Hinweise](vendor/NOTICE.txt). SaxonJS ist kostenlos nutzbar,
aber **nicht Open Source**. Die Browserdatei bleibt unverändert; ihre Bedingungen
gelten auch bei einer späteren eigenständigen Bibliotheksauslieferung.

- [Mustangproject 2.26.0](https://github.com/ZUGFeRD/mustangproject/releases/tag/core-2.26.0)
- [SaxonJS](https://www.saxonica.com/html/saxonjs/index.html)
- [libxml2-wasm](https://github.com/jameslan/libxml2-wasm)
- [BMF-FAQ](https://www.bundesfinanzministerium.de/Content/DE/FAQ/e-rechnung.html)
- [FeRD: Profile](https://www.ferd-net.de/standards/zugferd-faq)

Als Nächstes: UBL Invoice/CreditNote, XRechnung Extension/CVD, Worker-Ausführung und
eine Java-freie PDF/A-Engine mit nachgewiesenem Prüfumfang. Metadaten allein
dürfen keine PDF/A-Konformität bestätigen.
