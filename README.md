# ZUGFeRD Viewer

Der Viewer liest Rechnungs-XML aus PDF-Anhängen oder XML-Dateien und prüft
**XSD und Schematron für BASIC, EN16931 und EXTENDED direkt im Browser**. Derselbe
Prüfkern funktioniert in Node. Die Laufzeit benötigt **kein Java und keinen
Validierungsserver**. Mustangproject bleibt eine optionale Entwicklungsreferenz.

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

XRechnung wird weiterhin angezeigt, erhält in dieser JS-Version aber **keine
positive XML-Konformitätsbestätigung**. UBL wird noch nicht verarbeitet.
MINIMUM und BASIC-WL werden als für vollständige
deutsche B2B-E-Rechnungen ungeeignet ausgewiesen. Der B2G-Schalter prüft nur das
Vorhandensein von BuyerReference, keine vollständige XRechnung, Leitweg-ID-Prüfziffer
oder Empfängerzuordnung.

Die Anzeige trennt „XML-Prüfung bestanden · Profil …“, „XML-Prüfung: Regelfehler“
und „noch nicht unterstützt“. Ein erfolgreiches BASIC-/EXTENDED-Ergebnis bestätigt
die jeweils angegebenen Profilregeln, nicht pauschal alle EN16931-Ausprägungen.
Ein unbekanntes Profil oder ein Lade-/Laufzeitfehler kann keine grüne Bestätigung
erzeugen. Es gibt keinen automatischen Rückfall auf ein anderes Regelpaket.

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
Unterordnern `basic/`, `en16931/`, `extended/` (zuvor direkt `rules/en16931/`).
`SUPPORTED_PROFILES` exportiert alle fünf unterstützten Kennungen. Die Pakete
werden erst beim ersten Dokument des jeweiligen Profils geladen und je Instanz
wiederverwendet. `dispose()` gibt alle geladenen XSD-Validatoren frei.
SaxonJS muss vorher geladen sein. Parameter- und Parallelitätsfehler werfen
Exceptions. Fehler beim Laden eines Regelpakets und bei seiner Ausführung
ergeben `not-checked` mit Detailmeldung. Ein fehlgeschlagener Ladevorgang wird
beim nächsten Prüfversuch wiederholt.

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
Compiler-Metadaten können sich beim Neubauen ändern. Mit `npm run build -- basic`
oder `npm run build -- extended` lassen sich einzelne Pakete gezielt neu bauen.

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

## Herkunft und Lizenzen

Siehe die Regelherkunft für [EN16931](rules/en16931/PROVENANCE.md),
[BASIC](rules/basic/PROVENANCE.md), [EXTENDED](rules/extended/PROVENANCE.md) und
[Drittanbieter-Hinweise](vendor/NOTICE.txt). SaxonJS ist kostenlos nutzbar,
aber **nicht Open Source**. Die Browserdatei bleibt unverändert; ihre Bedingungen
gelten auch bei einer späteren eigenständigen Bibliotheksauslieferung.

- [Mustangproject 2.26.0](https://github.com/ZUGFeRD/mustangproject/releases/tag/core-2.26.0)
- [SaxonJS](https://www.saxonica.com/html/saxonjs/index.html)
- [libxml2-wasm](https://github.com/jameslan/libxml2-wasm)
- [BMF-FAQ](https://www.bundesfinanzministerium.de/Content/DE/FAQ/e-rechnung.html)
- [FeRD: Profile](https://www.ferd-net.de/standards/zugferd-faq)

Als Nächstes: XRechnung und UBL mit eigenen Referenzfällen, Worker-Ausführung und
eine Java-freie PDF/A-Engine mit nachgewiesenem Prüfumfang. Metadaten allein
dürfen keine PDF/A-Konformität bestätigen.
