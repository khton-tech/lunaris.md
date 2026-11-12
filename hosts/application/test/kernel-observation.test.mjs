import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setImmediate } from 'node:timers/promises';
import { definePlugin } from '@lunaris/sdk';
import { TestScheduler } from '@lunaris/test';
import { HostSession } from '@lunaris/application-host/session';

const plugin = activate => definePlugin({ manifest: {
  manifestVersion: 1, id: 'observe.app', version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0',
  entry: './index.js', provides: [], requires: [], permissions: [], optionalPermissions: [],
}, activate });

function setup(activate, kernelOptions) {
  const scheduler = new TestScheduler();
  const session = new HostSession({ scheduler, kernelOptions, load: async () => ({
    plugins: [plugin(activate)], entrypoints: ['observe.app'],
    view: { mount: () => ({ dispose() {} }) },
  }) });
  return { session, scheduler };
}

test('entrypoint scope closure automatically enters recovery without polling', async () => {
  let context;
  const { session, scheduler } = setup(ctx => { context = ctx; });
  await session.start();
  await context.scope.dispose();
  await setImmediate();
  assert.equal(session.snapshot().phase, 'fallback');
  assert.equal(session.snapshot().applicationVisible, false);
  assert.ok(session.snapshot().incidents.some(value => value.code === 'APPLICATION_PLUGIN_UNAVAILABLE'));
  assert.equal(scheduler.pending, 0);
  await session.stop();
});

test('background child cleanup failures automatically trigger recovery', async () => {
  let context;
  const { session } = setup(ctx => { context = ctx; });
  await session.start();
  const child = context.scope.child();
  child.own({ dispose() { throw new Error('background cleanup'); } });
  await assert.rejects(child.dispose());
  await setImmediate();
  assert.equal(session.snapshot().phase, 'fallback');
  assert.ok(session.snapshot().incidents.some(value => value.code === 'CLEANUP_FAILED'));
  await session.stop();
});

test('ordinary diagnostics remain observable while the idle host creates no updates', async () => {
  let context;
  const { session, scheduler } = setup(ctx => { context = ctx; });
  await session.start();
  await setImmediate();
  let updates = 0;
  const listener = session.subscribe(() => { updates++; });
  await setImmediate();
  scheduler.advanceBy(60_000);
  await setImmediate();
  assert.equal(updates, 1);
  assert.equal(scheduler.pending, 0);
  assert.throws(() => context.permissions.has('observe.undeclared'), { code: 'PERMISSION_DENIED' });
  await setImmediate();
  assert.ok(updates > 1);
  assert.equal(session.snapshot().phase, 'running');
  assert.equal(session.snapshot().kernel.diagnostics.at(-1).code, 'PERMISSION_DENIED');
  listener.dispose();
  await session.stop();
});

test('late diagnostics from an earlier kernel cannot fault a restarted application', async () => {
  const entered = Promise.withResolvers();
  const finish = Promise.withResolvers();
  let starts = 0;
  const { session, scheduler } = setup(async () => {
    if (++starts > 1) return;
    entered.resolve();
    await finish.promise;
    return { dispose() { throw new Error('old kernel cleanup'); } };
  }, { activationTimeoutMs: 10 });
  const starting = session.start();
  await entered.promise;
  scheduler.advanceBy(10);
  await starting;
  assert.equal(session.snapshot().phase, 'fallback');
  await session.start();
  assert.equal(session.snapshot().phase, 'running');
  finish.resolve();
  await setImmediate();
  assert.equal(session.snapshot().phase, 'running');
  assert.equal(session.snapshot().kernel.diagnostics.length, 0);
  await session.stop();
});

test('browser and desktop bootstrap rely on kernel changes for fault monitoring', async () => {
  for (const source of ['../../web/src/bootstrap.ts', '../../tauri/src/bootstrap.ts']) {
    const code = await readFile(new URL(source, import.meta.url), 'utf8');
    assert.doesNotMatch(code, /setInterval/);
  }
});
