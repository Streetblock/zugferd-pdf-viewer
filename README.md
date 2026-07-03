# ZUGFeRD Viewer

[![Live Demo](https://img.shields.io/badge/Live%20Demo-open-2ea44f)](https://streetblock.github.io/zugferd-pdf-viewer/)

Ein kleiner, rein browserbasierter Viewer für ZUGFeRD- und PDF/A-3-Rechnungen.
Die App liest den eingebetteten XML-Anhang direkt aus der PDF und zeigt die wichtigsten Rechnungsdaten im Browser an.

## Live Demo

- GitHub Pages: https://streetblock.github.io/zugferd-pdf-viewer/
- Repository: https://github.com/Streetblock/zugferd-pdf-viewer

## Features

- Drag-and-drop für PDF-Dateien
- Extraktion des XML-Anhangs direkt im Browser
- Anzeige von Rechnungsnummer, Datum, Betrag, Verkäufer, Käufer, Zahlungsdaten und Steuerinfos
- EPC-Zahlungspayload aus den Rechnungsdaten für SEPA-fähige Banking-Apps
- QR-Code-Rendering über die gehosteten Schwesterprojekte `QR-Atelier` und `epc-qr-payload`
- Keine Server-Komponente nötig
- Aufgeteilt in `index.html`, `style.css`, `app.js` und `src/lib.js`

## Lokaler Start

Einfach `index.html` im Browser öffnen.

## Projektstruktur

- `index.html` - HTML-Shell der Anwendung
- `style.css` - Styling
- `app.js` - UI-Controller, Rendering und Zahlungslogik
- `src/lib.js` - PDF- und XML-Logik
- EPC- und QR-Bibliotheken werden direkt von den gehosteten Schwesterprojekten geladen

## Hinweis

Der Viewer läuft komplett clientseitig. Die PDF bleibt lokal im Browser und wird nicht an einen Server hochgeladen.
