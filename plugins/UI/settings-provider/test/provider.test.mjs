import test from 'node:test';
import assert from 'node:assert/strict';
import { createKernel } from '@lunaris/kernel';
import { definePlugin } from '@lunaris/sdk';
import { TestScheduler } from '@lunaris/test';
import { Logger } from '@lunaris/logging';
import { Settings, SettingsChanged } from '@lunaris/settings';
import provider from '@lunaris/settings-provider';

const manifest = (id, provides = [], requires = []) => ({ manifestVersion: 1, id, version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './index.js',
  provides: provides.map(t => ({ kind: t.kind, id: t.id, version: t.version })), requires: requires.map(t => ({ kind: t.kind, id: t.id, range: `^${t.version}` })), permissions: [], optionalPermissions: [] });
async function setup() {
  let api; let ctx; const changes = [];
  const logger = definePlugin({ manifest: manifest('test.logger', [Logger]), activate(context) {
    context.provide(Logger, Object.fromEntries(['log', 'debug', 'info', 'warn', 'error'].map(level => [level, () => true])));
  } });
  const consumer = definePlugin({ manifest: manifest('test.consumer', [], [Settings, SettingsChanged]), activate(context) {
    ctx = context; api = context.use(Settings); context.events.on(SettingsChanged, change => { changes.push(change); api.snapshot(); });
  } });
  const kernel = createKernel({ scheduler: new TestScheduler() });
  for (const plugin of [logger, provider, consumer]) kernel.register(plugin); await kernel.start('test.consumer');
  return { api, ctx, changes, kernel, async stop() { await kernel.stopAll(); assert.deepEqual(kernel.inspect().diagnostics.filter(item => item.code === 'CLEANUP_FAILED'), []); } };
}
const category = (id, extra = {}) => ({ id, title: id, ...extra });
const section = (id, extra = {}) => ({ id, title: id, categoryId: 'test.category', componentId: 'test.controls', ...extra });

test('ordered immutable contributions support independent owners and orphan sections', async () => {
  const s = await setup(); const owner = s.ctx.scope.child(); const props = { label: 'Initial' };
  assert.equal(s.api.registerSection(section('test.section', { props }), s.ctx.signal).ok, true);
  props.label = 'Changed'; assert.equal(s.api.snapshot().sections[0].props.label, 'Initial');
  s.api.registerCategory(category('test.category', { order: 20 }), owner.signal);
  s.api.registerCategory(category('test.first', { order: -1 }), s.ctx.signal);
  assert.deepEqual(s.api.snapshot().categories.map(item => item.id), ['test.first', 'test.category']);
  assert.ok(Object.isFrozen(s.api.snapshot().sections[0].props)); assert.ok(Object.isFrozen(s.changes.at(-1)));
  await owner.dispose(); assert.equal(s.api.snapshot().sections.length, 1);
  assert.equal(s.api.registerCategory(category('test.category'), s.ctx.signal).ok, true);
  s.api.updateCategory('test.category', { title: 'Translated' });
  s.api.updateSection('test.section', { title: 'Controls', props: { value: 2 } });
  assert.equal(s.api.snapshot().sections[0].props.value, 2); await s.stop();
});
test('malformed descriptions, accessors, duplicates and dead owners do not mutate registry', async () => {
  const s = await setup();
  for (const input of [null, {}, category('bad'), category('test.bad', { title: ' ' }), category('test.bad', { order: NaN }), category('test.bad', { order: null }), category('test.bad', { extra: true }),
    { ...category('test.bad'), get title() { throw new Error('Getter invoked'); } }]) assert.equal(s.api.registerCategory(input, s.ctx.signal).error.code, 'INVALID_ARGUMENT');
  for (const input of [section('bad'), section('test.bad', { categoryId: '' }), section('test.bad', { props: { workspace: {} } }), section('test.bad', { props: { get x() { throw new Error('Getter invoked'); } } })]) assert.equal(s.api.registerSection(input, s.ctx.signal).ok, false);
  const owner = s.ctx.scope.child(); await owner.dispose(); assert.equal(s.api.registerCategory(category('test.category'), owner.signal).ok, false);
  s.api.registerCategory(category('test.category'), s.ctx.signal);
  assert.equal(s.api.registerCategory(category('test.category'), s.ctx.signal).error.code, 'ALREADY_REGISTERED');
  assert.equal(s.api.updateCategory('test.missing', { title: 'Title' }).error.code, 'NOT_FOUND');
  assert.equal(s.api.updateSection('test.missing', { title: 'Title' }).error.code, 'NOT_FOUND');
  assert.equal(s.api.updateCategory('test.category', { title: 'Title', order: 9 }).ok, false); await s.stop();
});
test('consumer stop removes owned registrations and revokes its handles', async () => {
  const s = await setup(); s.api.registerCategory(category('test.category'), s.ctx.signal); const api = s.api;
  await s.kernel.stop('test.consumer'); assert.throws(() => api.snapshot()); await s.kernel.start('test.consumer'); await s.stop();
});
