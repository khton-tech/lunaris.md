import test from 'node:test';
import assert from 'node:assert/strict';
import { defineEvent, defineHook } from '@lunaris/sdk';
import { deferred, host, plugin, snapshot } from './helpers.mjs';

const Event = defineEvent({ id: 'example.changed', version: '1.0.0' });
const Hook = defineHook({ id: 'example.transform', version: '1.0.0' });
const provided = token => ({ kind: token.kind, id: token.id, version: token.version });
const required = token => ({ kind: token.kind, id: token.id, range: '^1.0.0' });
function owner(kernel) {
  let ctx;
  kernel.register(plugin('example.owner', value => { ctx = value; }, { provides: [provided(Event), provided(Hook)] }));
  return () => ctx;
}
function consumer(kernel, id, activate, token = Event) {
  kernel.register(plugin(id, activate, { requires: [required(token)] }));
}

test('events await stable snapshots, isolate failures, and handle subscribe/unsubscribe during dispatch', async () => {
  const { kernel } = host(); const get = owner(kernel); const order = []; let second; let context;
  consumer(kernel, 'example.listener', ctx => {
    context = ctx;
    ctx.events.on(Event, async payload => {
      order.push('first:' + payload);
      second.dispose();
      ctx.events.on(Event, value => { order.push('late:' + value); });
      throw new Error('private event payload');
    });
    second = ctx.events.on(Event, () => { order.push('removed'); });
    ctx.events.on(Event, () => { order.push('last'); });
  });
  await kernel.start('example.listener');
  await get().events.emit(Event, 1);
  assert.deepEqual(order, ['first:1', 'last']);
  await get().events.emit(Event, 2);
  assert.deepEqual(order.slice(2), ['first:2', 'last', 'late:2']);
  assert.ok(kernel.inspect().diagnostics.some(d => d.code === 'EVENT_LISTENER_FAILED' && d.contractId === Event.id));
  assert.ok(!JSON.stringify(kernel.inspect()).includes('private'));
  await kernel.stop('example.listener');
  const count = order.length; await get().events.emit(Event, 3); assert.equal(order.length, count);
  assert.throws(() => context.events.on(Event, () => {}), { code: 'SCOPE_CLOSED' });
  await kernel.stopAll(); assert.equal(snapshot(kernel, 'example.listener').ownedResources, 0);
});

test('nested events use an independent immediate snapshot', async () => {
  const { kernel } = host(); const get = owner(kernel); const order = [];
  consumer(kernel, 'example.listener', ctx => {
    ctx.events.on(Event, async value => { order.push('a' + value); if (value === 1) await get().events.emit(Event, 2); });
    ctx.events.on(Event, value => { order.push('b' + value); });
  });
  await kernel.start('example.listener'); await get().events.emit(Event, 1);
  assert.deepEqual(order, ['a1', 'a2', 'b2', 'b1']); await kernel.stopAll();
});

test('hooks are sequential waterfalls ordered by priority, plugin ID and registration order', async () => {
  const { kernel } = host(); const get = owner(kernel);
  await kernel.start('example.owner'); assert.equal(await get().hooks.run(Hook, 'x'), 'x');
  consumer(kernel, 'example.b', ctx => { ctx.hooks.register(Hook, text => text + 'b', { priority: 10 }); }, Hook);
  consumer(kernel, 'example.a', ctx => {
    ctx.hooks.register(Hook, async text => text + 'a1', { priority: 10 });
    ctx.hooks.register(Hook, text => text + 'a2', { priority: 10 });
    ctx.hooks.register(Hook, text => text + 'early', { priority: -1 });
  }, Hook);
  await kernel.start('example.b'); await kernel.start('example.a');
  assert.equal(await get().hooks.run(Hook, ''), 'earlya1a2b'); await kernel.stopAll();
});

test('hook failure/invalid output aborts pipeline and invalid priorities are rejected', async () => {
  const { kernel } = host(); const get = owner(kernel); let later = 0;
  const Valid = defineHook({ id: Hook.id, version: Hook.version, validate: value => typeof value === 'string' });
  consumer(kernel, 'example.a', ctx => {
    assert.throws(() => ctx.hooks.register(Hook, value => value, { priority: NaN }), { code: 'VALIDATION_FAILED' });
    ctx.hooks.register(Valid, () => 42);
    ctx.hooks.register(Hook, value => { later++; return value; });
  }, Hook);
  await kernel.start('example.a');
  await assert.rejects(get().hooks.run(Hook, ''), { code: 'VALIDATION_FAILED' }); assert.equal(later, 0);
  assert.ok(kernel.inspect().diagnostics.some(d => d.code === 'HOOK_FAILED'));
  await kernel.stopAll();
});

