# ZUGFeRD Viewer

Der Viewer liest Rechnungs-XML aus PDF-Anhängen oder XML-Dateien und prüft
**XSD und Schematron für BASIC, EN16931, EXTENDED und XRechnung 3.0 CIUS (CII)
direkt im Browser**. Derselbe
Prüfkern funktioniert in Node. Die Laufzeit benötigt **kein Java und keinen
Validierungsserver**. Mustangproject bleibt eine optionale Entwicklungsreferenz.

## Starten

Dieser Integrationsbranch benötigt Node >=22.22.3 (getestet mit 24.14).

```powershell
npm ci
npm start
```

Dann http://127.0.0.1:8765 öffnen. Alternativ den Projektordner statisch über
HTTPS bereitstellen. `file://` wird für die Prüfung nicht unterstützt.
`dist/`, `rules/` und `vendor/` gehören zur ausgelieferten Anwendung.

Die Dateiauswahl liest Rechnungen lokal. Der normale Server liefert nur Dateien;
`/api/validate` ist deaktiviert. Die XML-Engine lädt ausschließlich mitgelieferte
Regeln und Codelisten. PDF.js und sein Worker werden lokal mitgeliefert.
Styling, Icons und optionale QR-Bibliotheken stammen von externen Quellen.

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
Prüfkern. Mehrere mögliche Rechnungsanhänge führen zum Abbruch. Eine PDF mit gültigem XML und bestandenen PDF-Basisprüfungen zeigt
**„XML und PDF-Basisprüfungen bestanden · PDF/A offen“**. Fehler der Einbettung,
der Metadaten oder der PDF/A-Dateiregeln bleiben auch bei gültigem XML sichtbar.
Die vollständige PDF/A-3-Prüfung ist noch nicht implementiert.
PDF-Bild und XML werden nicht inhaltlich abgeglichen. Echtheit von Kennungen,
steuerliche Sachverhalte und Archivprozesse werden nicht bestätigt. Downloads
und SHA-256 sind kein revisionssicheres Archiv.

Maximal 5 MiB XML pro Prüfung, 20 MiB Originaldatei im Viewer. DTD/Entitäten
werden abgelehnt und externe XML-Ressourcen sind deaktiviert. Die erste
Browserversion läuft im Hauptthread; große Dateien können die Oberfläche kurz
blockieren. Pro Instanz ist nur eine gleichzeitige Prüfung möglich. Worker-
Isolation und abbrechbare Rechenzeit sind nächste Schritte.

## JavaScript-API

XML-Prüfkern in Node:

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

## Lokaler PDF.js-Fork: experimentelle PDF-Basisprüfungen

Branch: `feat/local-pdf-inspection`. Der PDF.js-CDN-Verweis wurde durch einen
mitgelieferten API-/Worker-Build unter `vendor/pdfjs/` ersetzt. Herkunft, Fork-
Commit, SHA-256-Dateihashes und Buildvariante stehen in `manifest.json`;
Apache-Lizenz und Änderungshinweis liegen daneben. Ein gemeinsamer Legacy-Build
wird für Browser und Node verwendet. Keine neue npm-Abhängigkeit wurde ergänzt.
Tailwind und die Google-Icon-Schrift werden weiterhin extern geladen; der
PDF-/XML-Prüfpfad benötigt sie nicht. Browser-Tests blockieren externe Anfragen.

Die drei getrennten Prüfzeilen bedeuten:

- **XML-Einbettung (Basisprüfungen):** eindeutige Rechnungsquelle, F-/UF-Verweise,
  Streamtyp, XML-MIME-Type und Dokument-AF. Exakte XML-Bytes und Original-PDF
  werden gehasht. Unterschiedliche XML-Streams oder mehrere Rechnungen führen
  zum Abbruch. Source/Data-Beziehungen und Parser-Reparaturen bleiben offen.
- **Metadaten (Basisprüfungen):** wohlgeformtes XMP ohne DTD/Entitäten, PDF/A-3-
  Kennung sowie Dateiname/Profil im Abgleich mit dem tatsächlichen XML. Erkannt
  werden Factur-X-1.0- und ZUGFeRD-2-Namensräume; unbekannte Formatversionen,
  XRechnung-XMP und andere Varianten bleiben offen. Die genaue ZUGFeRD-
  Unterversion lässt sich daraus nicht zuverlässig bestimmen.
