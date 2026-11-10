import test from 'node:test';
import assert from 'node:assert/strict';
import { HostSession } from '@lunaris/application-host/session';
import { definePlugin } from '@lunaris/sdk';
import { TestScheduler } from '@lunaris/test';
import { LimeBootPolicy } from '@lunaris/lime';

test('host safe recovery policy is captured before application entrypoint activation', async () => {
  const seen = [];
  const plugin = definePlugin({ manifest: { manifestVersion: 1, id: 'test.observer', version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './index.js', provides: [], requires: [{ kind: 'api', id: LimeBootPolicy.id, range: '^1.0.0' }], permissions: ['runtime.manage'], optionalPermissions: [] }, activate(ctx) { seen.push(ctx.use(LimeBootPolicy).safeMode()); } });
  const session = new HostSession({ scheduler: new TestScheduler(), async load() { return { pluginRuntime: true, plugins: [plugin], entrypoints: [plugin.manifest.id], grants: { [plugin.manifest.id]: ['runtime.manage'] } }; } });
  await session.start(); assert.deepEqual(seen, [false]); assert.equal(session.snapshot().phase, 'running');
  await session.startSafeMode(); assert.deepEqual(seen, [false, true]); assert.equal(session.snapshot().thirdPartySafeMode, true);
  assert.equal(session.snapshot().pluginRuntimeAvailable, true); await session.stop();
});

test('safe recovery respects the running application save gate', async () => {
  let preserve = false; let launches = 0;
  const session = new HostSession({ scheduler: new TestScheduler(), async load() { launches++; return { plugins: [], entrypoints: [], beforeClose: async () => preserve }; } });
  await session.start(); await session.startSafeMode(); assert.equal(launches, 1); assert.equal(session.snapshot().thirdPartySafeMode, false);
  preserve = true; await session.startSafeMode(); assert.equal(launches, 2); assert.equal(session.snapshot().thirdPartySafeMode, true); await session.stop();
});
