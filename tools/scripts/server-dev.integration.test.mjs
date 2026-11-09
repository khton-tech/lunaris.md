import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { develop } from './server-dev.mjs';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('development recompiles a shared source, restarts the real API and preserves notes', { timeout: 45000 }, async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'lunaris-dev-integration-'));
  const configFile = path.join(temporary, 'server.json');
  const basename = `__server_dev_probe_${process.pid}`;
  const source = path.join(repository, 'packages/remote/src', `${basename}.ts`);
  const emitted = path.join(repository, 'packages/remote/dist', `${basename}.js`);
  const reports = []; let session;
  async function until(condition, message) {
    const deadline = Date.now() + 12000;
    while (Date.now() < deadline) { if (await condition()) return; await new Promise(resolve => setTimeout(resolve, 50)); }
    assert.fail(message);
  }
  const reservations = [net.createServer(), net.createServer()];
  const ports = [];
  try {
    for (const reservation of reservations) {
      await new Promise((resolve, reject) => { reservation.once('error', reject); reservation.listen(0, '127.0.0.1', resolve); });
      ports.push(reservation.address().port);
    }
  } finally { for (const reservation of reservations) await new Promise(resolve => reservation.close(resolve)); }
  const [apiPort, webPort] = ports;
  const api = `http://127.0.0.1:${apiPort}/api/v1`; const web = `http://127.0.0.1:${webPort}`;
  const input = { metadataDirectory: path.join(temporary, 'metadata'), userDataDirectory: path.join(temporary, 'files'),
    releasesDirectory: path.join(temporary, 'releases'), registration: 'open' };
  let cookie;
  async function post(route, body) {
    const response = await fetch(`${api}/${route}`, { method: 'POST', signal: AbortSignal.timeout(5000),
      headers: { 'content-type': 'application/json', 'x-lunaris-request': '1', origin: web, ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
    const result = await response.json(); assert.equal(response.status, 200); assert.equal(result.ok, true);
    if (response.headers.has('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
    return result.value;
  }
  try {
    fs.writeFileSync(configFile, JSON.stringify(input));
    fs.writeFileSync(source, 'export const serverDevProbe = 1;\n', { flag: 'wx' });
    const serverRoot = path.resolve(process.env.LUNARIS_SERVER_DIRECTORY ?? path.join(repository, '../lunaris-server'));
    session = await develop(serverRoot, configFile, { report: message => reports.push(message), apiPort, webPort });
    await until(() => reports.some(message => message.startsWith('API ready:')), 'Initial compiler/API startup did not finish.');
    assert.equal((await fetch(web)).status, 200);
    const credentials = { login: 'dev_smoke', password: 'development integration password' };
    await post('auth/register', credentials); await post('auth/login', credentials);
    const vault = await post('vaults', { name: 'Dev notes' });
    const route = `vaults/${vault.id}/files`;
    await post(route, { operation: 'writeText', args: { path: 'note.md', text: 'survives rebuild', options: { mode: 'create' } } });
    const readiness = reports.filter(message => message.startsWith('API ready:')).length;
    fs.writeFileSync(source, 'export const = ;\n');
    await until(() => reports.some(message => /error TS\d+/.test(message)), 'Compilation errors were not reported.');
    assert.equal(reports.filter(message => message.startsWith('API ready:')).length, readiness);
    assert.equal((await post(route, { operation: 'readText', args: { path: 'note.md' } })).text, 'survives rebuild');
    fs.writeFileSync(source, 'export const serverDevProbe = 2;\n');
    await until(() => fs.existsSync(emitted) && fs.readFileSync(emitted, 'utf8').includes('= 2'), 'Changed shared TypeScript was not compiled.');
    await until(() => reports.filter(message => message.startsWith('API ready:')).length > readiness, 'API was not restarted after the shared build.');
    assert.equal((await post(route, { operation: 'readText', args: { path: 'note.md' } })).text, 'survives rebuild');
    fs.writeFileSync(configFile, JSON.stringify({ ...input, registration: 'invitation' }));
    await until(async () => {
      try { return (await (await fetch(`${api}/server`)).json()).value?.registration === 'invitation'; } catch { return false; }
    }, 'Saved server policy was not applied automatically.');
    assert.deepEqual(JSON.parse(fs.readFileSync(configFile, 'utf8')), { ...input, registration: 'invitation' });
  } finally {
    await session?.close();
    fs.rmSync(source, { force: true });
    for (const extension of ['js', 'js.map', 'd.ts', 'd.ts.map']) fs.rmSync(path.join(repository, 'packages/remote/dist', `${basename}.${extension}`), { force: true });
    assert.equal(path.dirname(path.resolve(temporary)), path.resolve(os.tmpdir()));
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
