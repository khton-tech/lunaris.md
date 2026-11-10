import test from 'node:test';
import assert from 'node:assert/strict';
import { definePlugin } from '@lunaris/sdk';
import { createTestKernel } from '@lunaris/test';
import { Logger } from '@lunaris/logging';
import { BeforeFileMutation, DirectoryLocations, DirectoryLocationsDriver, Filesystem, FilesystemObservation, FilesystemObservationDriver, FilesystemDriver, FilesystemRoots, FilesystemRootsDriver, FilesystemLocationsDriver, ApplicationDirectory, ApplicationDirectoryDriver, DriverFileChanged, FileChanged, filesystemMethods } from '@lunaris/filesystem';
import filesystem from '@lunaris/filesystem-provider';

const manifest = (id, provides = [], requires = [], permissions = []) => ({ manifestVersion: 1, id, version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './index.js', provides, requires, permissions, optionalPermissions: [] });
const requires = [BeforeFileMutation, FilesystemObservation, Filesystem, FilesystemRoots, ApplicationDirectory, FileChanged].map(token => ({ kind: token.kind, id: token.id, range: '^1.0.0' }));

test('mutation guard can flush writes, rejects safely and settles even after a later handler throws', async () => {
  const s = await setup(); const order = []; let reject = false;
  s.consumerContext.hooks.register(BeforeFileMutation, async value => {
    value.onSettled(result => { order.push(result.ok ? 'settled' : 'rejected'); });
    await s.api.writeText(value.source, 'flush', { mode: 'replace', expectedVersion: 'v1' });
    order.push('flushed'); return reject ? { ...value, error: { code: 'CONFLICT', message: 'Unsaved' } } : value;
  });
  const source = { vaultId: 'v', path: 'a.md' }; const destination = { vaultId: 'v', path: 'b.md' };
  assert.equal((await s.api.move(source, destination)).ok, true);
  assert.deepEqual(s.calls.map(call => call[0]), ['writeText', 'move']); assert.deepEqual(order, ['flushed', 'settled']);
  reject = true; assert.equal((await s.api.remove(source)).error.code, 'CONFLICT');
  assert.equal(s.calls.some(call => call[0] === 'remove'), false);
  s.consumerContext.hooks.register(BeforeFileMutation, () => { throw new Error('Guard failed'); });
  assert.equal((await s.api.move(source, destination)).ok, false); assert.equal(order.at(-1), 'rejected');
  await s.host.stopAll(); s.host.assertNoResources();
});

