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

const group = (id = 'test.group', extra = {}) => ({ id, title: 'Group', categoryId: 'test.category', ...extra });
const item = (id = 'test.item', extra = {}) => ({ id, groupId: 'test.group', title: 'Choice', type: 'select', value: 'a', options: [{ value: 'a', label: 'A' }], onChange() {}, ...extra });

test('Settings 1.2 validates category icons, bounded sliders and owned reset callbacks', async () => {
  const s = await setup();
  assert.equal(s.api.registerCategory(category('test.category', { icon: 'palette' }), s.ctx.signal).ok, true);
  assert.equal(s.api.snapshot().categories[0].icon, 'palette');
  assert.equal(s.api.updateCategory('test.category', { title: 'Editor', icon: 'editor' }).ok, true);
  assert.equal(s.api.updateCategory('test.category', { title: 'Unsafe', icon: '<svg>' }).ok, false);
  assert.equal(s.api.snapshot().categories[0].icon, 'editor');
  s.api.updateCategory('test.category', { title: 'Default icon' }); assert.equal(s.api.snapshot().categories[0].icon, undefined);
  const reset = () => {}; const slider = { id: 'test.slider', groupId: 'test.group', title: 'Font', type: 'slider', value: 14, min: 12, max: 32, step: 1, unit: 'px', onChange() {}, onReset: reset, resetLabel: 'Use theme', resetDisabled: false };
  assert.equal(s.api.registerItem(slider, s.ctx.signal).ok, true);
  assert.equal(s.api.snapshot().items[0].onReset, reset); assert.ok(Object.isFrozen(s.api.snapshot().items[0]));
  const snapshot = s.api.snapshot().items[0];
  const { id, groupId, ...presentation } = slider;
  for (const changes of [{ min: undefined }, { min: NaN }, { max: Infinity }, { max: 12 }, { step: 0 }, { step: undefined }, { value: 33 }, { unit: 42 }, { resetLabel: '' }, { onReset: undefined }, { resetDisabled: 'yes' }, { get unit() { throw new Error('Getter invoked'); } }]) {
    assert.equal(s.api.updateItem('test.slider', Object.defineProperties({ ...presentation }, Object.getOwnPropertyDescriptors(changes))).ok, false);
    assert.equal(s.api.snapshot().items[0], snapshot);
  }
  assert.equal(s.api.updateItem('test.slider', { ...presentation, value: 20 }).ok, true);
  assert.equal(s.api.snapshot().items[0].value, 20); await s.stop();
});
test('groups and typed items have independent ownership, immutable options, stable ordering and presentation updates', async () => {
  const s = await setup(); const owner = s.ctx.scope.child(); const input = item();
  assert.equal(s.api.registerItem(input, s.ctx.signal).ok, true); input.options[0].label = 'Changed';
  s.api.registerItem(item('test.first', { order: -1 }), s.ctx.signal);
  assert.equal(s.api.registerGroup(group(), owner.signal).ok, true);
  assert.deepEqual(s.api.snapshot().items.map(value => value.id), ['test.first', 'test.item']);
  assert.equal(s.api.snapshot().items[1].options[0].label, 'A'); assert.ok(Object.isFrozen(s.api.snapshot().items[1].options[0]));
  assert.equal(s.api.updateItem('test.item', { type: 'select', title: 'Translated', value: 'a', options: [{ value: 'a', label: 'Updated' }], layout: 'stacked', onChange() {} }).ok, true);
  assert.equal(s.api.snapshot().items[1].groupId, 'test.group'); assert.equal(s.api.snapshot().items[1].layout, 'stacked');
  assert.equal(s.api.updateItem('test.item', { type: 'switch', title: 'Wrong', value: true, onChange() {} }).ok, false);
  assert.equal(s.api.registerSection(section('test.group'), s.ctx.signal).error.code, 'ALREADY_REGISTERED');
  await owner.dispose(); assert.equal(s.api.snapshot().groups.length, 0); assert.equal(s.api.snapshot().items.length, 2);
  assert.equal(s.api.registerGroup(group(), s.ctx.signal).ok, true);
  assert.equal(s.api.updateGroup('test.group', { title: 'Localized', description: 'Details' }).ok, true); await s.stop();
});

test('typed item validation rejects mismatched controls, unsafe options and structural updates atomically', async () => {
  const s = await setup(); const getter = { get value() { throw new Error('Getter executed'); }, label: 'Unsafe' };
  const sparse = []; sparse.length = 1;
  const indexedGetter = []; Object.defineProperty(indexedGetter, '0', { get() { throw new Error('Getter executed'); }, enumerable: true });
  for (const extra of [{ type: 'other' }, { layout: 'absolute' }, { value: 3 }, { onChange: null }, { options: [getter] }, { options: sparse }, { options: indexedGetter },
    { options: [{ value: 'a', label: 'A' }, { value: 'a', label: 'Duplicate' }] }, { onRetry() {} }, { disabled: 'true' }, { description: {} }, { groupId: 'invalid' }]) {
    assert.equal(s.api.registerItem(item('test.invalid', extra), s.ctx.signal).error.code, 'INVALID_ARGUMENT');
  }
  for (const [type, value, extra] of [['switch', true, {}], ['text', 'value', { placeholder: 'Text' }], ['number', 3, { min: 0, max: 10, step: 1 }]]) {
    const input = { id: `test.${type}`, groupId: 'test.group', title: type, type, value, onChange() {}, ...extra };
    assert.equal(s.api.registerItem(input, s.ctx.signal).ok, true);
  }
  assert.equal(s.api.registerItem({ id: 'test.bad-number', groupId: 'test.group', title: 'Number', type: 'number', value: Infinity, onChange() {} }, s.ctx.signal).ok, false);
  assert.equal(s.api.registerGroup(group('test.bad-group', { categoryId: 'invalid' }), s.ctx.signal).ok, false);
  assert.equal(s.api.snapshot().items.length, 3); await s.stop();
});
