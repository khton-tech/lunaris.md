import test from 'node:test';
import assert from 'node:assert/strict';
import { createKernel } from '@lunaris/kernel';
import { definePlugin } from '@lunaris/sdk';
import { TestScheduler } from '@lunaris/test';
import { Logger } from '@lunaris/logging';
import { Workspace, WorkspaceChanged } from '@lunaris/workspace';
import provider from '@lunaris/workspace-provider';

const manifest = (id, provides = [], requires = []) => ({ manifestVersion: 1, id, version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './index.js',
  provides: provides.map(t => ({ kind: t.kind, id: t.id, version: t.version })), requires: requires.map(t => ({ kind: t.kind, id: t.id, range: `^${t.version}` })), permissions: [], optionalPermissions: [] });
async function setup() {
  let api; let ctx; const changes = [];
  const logger = definePlugin({ manifest: manifest('test.logger', [Logger]), activate(context) {
    context.provide(Logger, Object.fromEntries(['log', 'debug', 'info', 'warn', 'error'].map(level => [level, () => true])));
  } });
  const consumer = definePlugin({ manifest: manifest('test.consumer', [], [Workspace, WorkspaceChanged]), activate(context) {
    ctx = context; api = context.use(Workspace); context.events.on(WorkspaceChanged, change => { changes.push(change); });
  } });
  const kernel = createKernel({ scheduler: new TestScheduler() });
  for (const plugin of [logger, provider, consumer]) kernel.register(plugin);
  await kernel.start(consumer.manifest.id);
  return { kernel, get api() { return api; }, get ctx() { return ctx; }, changes };
}
test('portable provider publishes immutable registry changes and cleans up stopping consumers without service calls', async () => {
  const s = await setup(); const owner = s.ctx.scope.child();
  assert.equal(s.api.register({ id: 'test.files', componentId: 'test.tree' }, owner.signal).ok, true);
  assert.equal(s.changes.at(-1).kind, 'registered'); assert.equal(Object.isFrozen(s.changes.at(-1)), true);
  s.api.update('test.files', { title: 'Files' }); assert.equal(s.changes.at(-1).kind, 'updated');
  await owner.dispose(); assert.equal(s.changes.at(-1).kind, 'removed'); assert.deepEqual(s.api.list(), []);
  s.api.register({ id: 'test.files', componentId: 'test.tree' }, s.ctx.signal);
  await s.kernel.stopAll(); assert.deepEqual(s.kernel.inspect().diagnostics.filter(item => item.code === 'CLEANUP_FAILED'), []);
});
test('a stopped consumer releases registrations while the provider remains available to replacements', async () => {
  const s = await setup(); s.api.register({ id: 'test.files', componentId: 'test.tree' }, s.ctx.signal);
  const stale = s.api; await s.kernel.stop('test.consumer'); assert.throws(() => stale.list());
  await s.kernel.start('test.consumer'); assert.deepEqual(s.api.list(), []);
  assert.equal(s.api.register({ id: 'test.files', componentId: 'test.tree' }, s.ctx.signal).ok, true);
  await s.kernel.stopAll(); assert.deepEqual(s.kernel.inspect().diagnostics.filter(item => item.code === 'CLEANUP_FAILED'), []);
});
