import test from 'node:test';
import assert from 'node:assert/strict';
import { createKernel } from '@lunaris/kernel';
import { definePlugin } from '@lunaris/sdk';
import { TestScheduler } from '@lunaris/test';
import { Logger } from '@lunaris/logging';
import { Sidebar, SidebarChanged } from '@lunaris/sidebar';
import provider from '@lunaris/sidebar-provider';

const manifest = (id, provides = [], requires = []) => ({ manifestVersion: 1, id, version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './index.js',
  provides: provides.map(t => ({ kind: t.kind, id: t.id, version: t.version })), requires: requires.map(t => ({ kind: t.kind, id: t.id, range: `^${t.version}` })), permissions: [], optionalPermissions: [] });
async function setup() {
  let api; let ctx; const changes = [];
  const logger = definePlugin({ manifest: manifest('test.logger', [Logger]), activate(context) {
    context.provide(Logger, Object.fromEntries(['log', 'debug', 'info', 'warn', 'error'].map(level => [level, () => true])));
  } });
  const consumer = definePlugin({ manifest: manifest('test.consumer', [], [Sidebar, SidebarChanged]), activate(context) {
    ctx = context; api = context.use(Sidebar); context.events.on(SidebarChanged, change => { changes.push(change); });
  } });
  const kernel = createKernel({ scheduler: new TestScheduler() });
  for (const item of [logger, provider, consumer]) kernel.register(item);
  await kernel.start('test.consumer');
  return { kernel, get api() { return api; }, get ctx() { return ctx; }, changes, async stop() {
    await kernel.stopAll(); assert.deepEqual(kernel.inspect().diagnostics.filter(item => item.code === 'CLEANUP_FAILED'), []);
  } };
}
const tab = (id, extra = {}) => ({ id, componentId: 'test.content', title: id, icon: 'files', ...extra });
test('sidebar owns ordered immutable tabs, selection, collapse and deterministic removal fallback', async () => {
  const s = await setup(); const one = s.ctx.scope.child(); const two = s.ctx.scope.child(); const props = { filter: 'initial' };
  assert.equal(s.api.register(tab('test.one', { order: 20, props }), one.signal).ok, true); props.filter = 'changed';
  s.api.register(tab('test.two', { order: -1 }), two.signal);
  assert.deepEqual(s.api.snapshot().tabs.map(t => t.id), ['test.two', 'test.one']); assert.equal(s.api.snapshot().activeId, 'test.one');
  assert.equal(s.api.snapshot().tabs[1].props.filter, 'initial'); assert.equal(Object.isFrozen(s.api.snapshot().tabs), true);
  s.api.select(null); s.api.register(tab('test.three'), s.ctx.signal); assert.equal(s.api.snapshot().activeId, null);
  s.api.select('test.one'); await one.dispose(); assert.equal(s.api.snapshot().activeId, 'test.two');
  await two.dispose(); assert.equal(s.api.snapshot().activeId, 'test.three');
  assert.equal(Object.isFrozen(s.changes.at(-1)), true); await s.stop();
});
test('invalid descriptions, getters, duplicate IDs and missing selections preserve the registry', async () => {
  const s = await setup();
  for (const input of [null, {}, tab('bad'), tab('test.bad', { title: '' }), tab('test.bad', { order: NaN }), tab('test.bad', { props: { workspace: {} } }),
    { ...tab('test.bad'), get title() { throw new Error('Getter invoked'); } }]) assert.equal(s.api.register(input, s.ctx.signal).error.code, 'INVALID_ARGUMENT');
  const aborted = new AbortController(); aborted.abort(); assert.equal(s.api.register(tab('test.bad'), aborted.signal).ok, false);
  s.api.register(tab('test.one'), s.ctx.signal); assert.equal(s.api.register(tab('test.one'), s.ctx.signal).error.code, 'ALREADY_REGISTERED');
  assert.equal(s.api.select('test.missing').error.code, 'NOT_FOUND'); assert.equal(s.api.select({}).error.code, 'INVALID_ARGUMENT');
  assert.equal(s.api.update('test.missing', { title: 'Title', icon: 'files' }).error.code, 'NOT_FOUND');
  assert.equal(s.api.update('test.one', { title: 'Title', icon: 'files', props: { get bad() { throw new Error('Getter invoked'); } } }).ok, false);
  s.api.update('test.one', { title: 'Localized', icon: 'search', props: { filter: 'updated' } });
  assert.equal(s.api.snapshot().tabs[0].title, 'Localized'); assert.equal(s.api.snapshot().activeId, 'test.one'); await s.stop();
});
test('stopping consumers removes owned tabs; restart gets a fresh registry and revoked old API', async () => {
  const s = await setup(); s.api.register(tab('test.one'), s.ctx.signal); const stale = s.api;
  await s.kernel.stop('test.consumer'); assert.throws(() => stale.snapshot());
  await s.kernel.start('test.consumer'); assert.deepEqual(s.api.snapshot(), { tabs: [], activeId: null });
  s.api.register(tab('test.one'), s.ctx.signal); await s.stop();
});
