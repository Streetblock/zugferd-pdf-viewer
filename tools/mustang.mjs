// Optional development reference adapter; never imported by the normal viewer.
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const VERSION = '2.26.0';
export const JAR_HASH = '42d7868cb68264874a7b8cab4c3587b03b23ccc7cd72373da917f66758bb9736';
const jar = path.join(root, 'tools', `Mustang-CLI-${VERSION}.jar`);
export const MAX_BYTES = 20 * 1024 * 1024;
const execute = promisify(execFile);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export async function checkValidator() {
    try {
        if (sha256(await readFile(jar)) !== JAR_HASH) throw new Error('Prüfsumme stimmt nicht');
        const { stderr } = await execute('java', ['-version'], { windowsHide: true, timeout: 10000 });
        if (Number(stderr.match(/version "(\d+)/)?.[1] || 0) < 17) return false;
        return true;
    } catch { return false; }
}

export async function validate(bytes, kind) {
    const directory = await mkdtemp(path.join(tmpdir(), 'zugferd-viewer-'));
    try {
        const source = path.join(directory, `invoice.${kind}`);
        await writeFile(source, bytes, { mode: 0o600 });
        const { stdout } = await execute('java', [
            '-Xmx512m', '-Djava.awt.headless=true', '-Dorg.slf4j.simpleLogger.defaultLogLevel=off',
            '--class-path', jar, path.join(root, 'tools', 'Validate.java'), source
        ], { cwd: directory, windowsHide: true, timeout: 90000, maxBuffer: 8 * 1024 * 1024 });
        const result = JSON.parse(stdout);
        if (typeof result.report !== 'string' || !result.report.includes('<validation ')) {
            throw new Error('Kein vollständiger Prüfbericht');
        }
        return { ...result, engine: `Mustangproject ${VERSION}`, jarSha256: JAR_HASH,
            sourceSha256: sha256(bytes), checkedAt: new Date().toISOString() };
    } finally {
        // Only this request's freshly created private temporary directory is removed.
        await rm(directory, { recursive: true, force: true });
    }
}
