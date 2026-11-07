import test from 'node:test';
import assert from 'node:assert/strict';
import { defineApi, definePlugin } from '@lunaris/sdk';
import { TestScheduler } from '@lunaris/test';
import { HostSession } from '@lunaris/tauri';

const plugin = (id, activate = () => {}, extra = {}) => definePlugin({
  manifest: { manifestVersion: 1, id, version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0',
    entry: './plugin.js', provides: [], requires: [], permissions: [], optionalPermissions: [], ...extra }, activate,
});
const setup = (definition, extra = {}) => {
  const scheduler = new TestScheduler();
  return { scheduler, session: new HostSession({ scheduler, load: async () => definition, ...extra }) };
};

test('normal window close waits for the product save gate before aborting live plugin scopes', async () => {
  let allowed = false; let signal; let disposed = false;
  const service = plugin('test.close-gate', ctx => { signal = ctx.signal; return { dispose() { disposed = true; } }; });
  const { session } = setup({ plugins: [service], entrypoints: [service.manifest.id], async beforeClose() {
    assert.equal(signal.aborted, false); assert.equal(disposed, false); return allowed;
  } });
  await session.start(); assert.equal(await session.requestClose(), false);
  assert.equal(session.snapshot().phase, 'running'); assert.equal(signal.aborted, false);
  allowed = true; assert.equal(await session.requestClose(), true);
  assert.equal(session.snapshot().phase, 'stopped'); assert.equal(disposed, true);
});

test('empty host is useful without reference plugins or a product UI', async () => {
  const { session, scheduler } = setup({ plugins: [], entrypoints: [] });
  await session.start();
  assert.equal(session.snapshot().phase, 'running');
  assert.equal(session.snapshot().applicationVisible, false);
  assert.equal(scheduler.pending, 0);
  await session.stop();
  assert.equal(session.snapshot().phase, 'stopped');
});

test('activation failure shows fallback and cleans already-started dependencies', async () => {
  const api = defineApi({ id: 'test.service', version: '1.0.0' }); let resources = 0;
  const provider = plugin('test.provider', ctx => {
    resources++; ctx.scope.own({ dispose() { resources--; } }); ctx.provide(api, {});
  }, { provides: [{ kind: 'api', id: api.id, version: api.version }] });
  const consumer = plugin('test.consumer', () => { throw new Error('private failure'); }, {
    requires: [{ kind: 'api', id: api.id, range: '^1.0.0' }],
  });
  const { session, scheduler } = setup({ plugins: [provider, consumer], entrypoints: ['test.consumer'] });
  await session.start();
  assert.equal(session.snapshot().phase, 'fallback'); assert.equal(resources, 0);
  assert.ok(session.snapshot().kernel.diagnostics.some(item => item.code === 'ACTIVATION_FAILED'));
  assert.equal(session.snapshot().incidents[0].pluginId, 'test.consumer');
  assert.ok(!JSON.stringify(session.snapshot()).includes('private failure'));
  assert.equal(scheduler.pending, 0);
});

test('guarded module-load failure still leaves a usable fallback and allows retry', async () => {
  let attempts = 0;
  const { session } = setup(null, { load: async () => {
    if (++attempts === 1) throw new Error('module failed');
    return { plugins: [], entrypoints: [] };
  } });
  await session.start(); assert.equal(session.snapshot().phase, 'fallback');
  assert.equal(session.snapshot().incidents[0].code, 'APPLICATION_LOAD_FAILED');
  await session.start(); assert.equal(session.snapshot().phase, 'running');
  assert.equal(session.snapshot().incidents.length, 1); await session.stop();
});

test('disable excludes providers from the new registry so required dependencies cannot restart them', async () => {
  const api = defineApi({ id: 'test.service', version: '1.0.0' }); let starts = 0;
  const provider = plugin('test.provider', ctx => { starts++; ctx.provide(api, {}); }, {
    provides: [{ kind: 'api', id: api.id, version: api.version }],
  });
  const consumer = plugin('test.consumer', () => {}, { requires: [{ kind: 'api', id: api.id, range: '^1.0.0' }] });
  const { session } = setup({ plugins: [provider, consumer], entrypoints: ['test.consumer'] });
  await session.start(); await session.disable('test.provider');
  assert.equal(starts, 1); assert.equal(session.snapshot().phase, 'fallback');
  assert.ok(!session.snapshot().kernel.plugins.some(item => item.manifest.id === 'test.provider'));
  assert.deepEqual(session.snapshot().disabled, ['test.provider']);
  await session.enable('test.provider'); assert.equal(starts, 2);
  assert.equal(session.snapshot().phase, 'running'); await session.stop();
});

