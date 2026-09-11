# EXTENDED-Regelherkunft und Compileranpassung

Sechs unveränderte Dateien aus Mustangproject 2.26.0:

- Vier XSDs aus `schema/ZF_250/EXTENDED/`.
- `xslt/ZF_250/FACTUR-X_EXTENDED.xslt`.
- `xslt/ZF_250/FACTUR-X_EXTENDED_codedb.xml`.

JAR SHA-256: `42d7868cb68264874a7b8cab4c3587b03b23ccc7cd72373da917f66758bb9736`.
Originaldatei-Hashes stehen in `source-lock.json`, abgeleitete Laufzeit-Hashes
und Compileranpassungen in `manifest.json`.

Quelle: https://github.com/ZUGFeRD/mustangproject/tree/core-2.26.0/validator/src/main/resources

Gemeinsame Lizenztexte und Urheberhinweise: [UPSTREAM-LICENSE](../en16931/UPSTREAM-LICENSE.txt),
[UPSTREAM-NOTICE](../en16931/UPSTREAM-NOTICE.txt), [CEN EUPL 1.2](../en16931/CEN-EUPL-1.2.txt).
Zu den unterschiedlichen Lizenzangaben siehe [EN16931-Herkunft](../en16931/PROVENANCE.md).

Die Ableitungen wurden am 11.09.2026 erstellt. Die Compilerkopie erhält ein
virtuelles `xml:base`. Zusätzlich wendet `tools/compiler-input.mjs` folgende
Kompatibilitätsanpassung an:

- Betroffene Regeln: `BR-FXEXT-CO-10` und `BR-FXEXT-CO-13`.
- SaxonJS 2.7 bricht bei deren Originalausdrücken mit `XPTY0004` ab: Die
  numerische Berechnung erwartet `xs:decimal`, erhält aber `xs:double` aus
  einer Summe nicht typisierter XML-Knoten.
- In diesen zwei ausführbaren `xsl:when/@test` werden insgesamt vier Literale
  `xs:decimal(100)` durch `100` ersetzt. Numerische Typ-Promotion erhält den
  Wert bei Multiplikation/Division. Rundungsoperationen, Endkonvertierungen
  und Toleranzbedingungen bleiben erhalten.
- Die Original-XSLT-Datei und die ursprünglichen `svrl:failed-assert/@test`
  bleiben unverändert. Keine Regel wird übersprungen oder herabgestuft.
- Der Build erwartet genau zwei Ausdrücke und vier Ersetzungen; ein abweichender
  Quellstand führt zum Abbruch. Anpassung und Compiler-Eingabehash werden
  protokolliert; der JSON-Prüfbericht nennt die Anpassung ebenfalls.

Acht Mustang-Vergleichsfälle prüfen die konkreten Regelmeldungen für Abweichungen
von -0,02, -0,01, +0,01 und +0,02 bei einer Rechnungsposition. Dadurch werden die
zulässigen Grenzwerte beider Regeln und die unmittelbar unzulässigen Nachbarwerte
gegen die unveränderte Java-Referenz geprüft.

Die EXTENDED-Testrechnung enthält außerdem `BrandName`, ein zusätzliches Produktfeld.
Wird sie als BASIC oder EN16931 umetikettiert, muss die jeweilige XSD-Prüfung
fehlschlagen. Damit wird die tatsächliche Auswahl unterschiedlicher Regeln geprüft.