- **PDF/A-3-Konformität:** Die Dateiregeln prüfen Header an Byte 0,
  Binärkommentar, Datei-ID, den verbotenen Trailer-Eintrag /Encrypt und zusätzliche
  Daten nach dem letzten erkennbaren EOF. Der Bericht enthält die Regelnummern
  6.1.2-1, 6.1.2-2 und 6.1.3-1 bis 6.1.3-3 mit Fundstelle und Status.
  Hinzu kommt der einzelne Zeilenumbruch nach dem klassischen xref-Schlüsselwort
  ([6.1.4-2](https://github.com/veraPDF/veraPDF-validation-profiles/wiki/PDFA-Parts-2-and-3-rules#rule-614-2)).
  Die Strukturprüfungen untersuchen startxref, Tabelleneinträge,
  Objekt-Offsets und Generationen, XRef-Streams, die Zuordnung komprimierter
  Objekte und die Verweise zwischen Revisionen. Diese Befunde tragen eigene
  PDF-XREF- bzw. PDF-OBJECT-STREAM-Kennungen und nennen die einschlägigen
  Abschnitte von [ISO 32000-1](https://opensource.adobe.com/dc-acrobat-sdk-docs/pdfstandards/PDF32000_2008.pdf).
  Für Dokumentobjekte prüft der Worker den Katalog, die Kind- und
  Elternverweise und die Seitenanzahl im Seitenbaum. Bei Anmerkungen prüft er
  Typ, Flags und ausgewählte Anforderungen an die Darstellung. Bei Aktionen
  prüft er die erlaubten Typen und Namen sowie die Verbote für zusätzliche
  Aktionen im Katalog, auf Seiten und in Formularen. Die PDF/A-Regeln dazu
  stehen in den Abschnitten 6.3, 6.4 und 6.5 der
  [veraPDF-Regelreferenz](https://github.com/veraPDF/veraPDF-validation-profiles/wiki/PDFA-Parts-2-and-3-rules#rule-631-1).
  Die Regeln 6.8-1 bis 6.8-4 prüfen PDF/A-3-Anhänge allgemein, einschließlich
  zusätzlicher Dateien neben dem Rechnungs-XML. Sie untersuchen MIME-Typ,
  /F, /UF, /AFRelationship und die Zuordnung über /AF. Eine Zuordnung etwa
  zur Seite kann diese PDF/A-Regel erfüllen. Die ZUGFeRD-Basisprüfung
  kontrolliert separat die Einbettung des Rechnungs-XML im Dokumentkatalog.
  Für XMP werden Erweiterungsdeklarationen, ihre RDF-Container und
  Pflichtfelder, definierte Eigenschaften und unterstützte Wertetypen geprüft.
  Die Schriftprüfung folgt Textoperatoren auf Seiten und in erreichbaren
  Form-XObjects. Sie prüft die Einbettung verwendeter Schriftprogramme,
  das Vorhandensein verwendeter Glyphen und die Nutzung von .notdef
  ([Regeln 6.2.11.4.1 und 6.2.11.8](https://github.com/veraPDF/veraPDF-validation-profiles/wiki/PDFA-Parts-2-and-3-rules#rule-621141-1)).
  Die Farbprüfung untersucht Output Intents, die Struktur eingebetteter
  ICC-Profile und verwendete Gerätefarbräume
  ([Regeln 6.2.3 und 6.2.4](https://github.com/veraPDF/veraPDF-validation-profiles/wiki/PDFA-Parts-2-and-3-rules#rule-623-1)).
  Die Transparenzprüfung kontrolliert Blend-Modi, Transparenzgruppen,
  Soft Masks und Deckkraft. Bei transparenter Seitendarstellung prüft sie auf
  einen PDF/A-Output-Intent oder einen expliziten Seiten-Blendfarbraum
  ([Regeln 6.2.10-1 und 6.2.10-2](https://github.com/veraPDF/veraPDF-validation-profiles/wiki/PDFA-Parts-2-and-3-rules#rule-6210-1)).
  Ein eindeutiger Verstoß ergibt einen Fehler. Die Vollprüfung bleibt ohne
  Verstoß offen. Dazu fehlen u. a. vollständige Schrift-, Farb- und
  Transparenzprüfungen.

Ein grünes **Basis**-Ergebnis ist bewusst nur eine Aussage zu diesem Teilumfang.
Es bestätigt keine vollständige Factur-X-, ZUGFeRD- oder PDF/A-Konformität.
Der JSON-Bericht enthält PDF-Befunde, Einschränkungen, Struktur und Byte-Hashes,
aber keine zweite Kopie der XML-/Anhangsbytes. Original-XML bleibt unverändert
herunterladbar. Der normale Betrieb nutzt weiterhin keinen Java-Server.

Die Dateiregeln lassen sich in Browser und Node auch ohne Rechnungs-XML ausführen:

~~~js
import { validatePdfA } from './src/pdfa-validation.mjs';
const report = await validatePdfA(pdfBytes, { profile: '3b' });
~~~

Die API akzeptiert bis zu 20 MiB als Uint8Array oder Node Buffer. Der
Prüfbericht liefert partial oder invalid und die SHA-256-Prüfsumme des Originals.
Der Viewer übernimmt eine eindeutige PDF/A-3-Stufe aus XMP. Die implementierten
Datei- und Strukturregeln gelten für 3a, 3b und 3u. Die vollständigen Anforderungen
der Stufen sind offen. Der PDF.js-Worker untersucht die originalen Querverweise
auch dann, wenn der normale Leser sie für die Darstellung reparieren musste.
Nach einer Reparatur bleiben die Prüfungen des wirksamen Trailers offen.
Die ID-Prüfung kontrolliert die Struktur aus zwei nichtleeren PDF-Strings.
Die Stabilität der ID über mehrere Revisionen und indirekte IDs sind noch offen.
Bei linearisierten Dateien, überschrittenen Inspektionsgrenzen oder nicht
unterstützten Streamfiltern bleiben die betreffenden Prüfungen offen. Wenn PDF.js
die Datei nicht öffnen kann, sind nur die direkt auf Originalbytes ausgeführten
Dateiregeln verfügbar. Die Objektstream-Prüfung bewertet Kopf und Index. Die
vollständige Syntax der eingebetteten Objekte und die Freiliste sind noch offen.
Der JSON-Bericht führt die erfassten Revisionen, Tabellen, Streams und Einträge
unter structureCounts auf.

Die Objektprüfung folgt den erreichbaren Einträgen für Katalog und Seiten,
Anmerkungen, Lesezeichen, Formularfelder, benannte JavaScript-Aktionen und
Aktionsketten. Dabei wird keine Aktion ausgeführt. Bei beschädigten Verweisen,
überschrittenen Traversierungsgrenzen oder nicht auswertbaren Aktionspfaden
können betroffene Regeln offen bleiben. Inhalt und Zustände von
Darstellungsstreams sind noch offen. Der Bericht zählt die erfassten
Dokumentobjekte unter documentCounts.

Die Anhangprüfung liest die Dateispezifikationen und Stream-Dictionaries im
Worker. Sie wertet Zuordnungen im Katalog, auf Seiten, in Annotationen, im
Strukturbaum und an erreichbaren XObjects aus. Mögliche Zuordnungen im
Seiteninhalt, beschädigte Verweise und nicht eingeordnete Beziehungsnamen
können offen bleiben. Die optionale /Params-Struktur und die vollständigen
Namensbaumregeln sind noch offen.

XMP-Erweiterungen werden auf den Originalmetadaten geprüft. Der Browser
verwendet DOMParser, Node den vorhandenen libxml2-WASM-Parser. DTDs und externe
Entitäten werden nicht verarbeitet. Unbekannte oder nicht vollständig
interpretierbare Wertetypen können offen bleiben. Der JSON-Bericht enthält die
Zähler embeddedFileCounts und xmpCounts, soweit die Daten lesbar waren.

Die Glyphenprüfung arbeitet mit den ursprünglichen Schriftprogrammen. Sie
unterstützt Type-3-Zeichenprogramme mit nachvollziehbarer Zeichenkodierung
sowie TrueType in CIDFontType2 mit Identity-H/V und auflösbarer CID-Zuordnung.
Für weitere Schrifttypen kann die Einbettung geprüft werden, während die
Glyphenzuordnung offen bleibt. Eine Schrift, die nur in Ressourcen eingetragen
ist, gilt dadurch noch nicht als benutzt. Für Text im Render-Modus 3 gelten die
Einbettungs- und Glyphenvorhandenseinsregeln nicht. Die .notdef-Prüfung bleibt
auch dort anwendbar. Schriften in noch nicht untersuchten Darstellungsstreams
und Mustern, vollständige Glyphenbreiten-, Unicode- und weitere Fontregeln
bleiben offen. Der JSON-Bericht enthält fontCounts.

Bei TrueType zählt eine leere Kontur mit gültigem Glyphenindex als vorhandene
Glyphe, etwa für ein Leerzeichen. Ein belegtes Mapping auf Glyphenindex 0 ist
hingegen die .notdef-Glyphe nach der
[OpenType-Spezifikation](https://learn.microsoft.com/typography/opentype/spec/cmap).
veraPDF 1.30.2 meldete im entsprechenden CID-Testfall keinen .notdef-Verstoß.
Die Wiederherstellung des Textmodus bei q/Q folgt dem PDF-Grafikzustand. Auch
hier ließ die Referenzversion einen gezielt erzeugten Einbettungsfehler durch.

Die Farbprüfung verfolgt den Grafikzustand beim Zeichnen von Pfaden, Text,
Bildern und Form-XObjects. Verwendete Gerätefarben werden mit den passenden
Standardfarbräumen oder dem eingebetteten PDF/A-Output-Intent abgeglichen.
Die Prüfung liest ICC-Header und Tag-Verzeichnisse aus dem Original und prüft
unter anderem Profilklasse, Farbraum, Version und die Komponentenzahl bei
ICCBased-Farbräumen. Bei mehreren Output Intents wird der Verweis auf den
gemeinsamen Profilstream geprüft. Der JSON-Bericht enthält colorCounts.
ICC-Transformationen und weitere ICC-Anforderungen bleiben offen. Das gilt
auch für Farbnutzung in Mustern, Schattierungen, Inline-Bildern, Type-3-Glyphen
und vom Viewer erzeugten Anmerkungsdarstellungen.

Die Transparenzprüfung verfolgt die tatsächlich verwendeten Grafikzustände
auf Seiten und in aufgerufenen Form-XObjects. Sie berücksichtigt die Reihenfolge
der Blend-Modi, separate Deckkraft für Kontur und Füllung, das Speichern und
Wiederherstellen mit q/Q sowie die Gruppen beim Zeichnen eines Forms. Ein
Blendfarbraum innerhalb eines Forms erfüllt die Anforderung an die Seite
allein nicht. Der Worker untersucht Soft-Mask-Dictionaries mit /Alpha oder
/Luminosity und Soft Masks an Bild-XObjects. Bei einer /Alpha-Maske dient
der Inhalt der Form der Maskenform. Bei einer Bildmaske dient deren Grau der
Maske. Diese Werte zählt die Farbprüfung nicht als sichtbare Gerätefarben.
Der JSON-Bericht enthält transparencyCounts. Die Prüfung lässt unter anderem
JPEG-2000-Alphadaten, nicht abschließend bewertbare Rechnerfunktionen sowie Transparenz in Mustern,
Inline-Bildern und Type-3-Glyphen offen. Die Prüfung
arbeitet auf PDF-Objekten und Grafikoperatoren. Pixel und ICC-Transformationen
sind außerhalb dieses Prüfumfangs.

Bei einer Masken-Transferfunktion unter /TR untersucht der Worker Typ 2
anhand der originalen Funktionsparameter. Er prüft genau einen Eingang und
einen Ausgang, die geordneten Intervalle /Domain und optional /Range, die
Koeffizienten /C0 und /C1 sowie den Exponenten /N. Fehlende optionale
Koeffizienten verwenden die Standardwerte. Gebrochene Exponenten verlangen
einen nichtnegativen Eingabebereich. Bei negativen Exponenten muss der
Bereich die Null ausschließen. Werte außerhalb von [0,1] sind bei Domain,
Range und Koeffizienten zulässig, da Eingabe und Ausgabe nach den jeweiligen
Clipping-Regeln begrenzt werden. Die Prüfung folgt indirekten Verweisen und
untersucht die deklarierten Typ-2-Parameter in Dictionaries und
Stream-Dictionaries. Streamdaten, Filter und die Pixelberechnung sind
außerhalb dieser Parameterprüfung. Nicht auflösbare Parameter bleiben offen.
Die Befunde erscheinen unter PDF-SOFT-MASK mit Fundstelle im /TR-Pfad.
[ISO 32000-1, Abschnitte 7.10.1, 7.10.3 und Tabelle 144](https://opensource.adobe.com/dc-acrobat-sdk-docs/pdfstandards/PDF32000_2008.pdf)

Für Typ 0 prüft der Worker die Sampletabelle im Originalstream. Die Funktion
muss genau einen Eingang und einen Ausgang deklarieren. Geprüft werden
Domain, Range, Sampleanzahl, Bittiefe, Interpolationsordnung und die
Mapping-Paare Encode und Decode. Anschließend müssen mindestens
ceil(Size × BitsPerSample / 8) dekodierte Bytes vorliegen. Zusätzliche Bytes
und ungenutzte Paddingbits sind zulässig. Encode und Decode dürfen
umgekehrte Endpunkte haben. Die Prüfung unterstützt ungefilterte Streams
und einzelnes Flate mit neutralen DecodeParms. Andere Filter, externe
Sampledaten und überschrittene Decodergrenzen bleiben offen. Kubische
Interpolation wird strukturell geprüft. Die numerische Interpolation und
Pixelberechnung liegen außerhalb dieses Prüfumfangs.
[ISO 32000-1, Abschnitt 7.10.2 und Tabelle 39](https://opensource.adobe.com/dc-acrobat-sdk-docs/pdfstandards/PDF32000_2008.pdf)

Typ 3 verbindet Teilfunktionen über die Intervalle in Domain und Bounds.
Der Worker prüft die Anzahl und Reihenfolge der Intervallgrenzen, die
Encode-Paare und optional Range. Alle Teilfunktionen müssen einen Eingang
und einen Ausgang haben. Funktionen der Typen 0, 2, 3 und 4 werden rekursiv
untersucht, einschließlich indirekter und wiederverwendeter Definitionen.
Der letzte Bounds-Wert darf der oberen Domain-Grenze entsprechen. Bei
einer einzigen Teilfunktion sind leere Bounds und gleiche Domain-Endpunkte
zulässig. Encode-Paare dürfen umgekehrt sein. Zyklische Verweise,
nicht abschließend bewertbarer Rechnercode und überschrittene Besuchs- oder Tiefengrenzen bleiben
offen. Bekannte Fehler in einer anderen Teilfunktion werden weiterhin
gemeldet. Die Befunde nennen den jeweiligen Pfad unter /TR/Functions.
[ISO 32000-1, Abschnitt 7.10.4 und Tabelle 41](https://opensource.adobe.com/dc-acrobat-sdk-docs/pdfstandards/PDF32000_2008.pdf)

Bei Typ 4 liest der Worker den Originalstream und prüft die vorgeschriebene
Rechnersprache. Domain und Range müssen jeweils einen skalaren Bereich
angeben. Die Analyse verfolgt Operandentypen, Stack und Zahlenintervalle
durch die Anweisungen und Bedingungen. Ein bestandenes Ergebnis verlangt
einen nachgewiesenen numerischen Einzelwert am Ende jedes untersuchten
Pfads. Ungültige Syntax und eindeutig nachgewiesene Typ-, Stack- oder
Rechenfehler ergeben einen Befund. Ungewisse Zweigbedingungen, mögliche
Rechenfehler, nicht bewertbare Operationen und überschrittene Analysegrenzen
können offen bleiben. Der Worker erzeugt aus dem Stream keine ausführbare
JavaScript- oder WASM-Funktion.
[ISO 32000-1, Abschnitt 7.10.5 und Tabelle 42](https://opensource.adobe.com/dc-acrobat-sdk-docs/pdfstandards/PDF32000_2008.pdf)

Für Anmerkungen untersucht der Worker die gespeicherte Normaldarstellung
unter /AP /N mit eigenem Grafikzustand und eigenen Ressourcen. Eine
Schaltfläche mit gültigem /AS wird in allen gespeicherten Normalzuständen
geprüft, da auch der momentan inaktive Zustand angezeigt oder gedruckt
werden kann. Bei einer gespeicherten Darstellung kommt die Deckkraft aus
ihrem Grafikzustand. Das /CA der Anmerkung spielt dabei keine Rolle.
Fehlende oder nicht auflösbare Zustände und vom Viewer erzeugte Darstellungen
mit Farbangaben oder Deckkraft können offen bleiben. Der Bericht zählt
gelesene Anmerkungsstreams unter transparencyCounts.annotationAppearances.
Die Regeln zur Struktur des Appearance-Wörterbuchs bleiben separat.
[ISO 32000-1, Abschnitt 12.5.5 und Tabelle 170](https://opensource.adobe.com/dc-acrobat-sdk-docs/pdfstandards/PDF32000_2008.pdf)

### PDF.js aktualisieren

Im separaten Fork alle Änderungen committen und anschließend bauen:

```powershell
npm ci
npx gulp generic-legacy
```

Im Viewer:

```powershell
npm run vendor:pdfjs -- "PFAD_ZUM_PDFJS_FORK"
npm test
npm run test:pdf-browser -- "PFAD_ZUM_PDFJS_FORK" "PFAD_ZU_CHROME.EXE"
```

Der Import verlangt einen sauberen Fork und prüft, dass der Build zum Commit
passt. Die Browserprüfung verwendet Puppeteer aus dem vorhandenen Fork und
prüft echte Uploads, Worker, XML-Regeln und Berichtdownloads. Synthetische
Test-PDFs sind ausdrücklich keine vollständig konformen PDF/A-Beispiele.
Ein unverändertes PDF/A-3b-Beispiel, gezielt veränderte Fassungen und synthetische
Strukturfälle prüfen identische Befunde in Browser und Node. Dazu gehören
klassische Tabellen, XRef- und Objektstreams, inkrementelle und hybride
Querverweise sowie gezielte Defekte in Seitenbaum, Anmerkungen und Aktionen.
Die Anhang- und XMP-Fälle enthalten unter anderem PDF/A-Zuordnungen an Seiten,
einen zusätzlichen Anhang mit fehlerhaftem MIME-Typ und fehlende oder fehlerhafte
XMP-Erweiterungsdeklarationen bei weiterhin gültigem Rechnungs-XML.
Schriftfälle unterscheiden verwendete, unbenutzte und unsichtbar verwendete
Schriften, fehlende Glyphen und belegte .notdef-Zuordnungen.
Die Farbfälle verwenden das RGB-Profil aus dem folgenden veraPDF-Beispiel.
Sie prüfen unter anderem passende und fehlende Output Intents, Standardfarbräume,
gleichlautende Profile in getrennten Streams und gezielt beschädigte ICC-Profile.
Im Vergleich meldete veraPDF 1.30.2 Gerätefarben teils bereits beim Setzen des
Farbraums. Unsere Prüfung meldet sie beim Zeichnen. Bei ungültiger ICC-Signatur,
ungültigen Tag-Offsets und abweichender Komponentenzahl meldet die lokale
Strukturprüfung Befunde, die veraPDF 1.30.2 in diesen Testfällen ausließ.
Transparenzfälle prüfen unter anderem q/Q, Alpha-Konstanten, Blend-Listen,
Seiten- und Formgruppen sowie Soft Masks in Grafikzuständen und Bildern.
veraPDF 1.30.2 meldete bei /Compatible, bei einem Blend-Array mit /Normal
als erstem Eintrag und bei einer vom Bild überschriebenen Soft Mask eine
fehlende Seitenkalibrierung. Ungültige spätere Blend-Einträge blieben dort
ohne Befund. Die lokale Prüfung folgt der Auswahlreihenfolge nach
ISO 32000-1 §11.6.3 und dem Maskenvorrang nach §11.6.4.3.
Bei Anmerkungen bestätigte veraPDF 1.30.2 die Befunde für deckende und
transparente Stempel und für die inaktive Normaldarstellung einer
Schaltfläche. Bei fehlendem oder ungültigem /AS prüfte die Referenz auch die
übrigen Zustände und meldete im Test fehlende Seitenkalibrierung. Der lokale
Worker lässt die Transparenzprüfung dieser Darstellung in dem Fall offen.
Die Transferfunktionsfälle prüfen gültige Standardwerte, indirekte Parameter,
Clipping-Intervalle, Exponenten und gezielt beschädigte Definitionen. veraPDF
1.30.2 akzeptierte alle 45 Fälle für Profil 3b, darunter auch fehlendes /N,
mehrere Ein- oder Ausgänge und unzulässige Kombinationen von Exponent und
Domain. Die neuen Strukturbefunde beruhen auf den Anforderungen aus
ISO 32000-1, Abschnitten 7.10.1 und 7.10.3 sowie Tabelle 144.
Die Typ-0-Fälle prüfen zusätzlich reale Samplebytes, alle zulässigen
Bittiefen, Packung, Flate, Mapping-Standardwerte und abgeschnittene Daten.
veraPDF 1.30.2 bestätigte die gültigen Parameter und Sampletabellen der
Referenzfälle. Fehlerhafte Typ-0-Definitionen und zu kurze Sampledaten
blieben dort ohne entsprechenden Befund. Externe Daten und einen
unbekannten Filter lehnte die Referenz über ihre allgemeinen Streamregeln
ab. Der lokale Typ-0-Prüfumfang lässt die nicht gelesenen Sampledaten
in diesen beiden Fällen offen.
Für Typ 3 bestätigte veraPDF 1.30.2 die gültigen Intervallzuordnungen,
gemeinsam genutzten Teilfunktionen und verschachtelten Samplefunktionen.
Auch die gezielt beschädigten Bounds, Encode-Arrays und Teilfunktionen
akzeptierte die Referenz. Die lokale Prüfung bewertet diese Definitionen
nach ISO 32000-1, Abschnitt 7.10.4 und Tabelle 41.
Für Typ 4 bestätigte veraPDF 1.30.2 die positiven Rechenbeispiele.
Ungültige Syntax, falsche Operanden- und Ergebnistypen, Stackfehler und
eindeutige Rechenfehler blieben in diesem Referenzlauf ohne entsprechenden
Befund. Die lokalen Befunde beruhen auf den Anforderungen aus
ISO 32000-1, Abschnitt 7.10.5 und Tabelle 42.

Die Datei tests/fixtures/verapdf-3b-6-8-t02-pass-a.pdf stammt aus dem
[veraPDF-Testkorpus](https://github.com/veraPDF/veraPDF-corpus/blob/bb75f4f0073d9350dfd058c0162a367e6fadf25e/PDF_A-3b/6.8%20Embedded%20files/veraPDF%20test%20suite%206-8-t02-pass-a.pdf)
(veraPDF Consortium, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)).
SHA-256: 5b8fdee7090f0a0fb7266d10dd0f6f1f8a37d286e3c06b1aa82e01d6d4f0a8a4.
veraPDF 1.30.2 bestätigte die Originaldatei für Profil 3b. Der Vergleich
bestätigte außerdem die fünf Einzelbefunde anhand gezielter Defekte. Beim
Trailer prüft der JavaScript-Kern zusätzlich die beiden ID-Werte als Strings
und meldet auch einen vorhandenen /Encrypt-Schlüssel mit Nullwert. Bei EOF
zählt CR, LF oder CRLF jeweils als ein Zeilenumbruch. Diese Grenzfälle stimmen
mit dem Verhalten der Referenzversion nicht vollständig überein.
Bei den neuen Fällen bestätigt veraPDF 1.30.2 insbesondere 6.1.4-2. Ein kaputter
Objektoffset oder Revisionszeiger kann dort schon beim Laden zum Abbruch führen.
Einige abweichende Tabelleneinträge behandelt die Referenz als Parserwarnung.
Bei Anmerkungen und Aktionen bestätigt veraPDF 1.30.2 die Befunde unter anderem
für versteckte Flags, zusätzliche Aktionen und verbotene Aktionen in Ketten.
Der lokale Prüfer findet zusätzlich JavaScript-Aktionen im Namensbaum. Die
Referenzversion meldete bei diesem Testfall keinen Verstoß.

`src/pdf-validation.mjs` trennt PDF-Inspektion und Berichtbildung von der UI.
Die Funktion `extractInvoice(bytes, { parseXml, decodeXml, profileOf })` kann auch
in Node genutzt werden; die drei Funktionen sind ein strikter XML-Parseradapter
(wie `InvoiceValidation` im Browser). Node-Tests nutzen den bereits vorhandenen
jsdom-Parser. PDF.js kann in Node fehlende optionale Canvas-Polyfills melden;
für den getesteten lesenden Prüfpfad werden diese nicht benötigt.
