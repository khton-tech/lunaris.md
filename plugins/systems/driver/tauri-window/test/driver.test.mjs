import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestKernel } from '@lunaris/test';
import { definePlugin } from '@lunaris/sdk';
import { Logger } from '@lunaris/logging';
import { Window, WindowChanged } from '@lunaris/window';
import provider from '@lunaris/window-provider';
import { createTauriWindowDriver } from '@lunaris/tauri-window';

async function setup(portOverride) {
  let changed; let api; let context; let decorations = true; let unlistened = false;
  const operations = []; const changes = []; const logs = [];
  const state = { title: 'Lunaris', focused: true, maximized: false,
    capabilities: { title: true, minimize: true, maximize: true, close: true, drag: true, customTitlebar: true } };
  const port = {
    async read() { return { ...state }; }, async listen(fn) { changed = fn; return () => { unlistened = true; }; },
    async isDecorated() { return true; }, async setDecorations(value) { decorations = value; operations.push(['decorations', value]); },
    async setTitle(title) { state.title = title; }, async minimize() { operations.push(['minimize']); },
    async toggleMaximize() { state.maximized = !state.maximized; }, async startDragging() { operations.push(['drag']); },
    async close() { operations.push(['close']); }, ...portOverride,
  };
  const driver = createTauriWindowDriver(portOverride === null ? null : port);
  const kernel = createTestKernel({ initialGrants: { [driver.manifest.id]: ['window.native'], [provider.manifest.id]: ['window.control'], 'test.consumer': ['window.control'] } });
  kernel.installMock(Logger, Object.fromEntries(['log', 'debug', 'info', 'warn', 'error'].map(level => [level, (...args) => { logs.push([level, ...args]); return true; }])));
  const consumer = definePlugin({ manifest: { manifestVersion: 1, id: 'test.consumer', version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './index.js',
    provides: [], requires: [{ kind: 'api', id: Window.id, range: '^1.0.0' }, { kind: 'event', id: WindowChanged.id, range: '^1.0.0' }], permissions: ['window.control'], optionalPermissions: [] },
    activate(ctx) { context = ctx; api = ctx.use(Window); ctx.events.on(WindowChanged, value => { changes.push(value); }); } });
  for (const plugin of [driver, provider, consumer]) kernel.register(plugin);
  await kernel.start(consumer.manifest.id);
  return { api, context, state, changes, logs, operations, get decorations() { return decorations; }, changed: () => changed(),
    async stop() { await kernel.stopAll(); assert.equal(unlistened, portOverride !== null); kernel.assertNoResources(); } };
}

test('public provider delegates native actions and publishes current state without logging titles', async () => {
  const s = await setup();
  try {
    assert.equal((await s.api.setTitle('Secret note — Lunaris')).ok, true);
    assert.equal(s.api.snapshot().title, 'Secret note — Lunaris');
    assert.equal((await s.api.toggleMaximize()).ok, true); assert.equal(s.api.snapshot().maximized, true);
    assert.equal(s.changes.at(-1).maximized, true);
    assert.ok(s.changes.at(-1).sequence > s.changes[0].sequence);
    await s.api.minimize(); await s.api.startDragging(); await s.api.close();
    assert.deepEqual(s.operations, [['minimize'], ['drag'], ['close']]);
    assert.equal(JSON.stringify(s.logs).includes('Secret note'), false);
    assert.equal((await s.api.setTitle('')).error.code, 'INVALID_ARGUMENT');
    assert.equal((await s.api.setTitle('a\nb')).error.code, 'INVALID_ARGUMENT');
  } finally { await s.stop(); }
});

test('exclusive titlebar ownership restores native controls on cancellation and shutdown', async () => {
  const s = await setup(); const owner = s.context.scope.child();
  assert.equal((await s.api.acquireTitlebar(owner.signal)).ok, true); assert.equal(s.decorations, false);
  assert.equal((await s.api.acquireTitlebar(s.context.signal)).error.code, 'BUSY');
  await owner.dispose();
  const next = s.context.scope.child();
  assert.equal((await s.api.acquireTitlebar(next.signal)).ok, true);
  assert.deepEqual(s.operations.slice(0, 3), [['decorations', false], ['decorations', true], ['decorations', false]]);
  await s.stop(); assert.equal(s.decorations, true);
});

test('native resize notifications with unchanged public state do not emit or remount the caption', async () => {
  const s = await setup(); const sequence = s.api.snapshot().sequence;
  s.changed(); s.changed();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(s.api.snapshot().sequence, sequence); assert.equal(s.changes.length, 0);
  s.state.focused = false; s.changed();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(s.changes.length, 1); assert.equal(s.changes[0].focused, false);
  await s.stop();
});

test('cancellation during native chrome change queues restoration after the pending hide', async () => {
  let release; const hidden = new Promise(resolve => { release = resolve; }); const operations = [];
  const s = await setup({ async setDecorations(value) { if (!value) await hidden; operations.push(value); } });
  const owner = s.context.scope.child(); const pending = s.api.acquireTitlebar(owner.signal);
  await owner.dispose(); release();
  assert.equal((await pending).error.code, 'CANCELLED');
  await s.stop(); assert.deepEqual(operations, [false, true]);
});

test('unsupported browser platform keeps native chrome untouched and errors are recoverable', async () => {
  const browser = await setup(null);
  assert.equal(browser.api.snapshot().capabilities.customTitlebar, false);
  assert.equal((await browser.api.acquireTitlebar(browser.context.signal)).error.code, 'UNSUPPORTED');
  assert.equal((await browser.api.close()).error.code, 'UNSUPPORTED'); await browser.stop();
  const original = new Error('Native failure'); const s = await setup({ async minimize() { throw original; } });
  assert.equal((await s.api.minimize()).error.code, 'NATIVE_FAILED');
  assert.equal(s.logs.find(entry => entry[0] === 'error')[3].error, original);
  assert.equal((await s.api.toggleMaximize()).ok, true); await s.stop();
});

test('a window-change listener can await another window operation without blocking the native queue', { timeout: 2000 }, async () => {
  const s = await setup(); const finished = Promise.withResolvers();
  s.context.events.on(WindowChanged, async state => {
    if (state.title === 'Outer') {
      assert.equal((await s.api.setTitle('Inner')).ok, true); finished.resolve();
    }
  });
  await s.api.setTitle('Outer'); await finished.promise;
  assert.equal(s.api.snapshot().title, 'Inner'); await s.stop();
});

test('a rejected chrome hide still restores native controls after concurrent owner cancellation', async () => {
  const pending = Promise.withResolvers(); const operations = []; let fail = true;
  const s = await setup({ async setDecorations(value) {
    operations.push(value);
    if (!value && fail) { await pending.promise; throw new Error('Hide failed'); }
  } });
  const owner = s.context.scope.child(); const acquired = s.api.acquireTitlebar(owner.signal);
  await owner.dispose(); pending.resolve();
  assert.equal((await acquired).error.code, 'NATIVE_FAILED');
  fail = false;
  assert.equal((await s.api.acquireTitlebar(s.context.signal)).ok, true);
  await s.stop(); assert.deepEqual(operations, [false, true, false, true]);
});
