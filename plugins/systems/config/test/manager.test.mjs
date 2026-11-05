import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { definePlugin } from '@lunaris/sdk';
import { createTestKernel } from '@lunaris/test';
import { Logger } from '@lunaris/logging';
import { Config, ConfigChanged } from '@lunaris/config';
import { Vault, VaultLocations, PrepareVault } from '@lunaris/vault';
import filesystem from '@lunaris/filesystem-provider';
import vaultManager from '@lunaris/vault-manager';
import configManager from '@lunaris/config-manager';
import { createTauriFilesystemDriver } from '@lunaris/tauri-filesystem';
import { parse } from 'smol-toml';

const ok = value => ({ ok: true, value });
const fail = code => ({ ok: false, error: { code, message: code } });
const version = text => createHash('sha256').update(text).digest('hex');
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
const flush = () => new Promise(resolve => setImmediate(resolve));
const global = { scope: 'global' }; const local = { scope: 'vault' };
const manifest = (id, requires) => ({ manifestVersion: 1, id, version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './index.js', provides: [], requires, permissions: ['config.access', 'vault.access'], optionalPermissions: [] });

async function setup(options = {}) {
  const files = new Map(options.files ?? []); const dirs = new Set(options.dirs ?? []);
  const sessions = new Map(); const selections = []; const calls = []; const logs = []; const changes = [];
  let config; let vaults; let locations; let context; let configRoots = 0; let attachments = 0;
  const host = createTestKernel({ initialGrants: {
    'lunaris.tauri-filesystem': ['filesystem.native'],
    'lunaris.filesystem-provider': ['filesystem.access', 'filesystem.app-config'],
    'lunaris.vault-manager': ['filesystem.access'],
    'lunaris.config-manager': ['filesystem.access', 'filesystem.app-config', 'vault.access'],
    'test.consumer': options.denied ? ['vault.access'] : ['config.access', 'vault.access'],
  } });
  host.installMock(Logger, Object.fromEntries(['log', 'debug', 'info', 'warn', 'error'].map(level => [level, (...args) => { logs.push([level, ...args]); return true; }])));
  host.register(createTauriFilesystemDriver({ async request(session, operation, args) {
    calls.push({ operation, ...args });
    if (operation === 'begin') { sessions.set(session, new Map()); return ok(null); }
    if (operation === 'end') { sessions.delete(session); return ok(null); }
    const roots = sessions.get(session); if (!roots) return fail('VAULT_CLOSED');
    if (operation === 'openConfig') { const id = `global-root-${++configRoots}`; roots.set(id, '@global'); return ok({ id, name: 'Settings' }); }
    if (operation === 'selectLocation') return selections.shift() ?? ok(null);
    if (operation === 'attachLocation') {
      if (options.attachFailure) return fail(options.attachFailure);
      const id = `attached-${++attachments}`; roots.set(id, args.reference); return ok({ id, name: 'Folder' });
    }
    if (operation === 'selectVault') {
      const next = selections.shift(); if (!next) return ok(null);
      roots.set(next.id, next.location); return ok({ id: next.id, name: next.id });
    }
    if (operation === 'closeVault') { roots.delete(args.vaultId); return ok(null); }
    const target = args.target; const location = roots.get(target?.vaultId);
    if (!location) return fail('VAULT_CLOSED');
    const path = `${location}/${target.path}`;
    if (operation === 'createDirectory') {
      if (dirs.has(path) || files.has(path)) return fail('ALREADY_EXISTS');
      dirs.add(path); return ok(null);
    }
    if (operation === 'stat') return dirs.has(path) ? ok({ path: target.path, kind: 'directory', size: 0, modifiedAt: null }) : files.has(path) ? ok({ path: target.path, kind: 'file', size: files.get(path).length, modifiedAt: null }) : fail('NOT_FOUND');
    if (operation === 'readText') {
      await options.beforeRead?.({ path, files, args });
      return files.has(path) ? ok({ text: files.get(path), version: version(files.get(path)) }) : fail('NOT_FOUND');
    }
    if (operation === 'writeText') {
      await options.beforeWrite?.({ path, files, args });
      if (options.writeFailure?.(path, args)) return fail(options.writeFailure(path, args));
      const parent = path.slice(0, path.lastIndexOf('/'));
      if (parent !== location && !dirs.has(parent)) return fail('NOT_DIRECTORY');
      const existing = files.get(path);
      if (args.options.mode === 'create' && existing !== undefined) return fail('ALREADY_EXISTS');
      if (args.options.mode === 'replace' && existing === undefined) return fail('NOT_FOUND');
      if (args.options.expectedVersion !== undefined && (existing === undefined || version(existing) !== args.options.expectedVersion)) return fail('CONFLICT');
      files.set(path, args.text); return ok({ version: version(args.text) });
    }
    return fail('UNSUPPORTED');
  } }));
  host.register(filesystem); host.register(vaultManager); host.register(configManager);
  host.register(definePlugin({ manifest: manifest('test.consumer', [Config, ConfigChanged, Vault, VaultLocations, PrepareVault].map(token => ({ kind: token.kind, id: token.id, range: '^1.0.0' }))), activate(ctx) {
    context = ctx; config = ctx.use(Config); vaults = ctx.use(Vault); locations = ctx.use(VaultLocations);
    ctx.events.on(ConfigChanged, change => { changes.push(change); });
    if (options.prepare) ctx.hooks.register(PrepareVault, preparation => options.prepare(preparation, config));
  } }));
  const result = { host, files, dirs, calls, logs, changes, selections, select: (id, location = id) => selections.push({ id, location }) };
  if (options.autoStart === false || options.denied) return result;
  await host.start('test.consumer');
  return { ...result, get config() { return config; }, get vaults() { return vaults; }, get locations() { return locations; }, get context() { return context; } };
}

