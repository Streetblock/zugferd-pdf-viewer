import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.dirname(fileURLToPath(import.meta.url));
const MAX_BYTES = 20 * 1024 * 1024;

const assets = new Map([
    ['/', ['index.html', 'text/html']], ['/index.html', ['index.html', 'text/html']],
    ['/app.js', ['app.js', 'text/javascript']], ['/style.css', ['style.css', 'text/css']],
    ['/src/lib.js', ['src/lib.js', 'text/javascript']],
    ['/src/validation.js', ['src/validation.js', 'text/javascript']]
]);

export function createServer({ ready = false, runner = null, engine = 'Browsermodus' } = {}) {
    let busy = false;
    return http.createServer(async (req, res) => {
        const reply = (status, body) => {
            res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8',
                'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
            res.end(JSON.stringify(body));
        };
        // Bind to loopback, reject DNS rebinding and cross-origin requests.
        const host = `127.0.0.1:${req.socket.localPort}`;
        if (req.headers.host !== host || (req.headers.origin && req.headers.origin !== `http://${host}`)) {
            reply(403, { error: 'Nur lokaler Zugriff über 127.0.0.1 erlaubt.' }); return;
        }
        if (req.method === 'GET' && req.url === '/api/health') {
            reply(200, { available: ready, engine }); return;
        }
        if (req.method === 'POST' && req.url === '/api/validate') {
            if (req.headers['x-viewer-request'] !== 'validate') { reply(403, { error: 'Ungültige Anfrage.' }); return; }
            if (!ready || !runner) { reply(503, { error: 'Referenzmodus ist nicht aktiv. Für Entwickler: npm run dev:reference.' }); return; }
            if (busy) { reply(429, { error: 'Es läuft bereits eine Prüfung. Bitte erneut versuchen.' }); return; }
            const kind = req.headers['content-type'] === 'application/pdf' ? 'pdf'
                : req.headers['content-type'] === 'application/xml' ? 'xml' : null;
            if (!kind) { reply(415, { error: 'Nur PDF oder XML erlaubt.' }); return; }
            if (Number(req.headers['content-length']) > MAX_BYTES) { reply(413, { error: 'Maximal 20 MB.' }); return; }
            busy = true;
            try {
                let size = 0;
                const chunks = [];
                for await (const chunk of req) {
                    size += chunk.length;
                    if (size > MAX_BYTES) { reply(413, { error: 'Maximal 20 MB.' }); return; }
                    chunks.push(chunk);
                }
                const bytes = Buffer.concat(chunks);
                if (!bytes.length) { reply(400, { error: 'Leere Datei.' }); return; }
                reply(200, await runner(bytes, kind));
            } catch {
                reply(500, { error: 'Prüfung abgebrochen oder Zeitlimit überschritten. Kein Konformitätsnachweis; Datei und Java-Installation prüfen.' });
            } finally { busy = false; }
            return;
        }
        const asset = req.method === 'GET' && assets.get(req.url);
        if (!asset) { reply(404, { error: 'Nicht gefunden.' }); return; }
        try {
            res.writeHead(200, { 'Content-Type': `${asset[1]}; charset=utf-8`, 'Cache-Control': 'no-store',
                'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
            res.end(await readFile(path.join(root, asset[0])));
        } catch { res.end(); }
    });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const reference = process.argv.includes('--reference') ? await import('./tools/mustang.mjs') : null;
    const ready = reference ? await reference.checkValidator() : false;
    const engine = reference ? `Mustangproject ${reference.VERSION}` : 'Browsermodus ohne Java';
    const server = createServer({ ready, runner: reference?.validate, engine });
    server.requestTimeout = 30000;
    server.listen(8765, '127.0.0.1', () => {
        console.log(`Viewer: http://127.0.0.1:8765 — ${engine}: ${ready ? 'Referenzprüfung bereit' : 'keine Vollprüfung aktiv'}`);
    });
}
