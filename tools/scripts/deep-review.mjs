// Focused defect observations for the second, non-UI system audit.
// Exit zero confirms current defects; it is not a product acceptance gate.
import assert from 'node:assert/strict';
import { createServerTransport } from '@lunaris/server-transport';
import { ServerTransport, ConnectionStatus } from '@lunaris/remote';
import { testHost, consumer } from '../testing/remote.mjs';
import { DocumentSession } from '../../plugins/UI/text-editor/dist/src/session.js';
import { createObservation } from '../../plugins/systems/filesystem/dist/src/observation.js';
import { createTestKernel } from '@lunaris/test';

const ok = value => ({ ok: true, value });
const tick = () => new Promise(setImmediate);

async function overlappingConnects() {
  let api; let status; let ctx; const urls = [];
  const host = testHost({ 'test.consumer': ['account.network', 'account.access'] });
  host.register(createServerTransport({ mode: 'desktop', fetch: async url => {
    urls.push(url);
    return new Response(JSON.stringify(ok({ protocol: 1, buildId: 'probe', registration: 'open' })));
  } }));
  host.register(consumer([ServerTransport, ConnectionStatus], context => {
    ctx = context; api = ctx.use(ServerTransport); status = ctx.use(ConnectionStatus);
  }, ['account.network', 'account.access']));
  await host.start('test.consumer');
  try {
    const a = ctx.scope.child(); const b = ctx.scope.child();
    const results = await Promise.all([api.connect('https://a.invalid', a.signal), api.connect('https://b.invalid', b.signal)]);
    assert.ok(results.every(result => result.ok));
    assert.equal(urls.length, 2);
    assert.ok(urls.every(url => url.startsWith('https://b.invalid/')));
    assert.equal(status.current().server, 'https://b.invalid');
    await a.dispose();
    assert.equal(b.signal.aborted, false);
    assert.equal(status.current(), null);
  } finally { await host.stopAll(); host.assertNoResources(); }
}

async function cleanUndoLeavesOldDraft() {
  let record = null;
  const entered = Promise.withResolvers(); const release = Promise.withResolvers();
  let first = true;
  const draft = {
    load: async () => ok(record),
    async save(text, expectedVersion, revision) {
      if (first) { first = false; entered.resolve(); await release.promise; }
      record = { text, expectedVersion, revision }; return ok(null);
    },
    remove: async revision => { if (record?.revision === revision) record = null; return ok(null); },
  };
  const timer = { after() { return 1; }, cancel() {} };
  const create = () => new DocumentSession({ vaultId: 'v', path: 'note.md' },
    { readText: async () => ok({ text: 'original', version: 'v1' }) },
    () => true, () => {}, () => {}, timer, draft);
  const session = create(); await session.load();
  session.edit('temporary edit'); await entered.promise;
  session.edit('original');
  assert.equal(session.dirty, false);
  assert.equal(session.dirty && !session.draftSaved, false);
  assert.equal((await session.flush()).ok, true);
  session.dispose(); release.resolve(); await tick();
  assert.equal(record.text, 'temporary edit');
  const reopened = create(); await reopened.load();
  assert.equal(reopened.text, 'temporary edit'); assert.equal(reopened.dirty, true);
  reopened.dispose();
}

async function failedUnwatchCannotRetry() {
  let api; let ctx; let attempts = 0; let nativeActive = true;
  const host = testHost();
  host.register(consumer([], context => {
    ctx = context;
    api = createObservation(ctx, async () => ok('watch-1'), async () => {
      attempts++;
      if (attempts === 1) return { ok: false, error: { code: 'IO_ERROR', message: 'Transient release failure' } };
      nativeActive = false; return ok(null);
    }, () => {});
  }, []));
  await host.start('test.consumer');
  try {
    await api.watch({ vaultId: 'v', path: '' }, ctx.signal);
    assert.equal((await api.unwatch('v', 'watch-1')).ok, false);
    assert.equal((await api.unwatch('v', 'watch-1')).ok, true);
    assert.equal(attempts, 1); assert.equal(nativeActive, true);
  } finally { await host.stopAll(); host.assertNoResources(); }
}

async function asynchronousRecursiveDisposal() {
  const host = createTestKernel({ stopTimeoutMs: 10 });
  host.register(consumer([], ctx => {
    ctx.scope.own({ async dispose() { await Promise.resolve(); await ctx.scope.dispose(); } });
  }, []));
  await host.start('test.consumer');
  const stopping = host.stop('test.consumer');
  const rejected = assert.rejects(stopping, error => error.code === 'STOP_TIMEOUT');
  await tick();
  host.clock.advanceBy(10);
  await rejected;
  assert.equal(host.inspect().plugins[0].state, 'failed');
  assert.ok(host.inspect().plugins[0].ownedResources > 0);
  // This deliberately invalid disposer leaves a Promise cycle, no native resource
  // or real timer. Do not await the same disposal cycle again.
}

try {
  await overlappingConnects();
  await cleanUndoLeavesOldDraft();
  await failedUnwatchCannotRetry();
  await asynchronousRecursiveDisposal();
  console.log('Deep review: 3 defects reproduced (connect ownership race, clean undo resurrects draft, failed unwatch cannot retry); async recursive-disposal guard limitation confirmed. Synthetic data only.');
} catch (error) {
  console.error(`Deep review failed or behavior changed: ${error.stack}`);
  process.exitCode = 1;
}