test('location selection has no Vault side effects; Next opens once and persists the display name across restarts', async () => {
  const s = await setup({ files: [['notes/existing.md', 'Keep me']] });
  const location = { reference: 'notes', label: 'Folder' };
  s.selections.push(ok(location));
  assert.deepEqual(await s.locations.select(s.context.signal), ok(location));
  assert.equal(s.vaults.current(), null); assert.equal(s.dirs.size, 0);
  assert.equal(s.files.has('notes/.lunaris/config.toml'), false);
  assert.equal((await s.locations.open(location, { name: 'My Notes' })).value.name, 'My Notes');
  assert.equal(s.files.get('notes/existing.md'), 'Keep me');
  assert.equal(parse(s.files.get('notes/.lunaris/config.toml')).plugins['lunaris.vault-manager'].name, 'My Notes');
  assert.equal(s.calls.filter(c => c.operation === 'selectLocation').length, 1);
  assert.equal(s.calls.filter(c => c.operation === 'attachLocation').length, 1);
  const restored = await setup({ files: [...s.files], dirs: [...s.dirs] });
  assert.equal((await restored.locations.open(location)).value.name, 'My Notes');
  await s.host.stopAll(); await restored.host.stopAll(); s.host.assertNoResources(); restored.host.assertNoResources();
});

test('invalid names, inaccessible locations, and metadata save failure preserve the active Vault', async () => {
  const s = await setup({ writeFailure: (path, args) => path === 'bad/.lunaris/config.toml' && args.options.mode === 'replace' ? 'ACCESS_DENIED' : undefined });
  s.select('old'); await s.vaults.open();
  for (const name of ['', '  ', ' padded', 'line\nbreak', 'x'.repeat(201)]) {
    assert.equal((await s.locations.open({ reference: 'bad', label: 'Bad' }, { name })).error.code, 'INVALID_ARGUMENT');
  }
  assert.equal(s.calls.some(c => c.operation === 'attachLocation'), false);
  assert.equal((await s.locations.open({ reference: 'bad', label: 'Bad' }, { name: 'New' })).error.code, 'PREPARATION_FAILED');
  assert.equal(s.vaults.current().id, 'old');
  const missing = await setup({ attachFailure: 'NOT_FOUND' });
  missing.select('old'); await missing.vaults.open();
  assert.equal((await missing.locations.open({ reference: 'gone', label: 'Gone' })).error.code, 'NOT_FOUND');
  assert.equal(missing.vaults.current().id, 'old');
  await s.host.stopAll(); await missing.host.stopAll(); s.host.assertNoResources(); missing.host.assertNoResources();
});

