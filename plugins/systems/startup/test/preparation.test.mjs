import test from 'node:test';
import assert from 'node:assert/strict';
import { createPreparation } from '../dist/src/preparation.js';
const flush = () => new Promise(resolve => setImmediate(resolve));
const owner = () => new AbortController();

test('preparation orders settings, document, content and presentation before ready', async () => {
  const states = []; const calls = []; const pending = Promise.withResolvers();
  const service = createPreparation(async state => states.push(state), 1000);
  for (const phase of ['presentation', 'content', 'document', 'settings']) await service.api.register({ id: phase, phase,
    async prepare(context) { calls.push(phase); assert.equal(context.vaultId, 'a'); if (phase === 'settings') await pending.promise; },
  }, owner().signal);
  const run = service.run('a'); await flush();
  assert.deepEqual(calls, ['settings']); assert.equal(service.api.snapshot().state, 'preparing');
  pending.resolve(); await run;
  assert.deepEqual(calls, ['settings', 'document', 'content', 'presentation']);
  assert.deepEqual(states.filter(state => state.phase).map(state => state.phase), ['settings', 'document', 'content', 'presentation']);
  assert.equal(states.at(-1).state, 'ready');
  assert.ok(Object.isFrozen(service.api.snapshot())); service.dispose();
});

test('superseding and disposal cancel blocked work without publishing stale ready', async () => {
  const pending = Promise.withResolvers(); const entered = Promise.withResolvers(); let signal;
  const states = []; const service = createPreparation(async state => states.push(state), 1000);
  await service.api.register({ id: 'slow', phase: 'settings', async prepare(context) {
    if (context.vaultId === 'a') { signal = context.signal; entered.resolve(); await pending.promise; }
  } }, owner().signal);
  const first = service.run('a'); const rejection = assert.rejects(first, /superseded/); await entered.promise;
  await service.run('b'); await rejection; assert.equal(signal.aborted, true);
  pending.resolve(); await flush(); assert.equal(service.api.snapshot().vaultId, 'b');
  assert.equal(states.some(state => state.state === 'ready' && state.vaultId === 'a'), false);
  service.dispose(); await assert.rejects(service.run('c'), /stopped/);
});

test('deadline cancels participant context and required failure prevents presentation', async () => {
  const service = createPreparation(async () => {}, 15); let signal; let rendered = false;
  await service.api.register({ id: 'stalled', phase: 'settings', async prepare(context) { signal = context.signal; await new Promise(() => {}); } }, owner().signal);
  await service.api.register({ id: 'view', phase: 'presentation', async prepare() { rendered = true; } }, owner().signal);
  await assert.rejects(service.run(null), /deadline/); assert.equal(signal.aborted, true);
  assert.equal(service.api.snapshot().state, 'failed'); assert.equal(rendered, false); service.dispose();
});

test('owner removal unblocks preparation and duplicate registrations fail', async () => {
  const service = createPreparation(async () => {}, 1000); const scope = owner(); let signal;
  const participant = { id: 'removed', phase: 'content', async prepare(context) { signal = context.signal; await new Promise(() => {}); } };
  await service.api.register(participant, scope.signal);
  await assert.rejects(service.api.register(participant, owner().signal), /duplicate/);
  const run = service.run(null); await flush(); scope.abort(); await run;
  assert.equal(signal.aborted, true); assert.equal(service.api.snapshot().state, 'ready'); service.dispose();
});

test('late participants await local readiness without reopening completed startup', async () => {
  const service = createPreparation(async () => {}, 1000); await service.run('a');
  const before = service.api.snapshot(); const pending = Promise.withResolvers(); let done = false;
  const registration = service.api.register({ id: 'late', phase: 'content', async prepare() { await pending.promise; done = true; } }, owner().signal);
  await flush(); assert.equal(done, false); assert.equal(service.api.snapshot(), before);
  pending.resolve(); await registration; assert.equal(done, true); assert.equal(service.api.snapshot(), before); service.dispose();
});

test('stopping cancels both preparation and a late registration', async () => {
  for (const late of [false, true]) {
    const service = createPreparation(async () => {}, 1000); const entered = Promise.withResolvers(); let signal;
    if (late) await service.run(null);
    const registering = service.api.register({ id: 'slow', phase: 'content', async prepare(context) { signal = context.signal; entered.resolve(); await new Promise(() => {}); } }, owner().signal);
    const running = late ? registering : (await registering, service.run(null));
    const rejection = assert.rejects(running, /stopped/); await entered.promise; service.dispose(); await rejection;
    assert.equal(signal.aborted, true);
  }
});