test('disabled entrypoint stays in system view and never mounts the product UI', async () => {
  let mounts = 0;
  const { session } = setup({ plugins: [plugin('test.app')], entrypoints: ['test.app'],
    view: { mount() { mounts++; return { dispose() {} }; } } });
  await session.start(); await session.disable('test.app');
  assert.equal(mounts, 1); assert.equal(session.snapshot().phase, 'fallback');
  assert.equal(session.snapshot().applicationVisible, false); await session.stop();
});

test('excluding a broken optional provider allows the application to recover', async () => {
  const api = defineApi({ id: 'test.optional', version: '1.0.0' }); let optional;
  const provider = plugin('test.optional-provider', () => { throw new Error('broken provider'); }, {
    provides: [{ kind: 'api', id: api.id, version: api.version }],
  });
  const root = plugin('test.app', ctx => { optional = ctx.optional(api); }, {
    requires: [{ kind: 'api', id: api.id, range: '^1.0.0', optional: true }],
  });
  const { session } = setup({ plugins: [provider, root], entrypoints: ['test.app'] });
  await session.start(); assert.equal(session.snapshot().phase, 'fallback');
  await session.disable('test.optional-provider');
  assert.equal(session.snapshot().phase, 'running'); assert.equal(optional, undefined);
  assert.equal(session.snapshot().kernel.plugins[0].state, 'active'); await session.stop();
});

test('runtime SDK failures return to the fallback and release the mounted view', async () => {
  const api = defineApi({ id: 'test.service', version: '1.0.0' }); let handle; let disposed = 0;
  const provider = plugin('test.provider', ctx => ctx.provide(api, { fail() { throw new Error('failed'); } }), {
    provides: [{ kind: 'api', id: api.id, version: api.version }],
  });
  const consumer = plugin('test.consumer', ctx => { handle = ctx.use(api); }, {
    requires: [{ kind: 'api', id: api.id, range: '^1.0.0' }],
  });
  const { session } = setup({ plugins: [provider, consumer], entrypoints: ['test.consumer'],
    view: { mount() { return { dispose() { disposed++; } }; } } });
  await session.start(); assert.equal(session.snapshot().applicationVisible, true);
  assert.throws(() => handle.fail());
  const settled = Promise.withResolvers();
  session.subscribe(snapshot => { if (snapshot.phase === 'fallback' && !snapshot.busy && disposed) settled.resolve(); });
  session.refresh(); await settled.promise;
  assert.equal(disposed, 1); assert.equal(session.snapshot().applicationVisible, false);
  assert.equal(session.snapshot().incidents.at(-1).code, 'API_CALL_FAILED'); await session.stop();
});

test('normal permission denial is not treated as an application crash', async () => {
  let context;
  const { session } = setup({ plugins: [plugin('test.app', ctx => { context = ctx; })], entrypoints: ['test.app'] });
  await session.start(); assert.throws(() => context.permissions.has('test.undeclared'));
  session.refresh(); assert.equal(session.snapshot().phase, 'running'); await session.stop();
});

test('global error reports hide the application immediately and preserve bounded incidents', async () => {
  const { session } = setup({ plugins: [], entrypoints: [], view: { mount() { return { dispose() {} }; } } });
  for (let index = 0; index < 24; index++) {
    await session.start(); const stopping = session.reportFault();
    assert.equal(session.snapshot().applicationVisible, false); await stopping;
  }
  assert.equal(session.snapshot().incidents.length, 20); await session.stop();
});

test('mount failures stop plugins and remain recoverable', async () => {
  let resources = 0;
  const { session } = setup({ plugins: [plugin('test.app', () => {
    resources++; return { dispose() { resources--; } };
  })], entrypoints: ['test.app'], view: { mount() { throw new Error('render failed'); } } });
  await session.start(); assert.equal(resources, 0);
  assert.equal(session.snapshot().phase, 'fallback');
  assert.equal(session.snapshot().incidents[0].origin, 'view'); await session.stop();
});

test('renderer timeout aborts and disposes a late mount without making it visible', async () => {
  const entered = Promise.withResolvers(); const finish = Promise.withResolvers(); const cleaned = Promise.withResolvers();
  let signal;
  const { session, scheduler } = setup({ plugins: [], entrypoints: [], view: {
    mount(abort) { signal = abort; entered.resolve(); return finish.promise; },
  } }, { viewTimeoutMs: 10 });
  const startup = session.start(); await entered.promise;
  scheduler.advanceBy(10); await startup;
  assert.ok(signal.aborted); assert.equal(session.snapshot().phase, 'fallback');
  finish.resolve({ dispose() { cleaned.resolve(); } }); await cleaned.promise;
  assert.equal(session.snapshot().applicationVisible, false); assert.equal(scheduler.pending, 0); await session.stop();
});

