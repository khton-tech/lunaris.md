import test from 'node:test';
import assert from 'node:assert/strict';
import { HostSession } from '@lunaris/application-host/session';
import { TestScheduler } from '@lunaris/test';

test('host waits for preparation before mounting and announcing loaded', async () => {
  const entered = Promise.withResolvers(); const finish = Promise.withResolvers(); let mounted = false;
  const session = new HostSession({ scheduler: new TestScheduler(), async load() {
    return { plugins: [], entrypoints: [], startup: { update() { return true; }, async prepare() { entered.resolve(); await finish.promise; } },
      view: { mount() { mounted = true; return { dispose() {} }; } } };
  } });
  const starting = session.start(); await entered.promise;
  assert.equal(session.snapshot().phase, 'starting'); assert.equal(session.snapshot().applicationVisible, false); assert.equal(mounted, false);
  finish.resolve(); await starting; assert.equal(mounted, true); assert.equal(session.snapshot().startup.state, 'loaded'); await session.stop();
});

test('preparation failure uses recovery and never mounts a partial application', async () => {
  const session = new HostSession({ scheduler: new TestScheduler(), async load() {
    return { plugins: [], entrypoints: [], startup: { update() { return true; }, async prepare() { throw new Error('private'); } },
      view: { mount() { assert.fail('Must not mount'); } } };
  } });
  await session.start(); assert.equal(session.snapshot().phase, 'fallback');
  assert.equal(session.snapshot().startup.errorCode, 'APPLICATION_PREPARATION_FAILED'); await session.stop();
});

test('stop cancels preparation and prevents a late loaded milestone', async () => {
  const entered = Promise.withResolvers();
  const session = new HostSession({ scheduler: new TestScheduler(), async load() {
    return { plugins: [], entrypoints: [], startup: { update() { return true; }, async prepare(signal) {
      entered.resolve(); await new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
    } } };
  } });
  const starting = session.start(); await entered.promise; await session.stop(); await starting;
  assert.equal(session.snapshot().phase, 'stopped'); assert.equal(session.snapshot().startup.state, 'stopped');
});