async function setup(implementation = {}, options = {}) {
  const logs = []; const calls = []; const changes = []; let api; let observation; let ownedRoots; let directories; let consumerContext; let driverContext;
  const host = createTestKernel({ initialGrants: { 'lunaris.filesystem-provider': ['filesystem.access', 'filesystem.app-config'], 'test.driver': ['filesystem.native'], 'test.consumer': options.denied ? [] : options.deniedConfig ? ['filesystem.access'] : ['filesystem.access', 'filesystem.app-config'] } });
  host.installMock(ApplicationDirectoryDriver, { openConfig: async () => ({ ok: true, value: { id: 'config-root', name: 'App config' } }) }, { grants: ['filesystem.native'] });
  host.installMock(Logger, Object.fromEntries(['log', 'debug', 'info', 'warn', 'error'].map(level => [level, (...args) => { logs.push([level, ...args]); return true; }])));
  const methods = Object.fromEntries(filesystemMethods.map(name => [name, async (...args) => { calls.push([name, ...args]); return { ok: true, value: null }; }]));
  methods.capabilities = () => ({ watch: true, atomicReplace: true, versionCheck: 'optimistic', trash: false, maxFileBytes: 1024 });
  Object.assign(methods, implementation);
  host.installMock(FilesystemObservationDriver, { watch: (target, owner, recursive) => methods.watch(target, recursive) }, { grants: ['filesystem.native'] });
  host.installMock(DirectoryLocationsDriver, { create: async (parent, name) => ({ ok: true, value: { reference: 'child-' + name, label: parent.label + '/' + name } }) }, { grants: ['filesystem.native'] });
  host.installMock(FilesystemRootsDriver, { selectVault: owner => methods.selectVault(owner) }, { grants: ['filesystem.native'] });
  host.installMock(FilesystemLocationsDriver, { describe: async reference => ({ ok: true, value: { reference, label: reference } }), select: async () => ({ ok: true, value: null }), attach: async () => ({ ok: false, error: { code: 'NOT_FOUND', message: 'Missing location' } }) }, { grants: ['filesystem.native'] });
  host.register(definePlugin({ manifest: manifest('test.driver', [{ kind: 'api', id: FilesystemDriver.id, version: '1.0.0' }, { kind: 'event', id: DriverFileChanged.id, version: '1.0.0' }], [], ['filesystem.native']), activate(ctx) { driverContext = ctx; ctx.provide(FilesystemDriver, methods); } }));
  host.register(filesystem);
  host.register(definePlugin({ manifest: manifest('test.consumer', [], requires, ['filesystem.access', 'filesystem.app-config']), activate(ctx) { consumerContext = ctx; api = ctx.use(Filesystem); observation = ctx.use(FilesystemObservation); ownedRoots = ctx.use(FilesystemRoots); directories = ctx.use(ApplicationDirectory); ctx.events.on(FileChanged, change => { changes.push(change); }); } }));
  if (options.denied || options.deniedConfig) return { host };
  await host.start('test.consumer');
  return { host, api, observation, ownedRoots, directories, consumerContext, calls, logs, changes, emit: change => driverContext.events.emit(DriverFileChanged, change) };
}

test('provider forwards explicit targets, write policy and binary snapshots through SDK', async () => {
  const { host, api, calls, logs } = await setup({ readText: async () => ({ ok: true, value: { text: 'hello', version: 'v1' } }) });
  const target = { vaultId: 'vault-a', path: 'notes/a.md' };
  assert.deepEqual((await api.readText(target)).value, { text: 'hello', version: 'v1' });
  await api.writeText(target, 'saved', { mode: 'replace', expectedVersion: 'v1' });
  assert.deepEqual(calls.at(-1), ['writeText', target, 'saved', { mode: 'replace', expectedVersion: 'v1' }]);
  const bytes = [0, 255]; await api.writeFile(target, bytes, { mode: 'create' });
  assert.deepEqual(calls.at(-1)[2], bytes); assert.notEqual(calls.at(-1)[2], bytes);
  assert.ok(logs.some(([level, , , details]) => level === 'info' && details?.code === 'FILESYSTEM_READY'));
  assert.deepEqual(host.diagnostics(), []);
  await host.stopAll(); host.assertNoResources();
});

test('invalid paths, root mutation, bytes and cross-Vault transfers never reach the driver', async () => {
  const { host, api, calls, logs } = await setup();
  for (const path of ['../outside', '/absolute', 'a/../b', 'NUL', 'C:/outside']) assert.equal((await api.readText({ vaultId: 'v', path })).error.code, 'INVALID_PATH');
  assert.equal((await api.remove({ vaultId: 'v', path: '' }, true)).error.code, 'INVALID_PATH');
  assert.equal((await api.writeFile({ vaultId: 'v', path: 'a' }, [256], { mode: 'create' })).error.code, 'INVALID_ARGUMENT');
  assert.equal((await api.writeText({ vaultId: 'v', path: 'a' }, 'text', { mode: 'create', expectedVersion: 'v1' })).error.code, 'INVALID_ARGUMENT');
  assert.equal((await api.move({ vaultId: 'v1', path: 'a' }, { vaultId: 'v2', path: 'b' })).error.code, 'INVALID_PATH');
  assert.equal(calls.length, 0); assert.ok(logs.some(([level]) => level === 'error'));
  await api.list({ vaultId: 'v', path: '' }); assert.equal(calls.at(-1)[0], 'list');
  await host.stopAll(); host.assertNoResources();
});

