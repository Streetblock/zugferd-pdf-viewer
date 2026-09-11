# Herkunft des Regelstands

Die sechs Dateien unter `source/` wurden unverändert aus der gepinnten
`Mustang-CLI-2.26.0.jar` entnommen (ZIP-Lesen; kein Java-Build notwendig).

JAR SHA-256:
`42d7868cb68264874a7b8cab4c3587b03b23ccc7cd72373da917f66758bb9736`

Upstream: https://github.com/ZUGFeRD/mustangproject/tree/core-2.26.0/validator/src/main/resources

- Vier XSDs: `schema/ZF_250/EN16931/FACTUR-X_EN16931*.xsd`.
- Schematron-XSLT: `xslt/ZF_250/FACTUR-X_EN16931.xslt`.
- Codelisten: `xslt/ZF_250/FACTUR-X_EN16931_codedb.xml`.

`source-lock.json` hält die Original-Hashes fest. Ein Regelupdate erfordert eine
bewusste Aktualisierung dieses Pins und der Referenztests. `manifest.json` enthält
die Hashes der erzeugten Laufzeitdateien. Der Prüfkern verifiziert diese beim Laden;
dies erkennt beschädigte Dateien, ersetzt aber keine Signatur.

Die Originale bleiben verfügbar. Die Compilerkopie erhält nur ein virtuelles
`xml:base`; keine Regel wird hinzugefügt, entfernt oder abgeschwächt.
`schemas.json` bündelt die XSD-Texte, `en16931.sef.json` ist das mit xslt3 2.7.0
übersetzte XSLT. Diese Ableitungen wurden am 11.09.2026 für die JS-Laufzeit erstellt.

Die Lizenz-/Urheberhinweise des Bezugsprojekts liegen unverändert in
`UPSTREAM-LICENSE.txt` und `UPSTREAM-NOTICE.txt`. Dessen NOTICE benennt unter
anderem die europäischen EN16931-Artefakte. Für diese nennt das CEN-Projekt
EUPL 1.2; der Originaltext liegt in `CEN-EUPL-1.2.txt` (die Mustang-NOTICE nennt
abweichend „EUPL 2.0“). Das ist keine pauschale Umlizenzierung der eingebundenen
Normartefakte auf Apache-2.0.

CEN-Quelle: https://github.com/ConnectingEurope/eInvoicing-EN16931

Dieser Stand umfasst die Factur-X-EN16931-Profilregeln. Er ist keine vollständige
Mustang-Portierung: eigene Java-Rechenprüfungen, XRechnung-Hinweise und zusätzliche
nationale Regeln bleiben außerhalb dieses Prüfumfangs.
