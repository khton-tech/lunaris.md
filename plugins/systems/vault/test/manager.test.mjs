import test from 'node:test';
import assert from 'node:assert/strict';
import { definePlugin } from '@lunaris/sdk';
import { createTestKernel } from '@lunaris/test';
import { Logger } from '@lunaris/logging';
import { Filesystem, filesystemMethods } from '@lunaris/filesystem';
import { BeforeVaultRelease, Vault, VaultCreation, VaultLocations, VaultChanged, PrepareVault } from '@lunaris/vault';
import filesystem from '@lunaris/filesystem-provider';
import vaultManager from '@lunaris/vault-manager';
import { createTauriFilesystemDriver } from '@lunaris/tauri-filesystem';

const manifest = (id, provides = [], requires = [], permissions = []) => ({ manifestVersion: 1, id, version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './index.js', provides, requires, permissions, optionalPermissions: [] });
const deferred = () => { let resolve; let reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const flush = () => new Promise(resolve => setImmediate(resolve));
const ok = value => ({ ok: true, value });
const failure = (code, message = code) => ({ ok: false, error: { code, message } });

test('release guards run before closing roots and reject close/switch without losing the active Vault', async () => {
  const s = await setup(); s.select('a'); await s.manager.open(); let settled = 0;
  const registration = s.context.hooks.register(BeforeVaultRelease, async value => {
    assert.equal(s.manager.current().id, 'a');
    assert.equal(s.calls.some(call => call[0] === 'closeVault' && call[1] === 'a'), false);
    value.onSettled(() => { settled++; });
    await s.fs.writeText({ vaultId: 'a', path: 'note.md' }, 'draft', { mode: 'replace', expectedVersion: 'v1' });
    return { ...value, error: { code: 'CONFLICT', message: 'Keep current Vault' } };
  });
  assert.equal((await s.manager.close()).error.code, 'CONFLICT'); assert.equal(s.manager.current().id, 'a');
  s.select('b'); assert.equal((await s.manager.open()).error.code, 'CONFLICT');
  assert.equal(s.manager.current().id, 'a'); assert.equal(settled, 2);
  assert.ok(s.calls.some(call => call[0] === 'closeVault' && call[1] === 'b'));
  registration.dispose();
  s.context.hooks.register(BeforeVaultRelease, value => { value.onSettled(() => { settled++; }); throw new Error('Broken guard'); });
  assert.equal((await s.manager.close()).ok, false); assert.equal(s.manager.current().id, 'a'); assert.equal(settled, 3);
  await s.host.stopAll(); s.host.assertNoResources();
});

async function setup(options = {}) {
  const calls = []; const logs = []; const changes = []; const selections = [];
  let manager; let creation; let locations; let fs; let context;
  const host = createTestKernel({ initialGrants: {
    'lunaris.filesystem-provider': ['filesystem.access', 'filesystem.app-config'],
    'lunaris.vault-manager': ['filesystem.access'], 'lunaris.tauri-filesystem': ['filesystem.native'],
    'test.consumer': options.denied ? ['filesystem.access'] : ['vault.access', 'filesystem.access'],
  } });
  host.installMock(Logger, Object.fromEntries(['log', 'debug', 'info', 'warn', 'error'].map(level => [level, (...args) => { logs.push([level, ...args]); return true; }])));
  const methods = Object.fromEntries(filesystemMethods.map(name => [name, async (...args) => { calls.push([name, ...args]); return ok(null); }]));
  methods.capabilities = () => ({ watch: true, atomicReplace: true, versionCheck: 'optimistic', trash: false, maxFileBytes: 1024 });
  methods.selectVault = async () => {
    calls.push(['selectVault']);
    if (!selections.length) return ok(null);
    const next = selections.shift();
    return typeof next === 'function' ? next() : next;
  };
  Object.assign(methods, options.driver);
  host.register(createTauriFilesystemDriver({ async request(session, operation, args) {
    if (['begin', 'end'].includes(operation)) return ok(null);
    if (options.native) { const result = await options.native(operation, args); if (result !== undefined) return result; }
    if (operation === 'selectVault') return methods.selectVault();
    if (operation === 'closeVault') return methods.closeVault(args.vaultId);
    if (operation === 'writeText') return methods.writeText(args.target, args.text, args.options);
    if (operation === 'createDirectory') return methods.createDirectory(args.target, args.recursive);
    return methods[operation](args.target);
  } }));
  host.register(filesystem); host.register(vaultManager);
  host.register(definePlugin({ manifest: manifest('test.consumer', [], [BeforeVaultRelease, Vault, VaultCreation, VaultLocations, VaultChanged, PrepareVault, Filesystem].map(token => ({ kind: token.kind, id: token.id, range: '^1.0.0' })), ['vault.access', 'filesystem.access']), activate(ctx) {
    context = ctx; manager = ctx.use(Vault); creation = ctx.use(VaultCreation); locations = ctx.use(VaultLocations); fs = ctx.use(Filesystem);
    ctx.events.on(VaultChanged, async change => { changes.push(change); await options.onChange?.(change, manager); });
    if (options.prepare) ctx.hooks.register(PrepareVault, value => options.prepare(value, manager, fs));
  } }));
  if (options.denied) return { host };
  await host.start('test.consumer');
  return { host, manager, creation, locations, fs, context, calls, logs, changes, select: (id, name = id) => selections.push(ok({ id, name })), selections };
}

test('startup has no dialog; open/switch/close publish explicit identities after preparation', async () => {
  const prepared = [];
  const s = await setup({ prepare: async value => { prepared.push(value.vault.id); return value; } });
  assert.equal(s.manager.current(), null); assert.equal(s.calls.length, 0);
  assert.ok(s.logs.some(([level, , , details]) => level === 'info' && details?.code === 'VAULT_READY'));
  s.select('a'); assert.equal((await s.manager.open()).value.id, 'a');
  s.select('b'); assert.equal((await s.manager.open()).value.id, 'b');
  assert.equal((await s.manager.close()).ok, true);
  assert.equal((await s.manager.close()).ok, true);
  await flush();
  assert.deepEqual(prepared, ['a', 'b']);
  assert.deepEqual(s.changes.map(({ kind, previous, current }) => [kind, previous?.id, current?.id]), [['opened', undefined, 'a'], ['switched', 'a', 'b'], ['closed', 'b', undefined]]);
  assert.deepEqual(s.calls.filter(([name]) => name === 'closeVault'), [['closeVault', 'a'], ['closeVault', 'b']]);
  assert.equal(s.manager.current(), null);
  await s.host.stopAll(); s.host.assertNoResources(); assert.deepEqual(s.host.diagnostics(), []);
});

test('cancelled/failed selection leaves active Vault unchanged without emitting changes', async () => {
  const s = await setup(); s.select('a'); await s.manager.open();
  assert.deepEqual(await s.manager.open(), ok(null));
  s.selections.push(failure('ACCESS_DENIED')); assert.equal((await s.manager.open()).error.code, 'ACCESS_DENIED');
  assert.equal(s.manager.current().id, 'a'); assert.equal(s.changes.length, 1);
  assert.equal(s.calls.filter(([name]) => name === 'closeVault').length, 0);
  await s.host.stopAll(); s.host.assertNoResources();
});

test('preparation can initialize through Filesystem before publication and rejects changes without losing old Vault', async () => {
  let reject = false;
  const s = await setup({ prepare: async (value, manager, fs) => {
    assert.notEqual(manager.current()?.id, value.vault.id);
    if (reject) return { ...value, error: 'Cannot prepare' };
    assert.equal((await fs.createDirectory({ vaultId: value.vault.id, path: '.lunaris' })).ok, true);
    return value;
  } });
  s.select('a'); await s.manager.open(); reject = true;
  s.select('b'); assert.equal((await s.manager.open()).error.code, 'PREPARATION_FAILED');
  assert.equal(s.manager.current().id, 'a'); assert.equal(s.changes.length, 1);
  assert.deepEqual(s.calls.filter(([name]) => name === 'closeVault'), [['closeVault', 'b']]);
  await s.host.stopAll(); s.host.assertNoResources(); assert.deepEqual(s.host.diagnostics(), []);
});

test('throwing preparation logs original error and disposes only the candidate', async () => {
  const original = new Error('Preparation failed');
  const s = await setup({ prepare: () => { throw original; } }); s.select('a');
  assert.equal((await s.manager.open()).error.code, 'PREPARATION_FAILED');
  assert.equal(s.manager.current(), null);
  assert.ok(s.logs.some(([level, , , details]) => level === 'error' && details?.error === original));
  assert.ok(s.calls.some(([name, id]) => name === 'closeVault' && id === 'a'));
  assert.equal(s.changes.length, 0);
  await s.host.stopAll(); s.host.assertNoResources();
});

test('preparation cannot substitute a different root identity', async () => {
  const s = await setup({ prepare: value => ({ ...value, vault: { id: 'other', name: 'Other' } }) }); s.select('a');
  assert.equal((await s.manager.open()).error.code, 'PREPARATION_FAILED');
  assert.equal(s.manager.current(), null);
  await s.host.stopAll(); s.host.assertNoResources();
});

test('switch waits for pending saves; new operations on the closing root fail and never redirect', async () => {
  const saved = deferred(); const closed = [];
  const s = await setup({ driver: { writeText: async target => { assert.equal(target.vaultId, 'a'); return saved.promise; }, closeVault: async id => { closed.push(id); return ok(null); } } });
  s.select('a'); await s.manager.open();
  const write = s.fs.writeText({ vaultId: 'a', path: 'note.md' }, 'saved', { mode: 'upsert' });
  s.select('b'); const switching = s.manager.open(); await flush();
  assert.equal(s.manager.current().id, 'a'); assert.deepEqual(closed, []);
  assert.equal((await s.fs.readText({ vaultId: 'a', path: 'note.md' })).error.code, 'VAULT_CLOSED');
  assert.equal((await s.manager.close()).error.code, 'BUSY');
  saved.resolve(ok({ version: 'saved' })); await write;
  assert.equal((await switching).value.id, 'b'); assert.deepEqual(closed, ['a']);
  assert.equal((await s.fs.readText({ vaultId: 'a', path: 'note.md' })).error.code, 'VAULT_CLOSED');
  await s.host.stopAll(); s.host.assertNoResources();
});

test('failed old-Vault closure preserves active context and releases the candidate', async () => {
  let fail = true; const released = [];
  const s = await setup({ driver: { closeVault: async id => { released.push(id); return id === 'a' && fail ? failure('IO_ERROR') : ok(null); } } });
  s.select('a'); await s.manager.open(); s.select('b');
  assert.equal((await s.manager.open()).error.code, 'IO_ERROR');
  assert.equal(s.manager.current().id, 'a'); assert.deepEqual(released, ['a', 'b']); assert.equal(s.changes.length, 1);
  assert.equal((await s.manager.close()).error.code, 'IO_ERROR');
  fail = false; assert.equal((await s.manager.close()).ok, true); assert.equal(s.manager.current(), null);
  await s.host.stopAll(); s.host.assertNoResources();
});

test('concurrent and hook-reentrant transitions return BUSY without additional dialogs', async () => {
  const selection = deferred(); let nested;
  const s = await setup({ prepare: async (value, manager) => { nested = await manager.close(); return value; } });
  s.selections.push(() => selection.promise);
  const opening = s.manager.open(); assert.equal((await s.manager.open()).error.code, 'BUSY');
  selection.resolve(ok({ id: 'a', name: 'A' })); await opening;
  assert.equal(nested.error.code, 'BUSY'); assert.equal(s.calls.filter(([name]) => name === 'selectVault').length, 1);
  await s.host.stopAll(); s.host.assertNoResources();
});

test('event listeners may await another transition without holding the manager lock', async () => {
  const s = await setup({ onChange: async (change, manager) => { if (change.kind === 'opened') await manager.close(); } });
  s.select('a'); assert.equal((await s.manager.open()).ok, true); await flush();
  assert.equal(s.manager.current(), null); assert.deepEqual(s.changes.map(change => change.kind), ['opened', 'closed']);
  await s.host.stopAll(); s.host.assertNoResources(); assert.deepEqual(s.host.diagnostics(), []);
});

test('manager shutdown releases roots even while its filesystem provider stays alive', async () => {
  const s = await setup(); s.select('a'); await s.manager.open();
  await s.host.stop('lunaris.vault-manager'); await flush();
  assert.ok(s.calls.some(([name, id]) => name === 'closeVault' && id === 'a'));
  s.host.assertState('lunaris.filesystem-provider', 'active');
  await s.host.stopAll(); s.host.assertNoResources(); assert.deepEqual(s.host.diagnostics(), []);
});

test('late selection after manager shutdown is released without publishing an active Vault', async () => {
  const selected = deferred(); const s = await setup(); s.selections.push(() => selected.promise);
  const opening = s.manager.open(); await s.host.stop('lunaris.vault-manager');
  selected.resolve(ok({ id: 'late', name: 'Late' }));
  assert.equal((await opening).error.code, 'STOPPED'); assert.deepEqual(s.changes, []);
  assert.ok(s.calls.some(([name, id]) => name === 'closeVault' && id === 'late'));
  await s.host.stopAll(); s.host.assertNoResources(); assert.deepEqual(s.host.diagnostics(), []);
});

test('stopping during preparation releases the candidate and never publishes readiness', async () => {
  const preparation = deferred();
  const s = await setup({ prepare: async value => { await preparation.promise; return value; } });
  s.select('a'); const opening = s.manager.open(); await flush();
  await s.host.stop('lunaris.vault-manager'); preparation.resolve();
  assert.equal((await opening).error.code, 'STOPPED'); assert.equal(s.changes.length, 0);
  await flush(); assert.ok(s.calls.some(([name, id]) => name === 'closeVault' && id === 'a'));
  await s.host.stopAll(); s.host.assertNoResources();
});

test('whole-app shutdown drains pending saves through native ownership without SDK cleanup calls', async () => {
  const saved = deferred();
  const s = await setup({ driver: { writeText: () => saved.promise } }); s.select('a'); await s.manager.open();
  const write = s.fs.writeText({ vaultId: 'a', path: 'note.md' }, 'saved', { mode: 'upsert' });
  const stopping = s.host.stopAll(); await flush();
  saved.resolve(ok({ version: 'saved' })); await write; await stopping; await flush();
  s.host.assertNoResources(); assert.deepEqual(s.host.diagnostics(), []);
});

test('Vault access requires an explicit consumer grant', async () => {
  const { host } = await setup({ denied: true });
  await assert.rejects(host.start('test.consumer'), error => error.code === 'ACTIVATION_FAILED' && error.cause?.code === 'PERMISSION_DENIED');
  await host.stopAll(); host.assertNoResources();
});


test('creation attaches and publishes the named child location; selection opens the parent unchanged', async () => {
  const parent = { reference: 'parent', label: 'Parent' }; const child = { reference: 'child', label: 'Parent/Notes' }; const native = []; let exists = false;
  const s = await setup({ prepare: value => ({ ...value, displayName: value.requestedName ?? value.vault.name }), native(operation, args) {
    native.push([operation, args]);
    if (operation === 'createLocation') { if (exists) return failure('ALREADY_EXISTS'); exists = true; return ok(child); }
    if (operation === 'attachLocation') return ok({ id: args.reference, name: args.reference === 'child' ? 'Notes' : 'Parent' });
  } });
  assert.equal((await s.creation.create(parent, '../escape')).error.code, 'INVALID_PATH'); assert.equal(native.length, 0);
  assert.equal((await s.creation.create(parent, 'Notes')).value.id, 'child'); await flush();
  assert.deepEqual(native[0], ['createLocation', { reference: 'parent', name: 'Notes' }]);
  assert.equal(native.find(([op]) => op === 'attachLocation')[1].reference, 'child');
  assert.deepEqual(s.changes[0].location, child);
  assert.equal((await s.creation.create(parent, 'Notes')).error.code, 'ALREADY_EXISTS'); assert.equal(s.manager.current().id, 'child');
  assert.equal((await s.locations.open(parent)).value.id, 'parent'); await flush(); assert.deepEqual(s.changes.at(-1).location, parent);
  await s.host.stopAll(); s.host.assertNoResources(); assert.deepEqual(s.host.diagnostics(), []);
});


test('stopping during child creation never attaches the parent or late child', async () => {
  const pending = deferred(); const native = [];
  const s = await setup({ native(operation, args) { native.push([operation, args]); if (operation === 'createLocation') return pending.promise; } });
  const creating = s.creation.create({ reference: 'parent', label: 'Parent' }, 'Notes'); await flush();
  await s.host.stop('lunaris.vault-manager'); pending.resolve(ok({ reference: 'child', label: 'Parent/Notes' }));
  assert.equal((await creating).error.code, 'STOPPED'); assert.equal(native.some(([op]) => op === 'attachLocation'), false); assert.equal(s.changes.length, 0);
  await s.host.stopAll(); s.host.assertNoResources(); assert.deepEqual(s.host.diagnostics(), []);
});