test('expected failures remain results, preserve diagnostic context and do not trigger host recovery diagnostics', async () => {
  const failure = { ok: false, error: { code: 'CONFLICT', message: 'File changed' } };
  const { host, api, logs } = await setup({ writeText: async () => failure });
  assert.deepEqual(await api.writeText({ vaultId: 'v', path: 'a.md' }, 'new', { mode: 'replace', expectedVersion: 'old' }), failure);
  assert.ok(logs.some(([level, , , details]) => level === 'error' && details.code === 'CONFLICT' && details.data.path === 'a.md'));
  assert.deepEqual(host.diagnostics(), []);
  await host.stopAll(); host.assertNoResources();
});

test('driver events are forwarded through owned SDK subscriptions', async () => {
  const { host, changes, emit } = await setup();
  const change = { vaultId: 'v', watchId: 'w', kind: 'modified', paths: ['a.md'] };
  await emit(change); assert.deepEqual(changes, [change]);
  await host.stop('lunaris.filesystem-provider');
  await emit(change); assert.equal(changes.length, 1);
  await host.stopAll(); host.assertNoResources();
});

test('consumer filesystem access is denied without the explicit SDK grant', async () => {
  const { host } = await setup({}, { denied: true });
  await assert.rejects(host.start('test.consumer'), error => error.code === 'ACTIVATION_FAILED' && error.cause?.code === 'PERMISSION_DENIED');
  await host.stopAll(); host.assertNoResources();
});

const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };

test('application directory access requires its own explicit SDK grant', async () => {
  const { host } = await setup({}, { deniedConfig: true });
  await assert.rejects(host.start('test.consumer'), error => error.code === 'ACTIVATION_FAILED' && error.cause?.code === 'PERMISSION_DENIED');
  await host.stopAll(); host.assertNoResources();
});
const flush = () => new Promise(resolve => setImmediate(resolve));

test('closing blocks new operations and waits for all accepted operations before releasing a root', async () => {
  const saved = deferred();
  const { host, api, calls } = await setup({ writeText: () => saved.promise });
  const target = { vaultId: 'v', path: 'note.md' };
  const write = api.writeText(target, 'saved', { mode: 'upsert' });
  const close = api.closeVault('v');
  assert.equal((await api.readText(target)).error.code, 'VAULT_CLOSED');
  await flush(); assert.ok(!calls.some(([name]) => name === 'closeVault'));
  saved.resolve({ ok: true, value: { version: 'saved' } });
  assert.equal((await write).value.version, 'saved');
  assert.equal((await close).ok, true);
  assert.equal(calls.filter(([name]) => name === 'closeVault').length, 1);
  assert.equal((await api.stat(target)).error.code, 'VAULT_CLOSED');
  await host.stopAll(); host.assertNoResources();
});

test('a failed close permits retry and operations against the still-open root', async () => {
  let tries = 0;
  const { host, api } = await setup({ closeVault: async () => ++tries === 1 ? { ok: false, error: { code: 'IO_ERROR', message: 'Busy' } } : { ok: true, value: null } });
  assert.equal((await api.closeVault('v')).error.code, 'IO_ERROR');
  assert.equal((await api.stat({ vaultId: 'v', path: '' })).ok, true);
  assert.equal((await api.closeVault('v')).ok, true);
  await host.stopAll(); host.assertNoResources();
});

test('provider forwards owned-root acquisition and leaves native lifetime ownership to the driver', async () => {
  const { host, directories, ownedRoots, consumerContext, api, calls } = await setup({ selectVault: async () => ({ ok: true, value: { id: 'selected', name: 'Notes' } }) });
  assert.equal((await directories.openConfig(consumerContext.signal)).value.id, 'config-root');
  assert.equal((await ownedRoots.selectVault(consumerContext.signal)).value.id, 'selected');
  await api.closeVault('selected');
  assert.deepEqual(calls.filter(([name]) => name === 'closeVault'), [['closeVault', 'selected']]);
  await host.stop('test.consumer'); await flush();
  // The consumer's handles are closed independently of the provider's native lifetime.
  assert.throws(() => api.list({ vaultId: 'selected', path: '' }), error => error.code === 'SCOPE_CLOSED');
  await host.stopAll(); host.assertNoResources(); assert.deepEqual(host.diagnostics(), []);
});