test('startup initializes global config without a Vault/dialog; selecting a Vault creates its working folder and config', async () => {
  const s = await setup();
  assert.ok(s.files.has('@global/config.toml')); assert.equal(s.vaults.current(), null);
  assert.equal(s.calls.filter(call => call.operation === 'selectVault').length, 0);
  assert.deepEqual(await s.config.read('example.plugin'), ok({}));
  s.select('a'); assert.equal((await s.vaults.open()).value.id, 'a');
  assert.ok(s.dirs.has('a/.lunaris')); assert.ok(s.files.has('a/.lunaris/config.toml'));
  assert.ok(s.logs.some(([level, , , details]) => level === 'info' && details?.code === 'CONFIG_READY'));
  await s.host.stopAll(); s.host.assertNoResources(); assert.deepEqual(s.host.diagnostics(), []);
});

test('Vault values override global values by key, recursively merging tables and replacing arrays and falsy values', async () => {
  const s = await setup();
  await s.config.set('example.plugin', 'appearance', { theme: 'dark', font: { size: 14, family: 'Mono' }, tabs: ['a', 'b'] }, global);
  await s.config.set('example.plugin', 'enabled', true, global);
  await s.config.set('example.plugin', 'count', 4, global);
  await s.config.set('example.plugin', 'title', 'Global', global);
  s.select('a'); await s.vaults.open();
  await s.config.set('example.plugin', 'appearance', { font: { size: 16 }, tabs: [] }, local);
  await s.config.set('example.plugin', 'enabled', false, local);
  await s.config.set('example.plugin', 'count', 0, local);
  await s.config.set('example.plugin', 'title', '', local);
  assert.deepEqual((await s.config.read('example.plugin')).value, { appearance: { theme: 'dark', font: { size: 16, family: 'Mono' }, tabs: [] }, enabled: false, count: 0, title: '' });
  assert.equal((await s.config.get('example.plugin', 'enabled', global)).value, true);
  assert.deepEqual((await s.config.get('example.plugin', 'appearance', local)).value, { font: { size: 16 }, tabs: [] });
  await s.host.stopAll(); s.host.assertNoResources();
});

test('own and other plugin namespaces coexist; dotted keys remain literal and persisted TOML uses quoted plugin IDs', async () => {
  const s = await setup();
  assert.equal((await s.config.set(s.context.pluginId, 'font.size', 14, global)).ok, true);
  assert.equal((await s.config.set('other.plugin', 'enabled', true, global)).ok, true);
  const document = parse(s.files.get('@global/config.toml'));
  assert.deepEqual({ ...document.plugins['test.consumer'] }, { 'font.size': 14 });
  assert.deepEqual({ ...document.plugins['other.plugin'] }, { enabled: true });
  assert.equal((await s.config.get('other.plugin', 'missing')).value, undefined);
  await s.host.stopAll(); s.host.assertNoResources();
});

test('removing a local key restores global fallback; absent removals do not write or publish', async () => {
  const s = await setup(); await s.config.set('example.plugin', 'theme', 'dark', global);
  s.select('a'); await s.vaults.open(); await s.config.set('example.plugin', 'theme', 'light', local);
  assert.deepEqual(await s.config.remove('example.plugin', 'theme', local), ok(true));
  assert.equal((await s.config.get('example.plugin', 'theme')).value, 'dark');
  const writes = s.calls.filter(call => call.operation === 'writeText').length; const events = s.changes.length;
  assert.deepEqual(await s.config.remove('example.plugin', 'theme', local), ok(false));
  assert.equal(s.calls.filter(call => call.operation === 'writeText').length, writes); assert.equal(s.changes.length, events);
  await s.config.remove('example.plugin', 'theme', global);
  assert.equal((await s.config.get('example.plugin', 'theme')).value, undefined);
  await s.host.stopAll(); s.host.assertNoResources();
});

test('switching and closing change fallback context; settings persist when the same physical Vault reopens', async () => {
  const s = await setup(); await s.config.set('example.plugin', 'theme', 'global', global);
  s.select('a', 'notes'); await s.vaults.open(); await s.config.set('example.plugin', 'theme', 'local', local);
  s.select('b'); await s.vaults.open(); assert.equal((await s.config.get('example.plugin', 'theme')).value, 'global');
  await s.vaults.close(); assert.equal((await s.config.get('example.plugin', 'theme')).value, 'global');
  assert.equal((await s.config.set('example.plugin', 'key', true, local)).error.code, 'NO_VAULT');
  s.select('reopened', 'notes'); await s.vaults.open(); assert.equal((await s.config.get('example.plugin', 'theme')).value, 'local');
  await s.host.stopAll(); s.host.assertNoResources();
});

