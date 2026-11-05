import test from 'node:test';
import assert from 'node:assert/strict';
import { definePlugin } from '@lunaris/sdk';
import { createKernel } from '@lunaris/kernel';
import { TestScheduler } from '@lunaris/test';
import { Logger } from '@lunaris/logging';
import { Startup, StartupChanged } from '@lunaris/startup';
import { createStartupProvider } from '@lunaris/startup-provider';

const manifest = (id, provides = [], requires = []) => ({ manifestVersion: 1, id, version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './index.js', provides, requires, permissions: [], optionalPermissions: [] });

test('late readers get immutable current state; events, monotonic ingress and shutdown use real SDK scopes', async () => {
  const controller = createStartupProvider(); const logs = []; let api; const changes = [];
  const logger = definePlugin({ manifest: manifest('test.logger', [{ kind: 'api', id: Logger.id, version: Logger.version }]), activate(ctx) {
    ctx.provide(Logger, Object.fromEntries(['log', 'debug', 'info', 'warn', 'error'].map(name => [name, (...args) => { logs.push(args); return true; }])));
  } });
  const reader = definePlugin({ manifest: manifest('test.reader', [], [Startup, StartupChanged].map(token => ({ kind: token.kind, id: token.id, range: '^1.0.0' }))), activate(ctx) {
    api = ctx.use(Startup); ctx.events.on(StartupChanged, value => { changes.push(value); });
  } });
  const kernel = createKernel({ scheduler: new TestScheduler() });
  for (const plugin of [logger, controller.plugin, reader]) kernel.register(plugin);
  const input = { sequence: 1, state: 'loading', stage: 'registration' };
  assert.equal(controller.update(input), true); input.stage = 'composition';
  await kernel.start('test.reader');
  assert.equal(api.snapshot().stage, 'registration'); assert.ok(Object.isFrozen(api.snapshot()));
  const next = { sequence: 2, state: 'loaded', stage: 'ready' };
  assert.equal(controller.update(next), true);
  assert.deepEqual(changes, [next]);
  assert.equal(controller.update({ ...next, sequence: 1 }), false);
  assert.throws(() => controller.update({ ...next, sequence: 3, error: Error('private') }), TypeError);
  await kernel.stopAll(); const count = logs.length;
  assert.equal(controller.update({ sequence: 3, state: 'stopped', stage: 'stopped' }), false);
  assert.equal(logs.length, count); assert.throws(() => api.snapshot());
});