test('provider passes the owner signal through the root driver', async () => {
  const selection = deferred();
  let passed;
  const { host, ownedRoots, consumerContext } = await setup({ selectVault: owner => { passed = owner; return selection.promise; } });
  const pending = ownedRoots.selectVault(consumerContext.signal);
  assert.equal(passed, consumerContext.signal);
  selection.resolve({ ok: true, value: { id: 'late', name: 'Late' } });
  assert.equal((await pending).value.id, 'late');
  await host.stopAll(); host.assertNoResources(); assert.deepEqual(host.diagnostics(), []);
});


test('owned watches cancel before/during/after creation and suppress retired events', async () => {
  const pending = deferred(); let started = 0;
  const { host, observation, api, consumerContext, calls, changes, emit } = await setup({ watch: () => { started++; return pending.promise; } });
  const aborted = new AbortController(); aborted.abort();
  assert.equal((await observation.watch({ vaultId: 'v', path: '' }, aborted.signal)).error.code, 'CANCELLED');
  assert.equal(started, 0);
  const owner = new AbortController();
  const result = observation.watch({ vaultId: 'v', path: '' }, owner.signal); owner.abort();
  pending.resolve({ ok: true, value: 'w' });
  assert.equal((await result).error.code, 'CANCELLED');
  assert.equal(calls.filter(call => call[0] === 'unwatch').length, 1);
  await emit({ vaultId: 'v', watchId: 'w', kind: 'modified', paths: ['a.md'] });
  assert.equal(changes.length, 0);
  await api.unwatch('v', 'w');
  assert.equal(calls.filter(call => call[0] === 'unwatch').length, 1);
  await host.stopAll(); host.assertNoResources();
});

test('consumer shutdown releases owned watches through the live provider', async () => {
  const { host, observation, consumerContext, calls } = await setup({ watch: async () => ({ ok: true, value: 'owned' }) });
  assert.equal((await observation.watch({ vaultId: 'v', path: '' }, consumerContext.signal)).value, 'owned');
  await host.stop('test.consumer'); await flush();
  assert.equal(calls.filter(call => call[0] === 'unwatch').length, 1);
  assert.deepEqual(host.diagnostics(), []);
  await host.stopAll(); host.assertNoResources();
});

test('explicit unwatch and Vault close detach observation ownership idempotently', async () => {
  let id = 0;
  const { host, observation, api, calls } = await setup({ watch: async () => ({ ok: true, value: String(++id) }) });
  const first = new AbortController(); const second = new AbortController();
  await observation.watch({ vaultId: 'v', path: '' }, first.signal);
  await api.unwatch('v', '1'); first.abort(); await flush();
  assert.equal(calls.filter(call => call[0] === 'unwatch').length, 1);
  await observation.watch({ vaultId: 'v', path: '' }, second.signal);
  await api.closeVault('v'); second.abort(); await flush();
  assert.equal(calls.filter(call => call[0] === 'unwatch').length, 1);
  await host.stopAll(); host.assertNoResources();
});

test('failed watch release retries and concurrent releases share disposal', async () => {
 const { createObservation } = await import('../dist/src/observation.js');
 let calls=0; const pending=Promise.withResolvers(); const signal=new AbortController().signal;
 const observation=createObservation({signal,scope:{own(){}}},async()=>({ok:true,value:'watch'}),async()=>{calls++; return calls===1?{ok:false,error:{code:'IO_ERROR',message:'Transient'}}:pending.promise;},()=>{});
 assert.equal((await observation.unwatch('vault','watch')).ok,false);
 assert.equal(observation.accepts('vault','watch'),false);
 const a=observation.unwatch('vault','watch'),b=observation.unwatch('vault','watch');
 await Promise.resolve(); assert.equal(calls,2); pending.resolve({ok:true,value:null});
 assert.equal((await a).ok,true); assert.equal((await b).ok,true);
 assert.equal((await observation.unwatch('vault','watch')).ok,true); assert.equal(calls,2);
});

