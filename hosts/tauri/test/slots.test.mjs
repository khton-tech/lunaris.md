import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { definePlugin } from '@lunaris/sdk';
import { TestScheduler } from '@lunaris/test';
import { Logger } from '@lunaris/logging';
import { Slots } from '@lunaris/slots';
import { SlotDom } from '@lunaris/slot-dom';
import provider from '@lunaris/slot-provider';
import { HostSession } from '@lunaris/tauri';
import { composeSlotSurface } from '../dist/slots.js';

const manifest = (id, provides = [], requires = [], permissions = []) => ({ manifestVersion: 1, id, version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './index.js', provides, requires, permissions, optionalPermissions: [] });

test('real SDK chain mounts content, recovers after exclusion and never retains targets across retries', async () => {
  const dom = new JSDOM('<div id="surface"></div>'); const surface = dom.window.document.getElementById('surface');
  let slots; let targets; const owner = new AbortController(); let activations = 0;
  const logger = definePlugin({ manifest: manifest('test.logger', [{ kind: 'api', id: Logger.id, version: '1.0.0' }]), activate(ctx) {
    ctx.provide(Logger, Object.fromEntries(['log', 'debug', 'info', 'warn', 'error'].map(name => [name, () => true])));
  } });
  const consumer = definePlugin({ manifest: manifest('test.app', [], [Slots, SlotDom].map(token => ({ kind: 'api', id: token.id, range: '^1.0.0' })), ['ui.dom']), activate(ctx) {
    slots = ctx.use(Slots); targets = ctx.use(SlotDom);
    assert.equal(slots.create({ id: 'test.content', grow: 1 }, owner.signal).ok, true);
    targets.get('test.content').textContent = `Content ${++activations}`;
    assert.equal(targets.get('test.content').isConnected, true, 'show slot content during activation');
  } });
  const session = new HostSession({ scheduler: new TestScheduler(), load: async () => {
    const layout = composeSlotSurface(surface);
    return { ...layout, plugins: [logger, ...layout.plugins, consumer], entrypoints: ['test.app'],
      grants: { ...layout.grants, 'test.app': ['ui.dom'] } };
  } });
  await session.start(); assert.equal(session.snapshot().applicationVisible, true); assert.equal(surface.textContent, 'Content 1');
  const old = targets.get('test.content'); const stale = slots;
  await session.disable(provider.manifest.id);
  assert.equal(session.snapshot().phase, 'fallback'); assert.equal(surface.childElementCount, 0); assert.equal(old.isConnected, false);
  assert.throws(() => stale.get('test.content'));
  await session.enable(provider.manifest.id);
  assert.equal(session.snapshot().phase, 'running'); assert.equal(surface.textContent, 'Content 2');
  owner.abort(); assert.equal(slots.get('test.content'), undefined); assert.equal(targets.get('test.content'), undefined);
  await session.stop(); assert.equal(surface.childElementCount, 0);
  assert.ok(!session.snapshot().incidents.some(item => item.origin === 'cleanup')); dom.window.close();
});

test('a consumer without a DOM grant cannot acquire targets; failed startup leaves no mounted product surface', async () => {
  const dom = new JSDOM('<div id="surface"></div>'); const surface = dom.window.document.getElementById('surface');
  const logger = definePlugin({ manifest: manifest('test.logger', [{ kind: 'api', id: Logger.id, version: '1.0.0' }]), activate(ctx) {
    ctx.provide(Logger, Object.fromEntries(['log', 'debug', 'info', 'warn', 'error'].map(name => [name, () => true])));
  } });
  const consumer = definePlugin({ manifest: manifest('test.denied', [], [{ kind: 'api', id: SlotDom.id, range: '^1.0.0' }], ['ui.dom']), activate(ctx) {
    assert.throws(() => ctx.use(SlotDom), { code: 'PERMISSION_DENIED' });
    throw Error('Expected startup failure');
  } });
  const session = new HostSession({ scheduler: new TestScheduler(), load: async () => {
    const layout = composeSlotSurface(surface);
    return { ...layout, plugins: [logger, ...layout.plugins, consumer], entrypoints: ['test.denied'] };
  } });
  await session.start(); assert.equal(session.snapshot().phase, 'fallback'); assert.equal(surface.childElementCount, 0);
  await session.stop(); dom.window.close();
});
