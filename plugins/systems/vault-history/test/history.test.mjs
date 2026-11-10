import test from 'node:test';
import assert from 'node:assert/strict';
import { definePlugin } from '@lunaris/sdk';
import { createTestKernel } from '@lunaris/test';
import { Logger } from '@lunaris/logging';
import { Config } from '@lunaris/config';
import { VaultLocations, VaultChanged, VaultHistory, VaultHistoryChanged, PrepareVault } from '@lunaris/vault';
import historyProvider from '@lunaris/vault-history';

const ok = value => ({ ok: true, value });
const fail = code => ({ ok: false, error: { code, message: code } });
const flush = () => new Promise(resolve => setImmediate(resolve));
const entry = reference => ({ name: reference, location: { reference, label: reference } });

async function setup(options = {}) {
  const store = options.store ?? {}; const logs = []; const changes = []; const opened = [];
  let history; let vaultContext;
  const host = createTestKernel({ initialGrants: {
    'lunaris.vault-history': ['config.access', 'vault.access'],
    'test.consumer': options.denied ? [] : ['vault.access'],
  } });
  host.installMock(Logger, Object.fromEntries(['log', 'debug', 'info', 'warn', 'error'].map(level => [level, (...args) => { logs.push([level, ...args]); return true; }])));
  host.installMock(Config, {
    async get(pluginId, key, scope) { assert.equal(scope.scope, 'global'); await options.beforeRead?.(); return options.readFailure ? fail('ACCESS_DENIED') : ok(structuredClone(store[key])); },
    async set(pluginId, key, value, scope) { assert.equal(scope.scope, 'global'); if (options.writeFailure) return fail('CONFLICT'); store[key] = structuredClone(value); return ok(null); },
    async read() { return ok({}); }, async remove() { return ok(false); },
  });
  host.register(definePlugin({ manifest: { manifestVersion: 1, id: 'test.vault', version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './index.js',
    provides: [VaultLocations, VaultChanged, PrepareVault].map(token => ({ kind: token.kind, id: token.id, version: token.version })), requires: [], permissions: [], optionalPermissions: [] },
  activate(ctx) { vaultContext = ctx; ctx.provide(VaultLocations, { async describe(reference) { return options.describeFailure ? fail("NOT_FOUND") : ok({ reference, label: options.fullLabel ?? reference }); }, async select() { return ok(null); }, async open(location) {
    opened.push(location); if (options.openFailure) return fail('NOT_FOUND');
    const vault = { id: `attached-${opened.length}`, name: 'Current metadata' };
    await ctx.events.emit(VaultChanged, { kind: 'opened', previous: null, current: vault, location });
    return ok(vault);
  } }); } }));
  host.register(historyProvider);
  host.register(definePlugin({ manifest: { manifestVersion: 1, id: 'test.consumer', version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './index.js',
    provides: [], requires: [VaultHistory, VaultHistoryChanged].map(token => ({ kind: token.kind, id: token.id, range: '^1.0.0' })), permissions: ['vault.access'], optionalPermissions: [] },
  activate(ctx) { history = ctx.use(VaultHistory); ctx.events.on(VaultHistoryChanged, async change => { changes.push(change); if (options.reentrant) await history.list(); }); } }));
  if (!options.denied) await host.start('test.consumer');
  return { host, store, logs, changes, opened, get history() { return history; }, async publish(value) {
    await vaultContext.events.emit(VaultChanged, { kind: 'opened', previous: null, current: { id: value.name, name: value.name }, location: value.location });
  } };
}

test('recent history persists, deduplicates, limits entries, returns immutable snapshots and restores after restart', async () => {
  const s = await setup({ reentrant: true });
  assert.deepEqual(await s.history.list(), ok([]));
  for (let i = 0; i < 22; i++) await s.publish(entry(`notes-${i}`));
  await s.publish(entry('notes-5'));
  const result = await s.history.list(); await flush();
  assert.equal(result.value.length, 20); assert.equal(result.value[0].location.reference, 'notes-5');
  assert.equal(result.value.filter(e => e.location.reference === 'notes-5').length, 1);
  assert.ok(Object.isFrozen(result.value)); assert.ok(Object.isFrozen(result.value[0].location));
  assert.equal(s.changes.length, 23);
  const restored = await setup({ store: s.store });
  assert.deepEqual(await restored.history.list(), result);
  assert.equal((await restored.history.open('notes-5')).value.name, 'Current metadata');
  assert.deepEqual(restored.opened, [entry('notes-5').location]);
  assert.equal((await restored.history.list()).value[0].name, 'Current metadata');
  await s.host.stopAll(); await restored.host.stopAll(); s.host.assertNoResources(); restored.host.assertNoResources();
  assert.deepEqual(s.host.diagnostics(), []); assert.deepEqual(restored.host.diagnostics(), []);
});

test('missing locations remain in history; unknown references never reach opening', async () => {
  const store = { entries: [entry('gone')] }; const s = await setup({ store, openFailure: true });
  assert.equal((await s.history.open('unknown')).error.code, 'NOT_FOUND'); assert.equal(s.opened.length, 0);
  assert.equal((await s.history.open('gone')).error.code, 'NOT_FOUND');
  assert.deepEqual((await s.history.list()).value, store.entries); assert.equal(s.changes.length, 0);
  await s.host.stopAll(); s.host.assertNoResources();
});

test('malformed/unreadable history is reported without overwriting; failed persistence does not reject Vault events', async () => {
  for (const options of [{ store: { entries: [{ bad: true }] } }, { readFailure: true }, { writeFailure: true }]) {
    const s = await setup(options); const before = structuredClone(s.store);
    await s.publish(entry('notes')); await s.history.list();
    assert.deepEqual(s.store, before); assert.equal(s.changes.length, 0);
    if (!options.writeFailure) assert.equal((await s.history.list()).error.code, 'HISTORY_UNAVAILABLE');
    assert.ok(s.logs.some(([level]) => level === 'warn'));
    await s.host.stopAll(); s.host.assertNoResources(); assert.deepEqual(s.host.diagnostics(), []);
  }
});

test('shutdown during history read does not save or publish late history', async () => {
  let release; const pending = new Promise(resolve => { release = resolve; });
  const s = await setup({ beforeRead: () => pending });
  await s.publish(entry('notes')); await flush();
  await s.host.stopAll(); release(); await flush();
  assert.deepEqual(s.store, {}); assert.deepEqual(s.changes, []);
  s.host.assertNoResources(); assert.deepEqual(s.host.diagnostics(), []);
});

test('history API requires an explicit Vault access grant', async () => {
  const s = await setup({ denied: true });
  await assert.rejects(s.host.start('test.consumer'), error => error.cause?.code === 'PERMISSION_DENIED');
  await s.host.stopAll(); s.host.assertNoResources();
});


test('legacy saved labels refresh without opening and unavailable locations retain their saved label', async () => {
  for (const describeFailure of [false, true]) {
    const store = { entries: [entry('saved')] };
    const s = await setup({ store, fullLabel: 'C:/Users/owner/Documents/Notes', describeFailure });
    const result = await s.history.list();
    assert.equal(result.value[0].location.label, describeFailure ? 'saved' : 'C:/Users/owner/Documents/Notes');
    assert.deepEqual(s.opened, []);
    assert.deepEqual(store.entries, [entry('saved')]);
    await s.host.stopAll(); s.host.assertNoResources();
  }
});