test('preparation runs before consumer hooks; explicit candidate IDs allow configuring the new Vault before publication', async () => {
  const s = await setup({ prepare: async (preparation, config) => {
    assert.equal((await config.set('example.plugin', 'ready', true, { scope: 'vault', vaultId: preparation.vault.id })).ok, true);
    return preparation;
  } }); s.select('a'); assert.equal((await s.vaults.open()).ok, true);
  assert.equal((await s.config.get('example.plugin', 'ready')).value, true);
  await s.host.stopAll(); s.host.assertNoResources();
});

test('existing configuration files are validated and never overwritten during selection', async () => {
  const text = '# Keep this comment\n[plugins."example.plugin"]\nvalue = 42\n';
  const s = await setup({ files: [['a/.lunaris/config.toml', text]], dirs: ['a/.lunaris'] });
  s.select('a'); await s.vaults.open(); assert.equal(s.files.get('a/.lunaris/config.toml'), text);
  assert.equal((await s.config.get('example.plugin', 'value')).value, 42);
  await s.host.stopAll(); s.host.assertNoResources();
});

test('external initialization races preserve and validate the winning config file', async () => {
  const text = '[plugins."example.plugin"]\nvalue = "external-winner"';
  const s = await setup({ beforeWrite: ({ path, files, args }) => {
    if (path === 'a/.lunaris/config.toml' && args.options.mode === 'create') files.set(path, text);
  } });
  s.select('a'); assert.equal((await s.vaults.open()).ok, true);
  assert.equal(s.files.get('a/.lunaris/config.toml'), text);
  assert.equal((await s.config.get('example.plugin', 'value')).value, 'external-winner');
  await s.host.stopAll(); s.host.assertNoResources();
});

test('config-manager restart preserves global data and prepares an already-open Vault', async () => {
  const s = await setup(); s.select('a'); await s.vaults.open();
  await s.config.set('example.plugin', 'persistent', true, global);
  await s.host.stop('lunaris.config-manager'); await flush();
  s.files.delete('a/.lunaris/config.toml'); s.dirs.delete('a/.lunaris');
  await s.host.start('test.consumer');
  assert.equal(s.vaults.current().id, 'a'); assert.ok(s.files.has('a/.lunaris/config.toml'));
  assert.equal((await s.config.get('example.plugin', 'persistent')).value, true);
  await s.host.stopAll(); s.host.assertNoResources(); assert.deepEqual(s.host.diagnostics(), []);
});

test('invalid TOML or namespace schema rejects a candidate while preserving the active Vault and original files', async () => {
  for (const text of ['[broken', 'plugins = 1', '[plugins]\n"example.plugin" = true']) {
    const s = await setup({ files: [['bad/.lunaris/config.toml', text]], dirs: ['bad/.lunaris'] });
    s.select('a'); await s.vaults.open(); s.select('bad');
    assert.equal((await s.vaults.open()).error.code, 'PREPARATION_FAILED');
    assert.equal(s.vaults.current().id, 'a'); assert.equal(s.files.get('bad/.lunaris/config.toml'), text);
    await s.host.stopAll(); s.host.assertNoResources();
  }
});

test('a file at .lunaris prevents readiness without being overwritten', async () => {
  const s = await setup({ files: [['a/.lunaris', 'keep me']] }); s.select('a');
  assert.equal((await s.vaults.open()).error.code, 'PREPARATION_FAILED'); assert.equal(s.files.get('a/.lunaris'), 'keep me');
  await s.host.stopAll(); s.host.assertNoResources();
});

test('malformed global TOML fails activation without overwriting it or logging its contents', async () => {
  const secret = 'secret-value-do-not-log'; const text = `[invalid ${secret}`;
  const s = await setup({ files: [['@global/config.toml', text]], autoStart: false });
  await assert.rejects(s.host.start('test.consumer'));
  assert.equal(s.files.get('@global/config.toml'), text);
  assert.ok(!JSON.stringify(s.logs, (key, value) => value instanceof Error ? { name: value.name, message: value.message } : value).includes(secret));
  await s.host.stopAll(); s.host.assertNoResources();
});

