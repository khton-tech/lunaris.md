import test from 'node:test';
import assert from 'node:assert/strict';
import { host, plugin } from './helpers.mjs';

test('package resources are captured per registration, bounded and revoked on stop', async () => {
  const { kernel } = host(); let resources; let other;
  const bytes = [0xef, 0xbb, 0xbf, ...new TextEncoder().encode('Привет')];
  kernel.register(plugin('example.plugin', ctx => { resources = ctx.resources; }), { resources: { 'assets/message.txt': bytes, 'assets/invalid': [255], 'assets/binary': new Array(65537).fill(1) } });
  bytes.fill(0);
  kernel.register(plugin('example.other', ctx => { other = ctx.resources; }));
  await kernel.start('example.plugin'); await kernel.start('example.other');
  assert.equal(resources.text('assets/message.txt'), 'Привет'); assert.equal(resources.list().length, 3);
  assert.deepEqual(other.list(), []); assert.throws(() => other.read('assets/message.txt'), { code: 'VALIDATION_FAILED' });
  assert.throws(() => resources.text('assets/invalid'), { code: 'VALIDATION_FAILED' });
  assert.throws(() => resources.text('assets/binary'), { code: 'VALIDATION_FAILED' });
  assert.equal(resources.read('assets/binary').length, 16384);
  for (const range of [[-1, 1], [0, 16385], [0, 0.5], [Infinity, 1]]) assert.throws(() => resources.read('assets/binary', ...range), { code: 'VALIDATION_FAILED' });
  assert.throws(() => resources.read('../outside'), { code: 'VALIDATION_FAILED' });
  assert.throws(() => { resources.read('assets/message.txt')[0] = 0; }, TypeError);
  const old = resources; await kernel.restart('example.plugin');
  assert.throws(() => old.list(), { code: 'SCOPE_CLOSED' }); assert.equal(resources.text('assets/message.txt'), 'Привет');
  await kernel.stopAll(); assert.throws(() => resources.read('assets/message.txt'), { code: 'SCOPE_CLOSED' });
});

test('replacement captures new resources and failed activation restores old bytes', async () => {
  const { kernel } = host(); let resources;
  const definition = plugin('example.plugin', ctx => { resources = ctx.resources; });
  kernel.register(definition, { resources: { 'assets/value': [49] } }); await kernel.start('example.plugin');
  await kernel.replace(definition, { resources: { 'assets/value': [50] } }); assert.equal(resources.text('assets/value'), '2');
  await assert.rejects(kernel.replace(plugin('example.plugin', () => { throw Error('candidate'); }), { resources: { 'assets/value': [51] } }));
  assert.equal(resources.text('assets/value'), '2');
  for (const name of ['../outside', 'assets/../outside', 'assets/CON.txt', 'assets/a.', 'assets//b', 'assets/é']) {
    await assert.rejects(kernel.replace(definition, { resources: { [name]: [] } }), { code: 'VALIDATION_FAILED' });
    assert.equal(resources.text('assets/value'), '2');
  }
  await assert.rejects(kernel.replace(definition, { resources: { 'assets/a': [], 'assets/A': [] } }), { code: 'VALIDATION_FAILED' });
  await assert.rejects(kernel.replace(definition, { resources: { 'assets/a': [], 'assets/a/b': [] } }), { code: 'VALIDATION_FAILED' });
  await assert.rejects(kernel.replace(definition, { resources: { 'assets/a': new Array(1) } }), { code: 'VALIDATION_FAILED' });
  await kernel.stopAll();
});
