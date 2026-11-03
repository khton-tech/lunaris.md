import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestKernel, TestScheduler } from '@lunaris/test';
import { defineApi, definePlugin } from '@lunaris/sdk';

const manifest = (id, requires = []) => ({ manifestVersion: 1, id, version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './plugin.js', provides: [], requires, permissions: [], optionalPermissions: [] });
test('public test host installs typed mock capabilities without internal imports', async () => {
  const host = createTestKernel(); const other = createTestKernel();
  const Api = defineApi({ id: 'test.value', version: '1.0.0' });
  host.installMock(Api, { read() { return 42; } });
  host.register(definePlugin({ manifest: manifest('test.consumer', [{ kind: 'api', id: Api.id, range: '^1.0.0' }]), activate(ctx) { assert.equal(ctx.use(Api).read(), 42); } }));
  await host.start('test.consumer'); host.assertState('test.consumer', 'active');
  assert.throws(() => host.assertNoResources()); other.assertNoResources();
  await host.stopAll(); host.assertNoResources();
  assert.deepEqual(host.diagnostics(), []);
});
test('fifty activation/stop cycles release scopes/listeners and bound diagnostics', async () => {
  const host = createTestKernel({ diagnosticCapacity: 3 }); let resources = 0;
  host.register(definePlugin({ manifest: manifest('test.cycles'), activate(ctx) {
    resources++; ctx.scope.child().own({ dispose() { resources--; } });
    ctx.signal.addEventListener('abort', () => {});
  } }));
  for (let index = 0; index < 50; index++) { await host.start('test.cycles'); assert.equal(resources, 1); await host.stop('test.cycles'); host.assertNoResources(); }
  assert.equal(resources, 0);
  for (let index = 0; index < 10; index++) await assert.rejects(host.start('test.missing'));
  assert.ok(host.diagnostics().length <= 3);
});
test('manual deadlines use explicit activation synchronization', async () => {
  const host = createTestKernel({ activationTimeoutMs: 10 }); const entered = Promise.withResolvers(); const exit = Promise.withResolvers();
  host.register(definePlugin({ manifest: manifest('test.timeout'), async activate() { entered.resolve(); await exit.promise; } }));
  const start = host.start('test.timeout'); await entered.promise;
  host.clock.advanceBy(10); await assert.rejects(start, { code: 'ACTIVATION_TIMEOUT' });
  exit.resolve(); await host.stopAll(); host.assertNoResources();
});
test('scheduler preserves equal-deadline order and cancellation', () => {
  const clock = new TestScheduler(); const order = [];
  clock.schedule(2, () => order.push(1)); const cancel = clock.schedule(1, () => order.push('cancelled')); cancel(); cancel();
  clock.schedule(2, () => order.push(2)); clock.advanceBy(2); assert.deepEqual(order, [1, 2]); assert.equal(clock.pending, 0);
});