test('concurrent writes to different namespaces serialize and preserve both updates', async () => {
  const s = await setup();
  const results = await Promise.all(Array.from({ length: 10 }, (_, index) => s.config.set(`example.plugin-${index}`, 'value', index, global)));
  assert.ok(results.every(result => result.ok));
  const document = parse(s.files.get('@global/config.toml')); assert.equal(Object.keys(document.plugins).length, 10);
  for (let index = 0; index < 10; index++) assert.equal(document.plugins[`example.plugin-${index}`].value, index);
  await s.host.stopAll(); s.host.assertNoResources();
});

test('write conflicts preserve external content and emit no success event; the queue permits later retries', async () => {
  let conflict = false;
  const external = '[plugins."external.plugin"]\nvalue = true\n';
  const s = await setup({ beforeWrite: ({ path, files }) => { if (conflict) { files.set(path, external); conflict = false; } } });
  conflict = true; const events = s.changes.length;
  assert.equal((await s.config.set('example.plugin', 'theme', 'dark', global)).error.code, 'CONFLICT');
  assert.equal(s.files.get('@global/config.toml'), external); assert.equal(s.changes.length, events);
  assert.equal((await s.config.set('example.plugin', 'theme', 'dark', global)).ok, true);
  assert.equal(parse(s.files.get('@global/config.toml')).plugins['external.plugin'].value, true);
  await s.host.stopAll(); s.host.assertNoResources();
});

test('fresh reads observe external edits; corrupt external edits fail without falling back to global values', async () => {
  const s = await setup(); await s.config.set('example.plugin', 'value', 'global', global);
  s.select('a'); await s.vaults.open(); s.files.set('a/.lunaris/config.toml', '[plugins."example.plugin"]\nvalue = "external"');
  assert.equal((await s.config.get('example.plugin', 'value')).value, 'external');
  s.files.set('a/.lunaris/config.toml', '[broken'); assert.equal((await s.config.get('example.plugin', 'value')).error.code, 'INVALID_TOML');
  await s.host.stopAll(); s.host.assertNoResources();
});

test('set snapshots inputs before queuing; read results and Date values never alias persistent state', async () => {
  const s = await setup(); const value = { list: [1], when: new Date('2026-11-05T00:00:00Z') };
  const pending = s.config.set('example.plugin', 'settings', value, global); value.list.push(2); value.when.setUTCFullYear(2030);
  assert.equal((await pending).ok, true);
  const first = (await s.config.get('example.plugin', 'settings')).value;
  assert.deepEqual(first.list, [1]); assert.equal(first.when.getUTCFullYear(), 2026);
  first.list.push(3); first.when.setUTCFullYear(2031);
  const again = (await s.config.get('example.plugin', 'settings')).value;
  assert.deepEqual(again.list, [1]); assert.equal(again.when.getUTCFullYear(), 2026);
  await s.host.stopAll(); s.host.assertNoResources();
});

test('TOML big integers, local dates, multiline strings and unrelated metadata survive writes', async () => {
  const s = await setup({ files: [['@global/config.toml', 'metadata = "keep"\n[plugins."example.plugin"]\nbig = 9223372036854775807\nday = 2026-11-05\ntext = """line one\nline two"""\n']] });
  assert.equal((await s.config.get('example.plugin', 'big')).value, 9223372036854775807n);
  assert.equal((await s.config.get('example.plugin', 'day')).value.toISOString(), '2026-11-05');
  await s.config.set('other.plugin', 'enabled', true, global);
  const persisted = parse(s.files.get('@global/config.toml'), { integersAsBigInt: 'asNeeded' });
  assert.equal(persisted.metadata, 'keep'); assert.equal(persisted.plugins['example.plugin'].big, 9223372036854775807n);
  assert.equal(persisted.plugins['example.plugin'].day.toISOString(), '2026-11-05');
  assert.equal(persisted.plugins['example.plugin'].text, 'line one\nline two');
  await s.host.stopAll(); s.host.assertNoResources();
});

