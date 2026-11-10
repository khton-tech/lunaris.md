import test from 'node:test';
import assert from 'node:assert/strict';
import { host, plugin, snapshot } from './helpers.mjs';

test('host-owned plugins start after owners and clean before owner resources, including stopAll', async () => {
  const { kernel } = host(); const calls = [];
  kernel.register(plugin('example.owner', () => { calls.push('owner-start'); return { dispose() { calls.push('owner-stop'); } }; }));
  kernel.register(plugin('example.child', () => { calls.push('child-start'); return { dispose() { calls.push('child-stop'); } }; }), { ownerId: 'example.owner' });
  await kernel.start('example.child');
  assert.deepEqual(calls, ['owner-start', 'child-start']); assert.equal(snapshot(kernel, 'example.child').ownerId, 'example.owner');
  await kernel.stopAll(); assert.deepEqual(calls, ['owner-start', 'child-start', 'child-stop', 'owner-stop']);
});

test('owner replacement preserves ownership edges and restarts its active children', async () => {
  const { kernel } = host(); let starts = 0;
  kernel.register(plugin('example.owner')); kernel.register(plugin('example.child', () => { starts++; }), { ownerId: 'example.owner' });
  await kernel.start('example.child'); await kernel.replace(plugin('example.owner'));
  assert.equal(starts, 2); await kernel.stop('example.owner');
  assert.equal(snapshot(kernel, 'example.child').state, 'stopped');
  await kernel.start('example.child'); assert.equal(starts, 3); await kernel.stopAll();
});

test('unregistered owners leave stopped children with an actionable missing-owner failure', async () => {
  const { kernel } = host(); kernel.register(plugin('example.owner')); kernel.register(plugin('example.child'), { ownerId: 'example.owner' });
  await kernel.start('example.child'); await kernel.unregister('example.owner');
  await assert.rejects(kernel.start('example.child'), { code: 'PROVIDER_MISSING' });
  assert.throws(() => kernel.register(plugin('example.invalid'), { ownerId: 'example.invalid' }), { code: 'LIFECYCLE_INVALID' });
  kernel.register(plugin('example.owner')); await kernel.start('example.child'); await kernel.stopAll();
});