test('load timeout aborts an unfinished composition without running its late plugins', async () => {
  const entered = Promise.withResolvers(); const finish = Promise.withResolvers(); let signal; let starts = 0;
  const { session, scheduler } = setup(null, { viewTimeoutMs: 10, load: abort => {
    signal = abort; entered.resolve(); return finish.promise;
  } });
  const startup = session.start(); await entered.promise; scheduler.advanceBy(10); await startup;
  finish.resolve({ plugins: [plugin('test.late', () => { starts++; })], entrypoints: ['test.late'] });
  await session.stop(); assert.equal(starts, 0); assert.ok(signal.aborted); assert.equal(scheduler.pending, 0);
});

test('fault between mount resolution and adoption still disposes the unadopted renderer', async () => {
  const faultDone = Promise.withResolvers(); let disposed = 0;
  const { session } = setup({ plugins: [], entrypoints: [], view: { mount() {
    return { then(resolve) {
      resolve({ dispose() { disposed++; } });
      queueMicrotask(() => { void session.reportFault('view').then(faultDone.resolve); });
    } };
  } } });
  await session.start(); await faultDone.promise;
  assert.equal(disposed, 1); assert.equal(session.snapshot().applicationVisible, false); await session.stop();
});

test('stop submitted before queued start executes prevents reactivation', async () => {
  let loads = 0;
  const { session } = setup(null, { load: async () => { loads++; return { plugins: [], entrypoints: [] }; } });
  const starting = session.start(); const stopping = session.stop();
  await Promise.all([starting, stopping]); assert.equal(loads, 0); assert.equal(session.snapshot().phase, 'stopped');
});

test('stop during load prevents stale completion from entering running state', async () => {
  const entered = Promise.withResolvers(); const finish = Promise.withResolvers(); let mounts = 0;
  const { session } = setup(null, { load: () => { entered.resolve(); return finish.promise; } });
  const startup = session.start(); await entered.promise; const stopping = session.stop();
  finish.resolve({ plugins: [], entrypoints: [], view: { mount() { mounts++; return { dispose() {} }; } } });
  await Promise.all([startup, stopping]); assert.equal(mounts, 0); assert.equal(session.snapshot().phase, 'stopped');
});

test('view cleanup failure still stops kernel resources and is recorded', async () => {
  let resources = 0; let mounts = 0;
  const { session } = setup({ plugins: [plugin('test.app', () => {
    resources++; return { dispose() { resources--; } };
  })], entrypoints: ['test.app'], view: { mount() { mounts++; return { dispose() { throw new Error('cleanup'); } }; } } });
  await session.start(); await session.reportFault();
  assert.equal(resources, 0); assert.ok(session.snapshot().incidents.some(item => item.code === 'VIEW_CLEANUP_FAILED'));
  assert.equal(session.snapshot().recoveryBlocked, true);
  await session.start(); assert.equal(mounts, 1); assert.equal(session.snapshot().phase, 'fallback');
  await session.stop();
});

test('a renderer without a cleanup contract cannot claim application readiness', async () => {
  const { session } = setup({ plugins: [], entrypoints: [], view: { mount() {} } });
  await session.start(); assert.equal(session.snapshot().phase, 'fallback');
  assert.equal(session.snapshot().applicationVisible, false); await session.stop();
});

test('hanging view cleanup reaches a host deadline and still stops plugin resources', async () => {
  const entered = Promise.withResolvers(); const finish = Promise.withResolvers(); let resources = 0;
  const { session, scheduler } = setup({
    plugins: [plugin('test.app', () => { resources++; return { dispose() { resources--; } }; })], entrypoints: ['test.app'],
    view: { mount() { return { dispose() { entered.resolve(); return finish.promise; } }; } },
  }, { viewTimeoutMs: 10 });
  await session.start(); const fault = session.reportFault(); await entered.promise;
  scheduler.advanceBy(10); await fault;
  assert.equal(resources, 0); assert.equal(session.snapshot().recoveryBlocked, true);
  finish.resolve(); await session.stop(); assert.equal(scheduler.pending, 0);
});

test('snapshots are immutable and do not expose kernel management', async () => {
  const { session } = setup({ plugins: [], entrypoints: [] }); await session.start();
  assert.throws(() => session.snapshot().disabled.push('test.app'));
  assert.equal(session.snapshot().kernel.register, undefined); await session.stop();
});
