import test from 'node:test';
import assert from 'node:assert/strict';
import { createKernel } from '@lunaris/kernel';
import { definePlugin } from '@lunaris/sdk';
import { TestScheduler } from '@lunaris/test';
import { Logger } from '@lunaris/logging';
import { Vault, VaultChanged } from '@lunaris/vault';
import { ActiveScreen, ActiveScreenChanged } from '@lunaris/active-screen';
import provider from '@lunaris/active-screen-provider';

const manifest = (id, provides = [], requires = []) => ({ manifestVersion: 1, id, version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './index.js',
  provides: provides.map(t => ({ kind: t.kind, id: t.id, version: t.version })), requires: requires.map(t => ({ kind: t.kind, id: t.id, range: `^${t.version}` })), permissions: [], optionalPermissions: [] });
async function setup() {
  let api; let ctx; let vaultContext; let current = { id: 'old', name: 'Old' }; const changes = [];
  const services = definePlugin({ manifest: manifest('test.services', [Logger, Vault, VaultChanged]), activate(context) {
    vaultContext = context;
    context.provide(Vault, { current: () => current, async open() {}, async close() {} });
    context.provide(Logger, Object.fromEntries(['log', 'debug', 'info', 'warn', 'error'].map(level => [level, () => true])));
  } });
  const consumer = definePlugin({ manifest: manifest('test.consumer', [], [ActiveScreen, ActiveScreenChanged]), activate(context) {
    ctx = context; api = context.use(ActiveScreen);
    context.events.on(ActiveScreenChanged, change => { changes.push(change); api.snapshot(); });
  } });
  const kernel = createKernel({ scheduler: new TestScheduler(), initialGrants: { 'lunaris.active-screen-provider': ['vault.access'] } });
  for (const item of [services, provider, consumer]) kernel.register(item);
  await kernel.start('test.consumer');
  return { kernel, get api() { return api; }, get ctx() { return ctx; }, changes,
    switchVault: () => { const previous = current; current = { id: 'new', name: 'New' }; return vaultContext.events.emit(VaultChanged, { kind: 'switched', previous, current }); },
    async stop() { await kernel.stopAll(); assert.deepEqual(kernel.inspect().diagnostics.filter(item => item.code === 'CLEANUP_FAILED'), []); } };
}
const screen = (id, extra = {}) => ({ id, componentId: 'test.content', ...extra });

test('registration is lazy, snapshots are immutable, selection is explicit and owner removal has no arbitrary fallback', async () => {
  const s = await setup(); const owner = s.ctx.scope.child(); const props = { value: 'original' };
  assert.equal(s.api.register(screen('test.one', { props }), owner.signal).ok, true); props.value = 'changed';
  s.api.register(screen('test.two'), s.ctx.signal);
  assert.equal(s.api.snapshot().activeId, null);
  assert.equal(s.api.snapshot().screens[0].props.value, 'original');
  assert.ok(Object.isFrozen(s.api.snapshot().screens));
  s.api.select('test.one'); const before = s.changes.length; s.api.select('test.one'); assert.equal(s.changes.length, before);
  await owner.dispose(); assert.equal(s.api.snapshot().activeId, null);
  s.api.register(screen('test.one'), s.ctx.signal); assert.deepEqual(s.api.snapshot().screens.map(item => item.id), ['test.two', 'test.one']);
  s.api.select('test.two'); await s.switchVault(); assert.equal(s.api.snapshot().activeId, null);
  assert.equal(s.api.snapshot().screens.length, 2); await s.stop();
});

test('invalid input, getters, duplicates and unknown IDs preserve committed state', async () => {
  const s = await setup();
  for (const input of [null, {}, screen('bad'), screen('test.one', { extra: true }), screen('test.one', { props: { workspace: {} } }),
    { ...screen('test.one'), get props() { throw new Error('Getter invoked'); } }, screen('test.one', { props: { get x() { throw new Error('Getter invoked'); } } })]) {
    assert.equal(s.api.register(input, s.ctx.signal).error.code, 'INVALID_ARGUMENT');
  }
  const owner = s.ctx.scope.child(); await owner.dispose(); assert.equal(s.api.register(screen('test.one'), owner.signal).ok, false);
  s.api.register(screen('test.one'), s.ctx.signal); s.api.select('test.one');
  assert.equal(s.api.register(screen('test.one'), s.ctx.signal).error.code, 'ALREADY_REGISTERED');
  assert.equal(s.api.select('test.missing').error.code, 'NOT_FOUND'); assert.equal(s.api.select({}).error.code, 'INVALID_ARGUMENT');
  assert.equal(s.api.update('test.missing', {}).error.code, 'NOT_FOUND');
  assert.equal(s.api.update('test.one', { workspace: {} }).error.code, 'INVALID_ARGUMENT');
  s.api.update('test.one', { label: 'Updated' }); assert.equal(s.api.snapshot().screens[0].props.label, 'Updated');
  assert.equal(s.api.snapshot().activeId, 'test.one'); await s.stop();
});

test('consumer restart releases owned screens and revokes its previous handle', async () => {
  const s = await setup(); s.api.register(screen('test.one'), s.ctx.signal); s.api.select('test.one'); const stale = s.api;
  await s.kernel.stop('test.consumer'); assert.throws(() => stale.snapshot());
  await s.kernel.start('test.consumer'); assert.deepEqual(s.api.snapshot(), { screens: [], activeId: null }); await s.stop();
});