test('provider cancellation between handlers prevents later callbacks; in-flight callback may settle', async () => {
  for (const kind of ['event', 'hook']) {
    const { kernel } = host(); const get = owner(kernel); const entered = deferred(); const finish = deferred(); let later = 0;
    consumer(kernel, 'example.listener', ctx => {
      const first = async value => { entered.resolve(); await finish.promise; return value; };
      if (kind === 'event') { ctx.events.on(Event, first); ctx.events.on(Event, () => { later++; }); }
      else { ctx.hooks.register(Hook, first); ctx.hooks.register(Hook, value => { later++; return value; }); }
    }, kind === 'event' ? Event : Hook);
    await kernel.start('example.listener');
    const dispatch = kind === 'event' ? get().events.emit(Event, '') : get().hooks.run(Hook, '');
    const rejected = assert.rejects(dispatch, { code: 'SCOPE_CLOSED' });
    await entered.promise; await kernel.stop('example.owner'); finish.resolve(); await rejected;
    assert.equal(later, 0); await kernel.stopAll();
  }
});

test('staged listeners stay private and rollback removes subscriptions; disposed slots are released', async () => {
  const { kernel } = host(); const get = owner(kernel); const entered = deferred(); const release = deferred(); let received = 0;
  await kernel.start('example.owner');
  consumer(kernel, 'example.listener', async ctx => {
    for (let i = 0; i < 30; i++) ctx.events.on(Event, () => {}).dispose();
    assert.equal(snapshot(kernel, 'example.listener').ownedResources, 0);
    ctx.events.on(Event, () => { received++; }); entered.resolve(); await release.promise; throw 1;
  });
  const start = kernel.start('example.listener'); await entered.promise;
  await get().events.emit(Event, 1); assert.equal(received, 0); release.resolve();
  await assert.rejects(start, { code: 'ACTIVATION_FAILED' }); await get().events.emit(Event, 2); assert.equal(received, 0);
  assert.equal(snapshot(kernel, 'example.listener').ownedResources, 0); await kernel.stopAll();
});

test('owner validators reject malformed input before listener execution', async () => {
  const { kernel } = host(); let ctx; let calls = 0;
  const Valid = defineEvent({ id: Event.id, version: Event.version, validate: value => typeof value === 'string' });
  kernel.register(plugin('example.owner', value => { ctx = value; }, { provides: [provided(Valid)] }));
  consumer(kernel, 'example.listener', value => { value.events.on(Event, () => { calls++; }); });
  await kernel.start('example.listener');
  await assert.rejects(ctx.events.emit(Valid, 42), { code: 'VALIDATION_FAILED' }); assert.equal(calls, 0);
  await kernel.stopAll();
});

test('nested hook pipelines are independent and thrown handler values propagate unchanged', async () => {
  const { kernel } = host(); const get = owner(kernel); const order = []; let fail = false; const error = {};
  consumer(kernel, 'example.listener', ctx => {
    ctx.hooks.register(Hook, async value => { order.push('a' + value); if (fail) throw error; if (value === 1) await get().hooks.run(Hook, 2); return value; });
    ctx.hooks.register(Hook, value => { order.push('b' + value); return value; });
  }, Hook);
  await kernel.start('example.listener'); assert.equal(await get().hooks.run(Hook, 1), 1);
  assert.deepEqual(order, ['a1', 'a2', 'b2', 'b1']); fail = true;
  await assert.rejects(get().hooks.run(Hook, 3), cause => cause === error);
  assert.equal(order.at(-1), 'a3'); await kernel.stopAll();
});

test('stopped hook handlers receive no new validator invocation after their callback settles', async () => {
  const { kernel } = host(); const get = owner(kernel); const entered = deferred(); const finish = deferred(); let validations = 0;
  const Valid = defineHook({ id: Hook.id, version: Hook.version, validate: () => { validations++; return true; } });
  consumer(kernel, 'example.listener', ctx => { ctx.hooks.register(Valid, async value => { entered.resolve(); await finish.promise; return value; }); }, Hook);
  await kernel.start('example.listener'); const run = get().hooks.run(Hook, '');
  const rejected = assert.rejects(run, { code: 'SCOPE_CLOSED' }); await entered.promise;
  const before = validations; await kernel.stop('example.listener'); finish.resolve(); await rejected;
  assert.equal(validations, before); await kernel.stopAll();
});
