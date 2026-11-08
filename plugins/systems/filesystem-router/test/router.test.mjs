import test from 'node:test';
import assert from 'node:assert/strict';
import { definePlugin } from '@lunaris/sdk';
import { createTestKernel } from '@lunaris/test';
import { Logger } from '@lunaris/logging';
import { LocalFilesystemBackend, RemoteFilesystemBackend, backendMethods, FilesystemDriver, FilesystemLocationsDriver, ApplicationDirectoryDriver, FilesystemSources, DriverFileChanged } from '@lunaris/filesystem';
import { createFilesystemRouter } from '@lunaris/filesystem-router';

const ok = value => ({ ok: true, value });
const declaration = token => ({ kind: token.kind, id: token.id, range: `^${token.version}` });
async function setup() {
  const host = createTestKernel({ initialGrants: { 'lunaris.filesystem-router': ['filesystem.native', 'filesystem.access', 'filesystem.app-config'],
    'test.local': ['filesystem.native'], 'test.remote': ['filesystem.native'], 'test.consumer': ['filesystem.access', 'filesystem.app-config'] } });
  host.installMock(Logger, Object.fromEntries(['log', 'debug', 'info', 'warn', 'error'].map(name => [name, () => true])));
  const calls = []; const emit = {}; const overrides = {};
  for (const [name, tokens] of [['local', LocalFilesystemBackend], ['remote', RemoteFilesystemBackend]]) {
    host.register(definePlugin({ manifest: { manifestVersion: 1, id: `test.${name}`, version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './index.js',
      provides: [tokens.api, tokens.changed].map(t => ({ kind: t.kind, id: t.id, version: t.version })), requires: [], permissions: ['filesystem.native'], optionalPermissions: [] },
    activate(ctx) {
      const methods = Object.fromEntries(backendMethods.map(method => [method, async (...args) => { calls.push([name, method, ...args]); return ok(null); }]));
      Object.assign(methods, {
        closeVault: async (...args) => overrides.remoteClose && name === 'remote' ? overrides.remoteClose(...args) : ok(null),
        capabilities: () => ({ watch: true, atomicReplace: true, versionCheck: 'optimistic', trash: false, maxFileBytes: name === 'local' ? 100 : 200 }),
        attachLocation: async (...args) => { calls.push([name, 'attachLocation', ...args]); return overrides[name] ? overrides[name](...args) : ok({ id: 'same-native-id', name }); },
        openConfig: async () => ok({ id: 'config', name: 'Config' }),
        readText: async target => { calls.push([name, 'readText', target]); return ok({ text: name, version: 'v' }); },
        watchOwned: async () => ok('same-watch-id'),
      });
      ctx.provide(tokens.api, methods); emit[name] = change => ctx.events.emit(tokens.changed, change);
    } }));
  }
  host.register(createFilesystemRouter([{ id: 'local', ...LocalFilesystemBackend }, { id: 'remote', ...RemoteFilesystemBackend }], 'local'));
  const result = { host, calls, emit, overrides, changes: [] };
  host.register(definePlugin({ manifest: { manifestVersion: 1, id: 'test.consumer', version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './index.js', provides: [],
    requires: [FilesystemDriver, FilesystemSources, FilesystemLocationsDriver, ApplicationDirectoryDriver, DriverFileChanged].map(declaration), permissions: ['filesystem.access', 'filesystem.app-config'], optionalPermissions: [] },
    activate(ctx) { Object.assign(result, { ctx, fs: ctx.use(FilesystemDriver), sources: ctx.use(FilesystemSources), locations: ctx.use(FilesystemLocationsDriver), config: ctx.use(ApplicationDirectoryDriver) }); ctx.events.on(DriverFileChanged, c => result.changes.push(c)); } }));
  await host.start('test.consumer');
  result.attach = async (source, owner = result.ctx.signal) => result.locations.attach(result.sources.location(source, { reference: 'durable', label: source }).value, owner);
  return result;
}
test('attachments route independently despite colliding backend root IDs; config stays local', async () => {
  const s = await setup(); const a = (await s.attach('local')).value; const b = (await s.attach('remote')).value;
  assert.notEqual(a.id, b.id);
  assert.equal((await s.fs.readText({ vaultId: a.id, path: 'note.md' })).value.text, 'local');
  assert.equal((await s.fs.readText({ vaultId: b.id, path: 'note.md' })).value.text, 'remote');
  const config = (await s.config.openConfig(s.ctx.signal)).value;
  assert.equal((await s.fs.readText({ vaultId: config.id, path: 'config.toml' })).value.text, 'local');
  assert.equal(s.fs.capabilities().maxFileBytes, 100); assert.equal(s.sources.capabilitiesFor(b.id).value.maxFileBytes, 200);
  assert.equal((await s.fs.copy({ vaultId: a.id, path: 'a' }, { vaultId: b.id, path: 'b' })).error.code, 'INVALID_PATH');
  await s.fs.closeVault(a.id);
  assert.equal((await s.fs.readText({ vaultId: a.id, path: 'note.md' })).error.code, 'VAULT_CLOSED');
  assert.equal((await s.fs.readText({ vaultId: b.id, path: 'note.md' })).value.text, 'remote');
  await s.host.stopAll(); s.host.assertNoResources(); assert.deepEqual(s.host.diagnostics(), []);
});
test('watch IDs and events are translated per source and suppressed after unwatch', async () => {
  const s = await setup(); const a = (await s.attach('local')).value; const b = (await s.attach('remote')).value;
  const wa = (await s.fs.watch({ vaultId: a.id, path: '' })).value; const wb = (await s.fs.watch({ vaultId: b.id, path: '' })).value;
  assert.notEqual(wa, wb);
  await s.emit.remote({ vaultId: 'same-native-id', watchId: 'same-watch-id', kind: 'modified', paths: ['note.md'] });
  assert.deepEqual(s.changes.map(c => [c.vaultId, c.watchId]), [[b.id, wb]]);
  await s.fs.unwatch(b.id, wb); await s.emit.remote({ vaultId: 'same-native-id', watchId: 'same-watch-id', kind: 'modified', paths: ['note.md'] });
  assert.equal(s.changes.length, 1);
  await s.host.stopAll(); s.host.assertNoResources();
});
test('cancelled late attachments never become routable', async () => {
  const s = await setup(); const owner = s.ctx.scope.child(); let resolve;
  s.overrides.remote = () => new Promise(yes => { resolve = yes; });
  const pending = s.attach('remote', owner.signal); await owner.dispose(); resolve(ok({ id: 'late', name: 'Late' }));
  assert.equal((await pending).error.code, 'CANCELLED');
  assert.equal(s.sources.capabilitiesFor('late').error.code, 'VAULT_CLOSED');
  await s.host.stopAll(); s.host.assertNoResources();
});
test('unknown explicit source never falls back to local', async () => {
  const s = await setup();
  const result = await s.locations.attach({ reference: JSON.stringify(['lunaris-source-v1', 'missing', 'ref']), label: 'fake' }, s.ctx.signal);
  assert.equal(result.error.code, 'NOT_FOUND'); assert.equal(s.calls.length, 0);
  const malformed = await s.locations.attach({ reference: JSON.stringify(['lunaris-source-v1', 'local', 'ref', 'extra']), label: 'fake' }, s.ctx.signal);
  assert.equal(malformed.error.code, 'NOT_FOUND'); assert.equal(s.calls.length, 0);
  await s.host.stopAll(); s.host.assertNoResources();
});
test('router shutdown releases owner listeners even while an attachment is closing', async () => {
  const s = await setup(); const listeners = new Set(); let resolve;
  const owner = { aborted: false, addEventListener(_name, fn) { listeners.add(fn); }, removeEventListener(_name, fn) { listeners.delete(fn); }, throwIfAborted() {} };
  const root = (await s.attach('remote', owner)).value; assert.equal(listeners.size, 1);
  s.overrides.remoteClose = () => new Promise(yes => { resolve = yes; });
  const pending = s.fs.closeVault(root.id); await s.host.stop('lunaris.filesystem-router'); assert.equal(listeners.size, 0);
  resolve(ok(null)); assert.equal((await pending).error.code, 'VAULT_CLOSED'); await s.host.stopAll(); s.host.assertNoResources();
});