test('invalid values, namespaces, keys and write scopes never modify the file', async () => {
  const s = await setup(); const initial = s.files.get('@global/config.toml');
  const cyclic = {}; cyclic.self = cyclic;
  const getter = Object.defineProperty({}, 'key', { enumerable: true, get() { throw new Error('must not invoke'); } });
  for (const value of [null, undefined, () => {}, Symbol('x'), cyclic, getter, [undefined], Array(1), new Map(), { nested: null }, Number.MAX_SAFE_INTEGER + 1, 2n ** 63n]) {
    assert.equal((await s.config.set('example.plugin', 'value', value, global)).error.code, 'INVALID_VALUE');
  }
  for (const [plugin, key, target] of [['Bad', 'value', global], ['example.plugin', '__proto__', global], ['example.plugin', 'value', undefined], ['example.plugin', 'value', { scope: 'effective' }], ['example.plugin', 'value', { scope: 'global', vaultId: 'a' }]]) {
    assert.equal((await s.config.set(plugin, key, true, target)).error.code, 'INVALID_ARGUMENT');
  }
  assert.equal(s.files.get('@global/config.toml'), initial); assert.equal(s.changes.length, 0);
  await s.host.stopAll(); s.host.assertNoResources(); assert.deepEqual(s.host.diagnostics(), []);
});

test('unsafe TOML keys are rejected and cannot pollute prototypes', async () => {
  const s = await setup();
  s.files.set('@global/config.toml', '[plugins."example.plugin".__proto__]\npolluted = true');
  assert.equal((await s.config.read('example.plugin')).error.code, 'INVALID_TOML');
  assert.equal({}.polluted, undefined);
  await s.host.stopAll(); s.host.assertNoResources();
});

test('switch cannot redirect an accepted config save to the new Vault', async () => {
  const entered = deferred(); const saved = deferred(); let pause = false;
  const s = await setup({ beforeWrite: async ({ path }) => { if (pause && path === 'a/.lunaris/config.toml') { entered.resolve(); await saved.promise; } } });
  s.select('a'); await s.vaults.open(); pause = true;
  const writing = s.config.set('example.plugin', 'value', 'old-vault', local); await entered.promise;
  s.select('b'); const switching = s.vaults.open(); await flush(); assert.equal(s.vaults.current().id, 'a');
  saved.resolve(); assert.equal((await writing).ok, true); assert.equal((await switching).value.id, 'b');
  assert.equal(parse(s.files.get('a/.lunaris/config.toml')).plugins['example.plugin'].value, 'old-vault');
  assert.equal((await s.config.get('example.plugin', 'value')).value, undefined);
  await s.host.stopAll(); s.host.assertNoResources();
});

test('shutdown rejects queued saves, drains the accepted native save and emits no post-stop events', async () => {
  const entered = deferred(); const saved = deferred(); let pause = false;
  const s = await setup({ beforeWrite: async () => { if (pause) { entered.resolve(); await saved.promise; } } }); pause = true;
  const first = s.config.set('example.plugin', 'first', true, global); await entered.promise;
  const queued = s.config.set('example.plugin', 'second', true, global);
  const stopping = s.host.stopAll(); await flush(); saved.resolve();
  assert.equal((await first).error.code, 'STOPPED'); assert.equal((await queued).error.code, 'STOPPED');
  await stopping; await flush();
  assert.equal(parse(s.files.get('@global/config.toml')).plugins['example.plugin'].second, undefined);
  assert.equal(s.changes.length, 0); s.host.assertNoResources(); assert.deepEqual(s.host.diagnostics(), []);
});

test('consumers need config.access and receive events without configuration values', async () => {
  const denied = await setup({ denied: true }); await assert.rejects(denied.host.start('test.consumer'), error => error.code === 'ACTIVATION_FAILED' && error.cause?.code === 'PERMISSION_DENIED');
  await denied.host.stopAll(); denied.host.assertNoResources();
  const s = await setup(); await s.config.set('other.plugin', 'secret', 'do-not-publish', global);
  assert.deepEqual(s.changes, [{ pluginId: 'other.plugin', key: 'secret', scope: 'global', vaultId: null, kind: 'set' }]);
  assert.ok(!JSON.stringify(s.logs).includes('do-not-publish'));
  await s.host.stopAll(); s.host.assertNoResources();
});
