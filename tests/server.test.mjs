import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../server.mjs';

test('Normal viewer serves files with reference validation disabled', async t => {
    const server = createServer();
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => server.close());
    const url = `http://127.0.0.1:${server.address().port}`;
    const health = await (await fetch(url + '/api/health')).json();
    assert.equal(health.available, false);
    assert.equal((await fetch(url + '/')).status, 200);
    assert.equal((await fetch(url + '/api/validate', { method: 'POST', headers: {
        'Content-Type': 'application/xml', 'X-Viewer-Request': 'validate'
    }, body: '<x/>' })).status, 503);
});

test('Server restricts origin, content type and exposed files; validates exact bytes', async t => {
    const server = createServer({ ready: true, runner: async (bytes, kind) => ({ size: bytes.length, kind }) });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => server.close());
    const url = `http://127.0.0.1:${server.address().port}`;
    assert.equal((await fetch(url + '/api/health')).status, 200);
    assert.equal((await fetch(url + '/tools/Validate.java')).status, 404);
    assert.equal((await fetch(url + '/api/health', { headers: { Origin: 'https://example.com' } })).status, 403);
    assert.equal((await fetch(url + '/api/validate', { method: 'POST', body: 'abc' })).status, 403);
    const headers = { 'X-Viewer-Request': 'validate', 'Content-Type': 'application/xml' };
    const response = await fetch(url + '/api/validate', { method: 'POST', headers, body: '<x/>' });
    assert.deepEqual(await response.json(), { size: 4, kind: 'xml' });
    assert.equal((await fetch(url + '/api/validate', { method: 'POST', headers, body: '' })).status, 400);
});
