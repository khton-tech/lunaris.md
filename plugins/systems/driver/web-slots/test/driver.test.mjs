import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { definePlugin } from '@lunaris/sdk';
import { createTestKernel } from '@lunaris/test';
import { Logger } from '@lunaris/logging';
import { SlotDriver, normalizeSlot } from '@lunaris/slots';
import { SlotDom } from '@lunaris/slot-dom';
import { createWebSlotDriver } from '@lunaris/web-slot-driver';

async function setup() {
  const dom = new JSDOM('<div id="surface"></div>'); const target = dom.window.document.getElementById('surface');
  const host = createTestKernel(); const logs = [];
  host.installMock(Logger, Object.fromEntries(['log', 'debug', 'info', 'warn', 'error'].map(name => [name, (...args) => { logs.push([name, ...args]); return true; }])));
  const plugin = createWebSlotDriver(target); host.register(plugin);
  for (const name of ['ui.surface', 'ui.dom']) host.grant(plugin.manifest.id, name);
  let driver; let targets; let ctx;
  host.register(definePlugin({ manifest: { manifestVersion: 1, id: 'test.renderer', version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './index.js', provides: [],
    requires: [SlotDriver, SlotDom].map(token => ({ kind: 'api', id: token.id, range: '^1.0.0' })), permissions: ['ui.surface', 'ui.dom'], optionalPermissions: [] }, activate(context) {
    ctx = context; driver = ctx.use(SlotDriver); targets = ctx.use(SlotDom);
  } }));
  for (const name of ['ui.surface', 'ui.dom']) host.grant('test.renderer', name);
  await host.start('test.renderer');
  return { host, target, driver, targets, ctx, logs, async stop() { await host.stopAll(); assert.equal(target.childElementCount, 0); host.assertNoResources(); assert.deepEqual(host.diagnostics(), []); dom.window.close(); } };
}

test('driver creates undecorated resilient targets with matching visual and DOM order', async () => {
  const s = await setup(); const root = s.targets.get('root');
  assert.equal(root.style.display, 'flex'); assert.equal(root.style.minWidth, '0px'); assert.equal(root.style.minHeight, '0px');
  for (const [id, order] of [['test.last', 4], ['test.first', -2], ['test.tie', 4]]) {
    assert.equal(s.driver.create(normalizeSlot({ id, order, grow: 1 }), s.ctx.signal, s.ctx.signal).ok, true);
  }
  assert.deepEqual([...root.children].map(node => node.dataset.lunarisSlot), ['test.first', 'test.last', 'test.tie']);
  assert.equal(root.textContent, ''); assert.equal(root.style.border, ''); assert.equal(root.style.color, '');
  assert.equal(s.targets.get('test.first').style.flexGrow, '1');
  await s.stop();
});

test('owner and registry cancellation remove descendants and detach obsolete owner listeners', async () => {
  const s = await setup(); const owner = new AbortController(); const child = new AbortController(); const registry = new AbortController();
  s.driver.create(normalizeSlot({ id: 'test.parent' }), owner.signal, registry.signal);
  s.driver.create(normalizeSlot({ id: 'test.child', parent: 'test.parent' }), child.signal, registry.signal);
  const old = s.targets.get('test.child'); owner.abort();
  assert.equal(old.isConnected, false); assert.equal(s.targets.get('test.child'), undefined);
  s.driver.create(normalizeSlot({ id: 'test.child' }), s.ctx.signal, registry.signal);
  child.abort(); assert.ok(s.targets.get('test.child'));
  registry.abort(); assert.equal(s.targets.get('test.child'), undefined); assert.ok(s.targets.get('root'));
  await s.stop();
});

test('DOM insertion failure rolls back completely and logs the original error', async () => {
  const s = await setup(); const root = s.targets.get('root');
  const insert = root.insertBefore; const error = Error('Test DOM failure');
  root.insertBefore = () => { throw error; };
  assert.equal(s.driver.create(normalizeSlot({ id: 'test.retry' }), s.ctx.signal, s.ctx.signal).error.code, 'DRIVER_FAILED');
  assert.equal(s.targets.get('test.retry'), undefined); assert.equal(root.childElementCount, 0);
  assert.ok(s.logs.some(([level, , , details]) => level === 'error' && details.error === error));
  root.insertBefore = insert;
  assert.equal(s.driver.create(normalizeSlot({ id: 'test.retry' }), s.ctx.signal, s.ctx.signal).ok, true);
  await s.stop();
});

test('driver rejects invalid allocation, duplicates and missing parents without changing targets', async () => {
  const s = await setup(); const slot = normalizeSlot({ id: 'test.one' });
  assert.equal(s.driver.create(slot, s.ctx.signal, s.ctx.signal).ok, true);
  assert.equal(s.driver.create(slot, s.ctx.signal, s.ctx.signal).error.code, 'ALREADY_EXISTS');
  assert.equal(s.driver.create(normalizeSlot({ id: 'test.two', parent: 'test.absent' }), s.ctx.signal, s.ctx.signal).error.code, 'PARENT_MISSING');
  const stopped = new AbortController(); stopped.abort();
  assert.equal(s.driver.create(normalizeSlot({ id: 'test.two' }), stopped.signal, s.ctx.signal).error.code, 'INVALID_ARGUMENT');
  assert.equal(s.targets.get('root').childElementCount, 1); await s.stop();
});
