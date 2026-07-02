# ZUGFeRD Viewer

Kleiner lokaler Viewer zum Laden einer ZUGFeRD-/PDF-A-3-Rechnung, Extrahieren des XML-Anhangs und Anzeigen der wichtigsten Rechnungsdaten im Browser.

## Start

Einfach `index.html` im Browser öffnen.

Die App nutzt:

- `PDF.js` für den PDF-Anhang
- `app.js` für die UI
- `src/lib.js` für PDF- und XML-Logik
- `style.css` für das Styling

## Projektstruktur

- `index.html` - Shell der Anwendung
- `style.css` - Styles
- `app.js` - UI-Controller
- `src/lib.js` - Extraktion und Parsing
