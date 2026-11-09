// Reproduce the 2026-11-09 review findings without modifying product data.
// These assertions describe defects at the reviewed revision, not desired behavior.
import assert from 'node:assert/strict';
import { DocumentSession } from '../../plugins/UI/text-editor/dist/src/session.js';
import { HostSession } from '@lunaris/application-host';
import { defineApi, definePlugin } from '@lunaris/sdk';
import { TestScheduler } from '@lunaris/test';
import { createServerTransport } from '@lunaris/server-transport';
import { ServerTransport, ConnectionStatus } from '@lunaris/remote';
import { testHost, consumer } from '../testing/remote.mjs';

const ok = value => ({ ok: true, value });
const failure = { ok: false, error: { code: 'IO_ERROR', message: 'Injected storage failure' } };
const timer = { after() { return 1; }, cancel() {} };
async function discardedDraftReturns() {
  const record = { text: 'discarded text', expectedVersion: 'v1', revision: 'r1' };
  const draft = { load: async () => ok(record), save: async () => ok(null), remove: async () => failure };
  const create = () => new DocumentSession({ vaultId: 'v', path: 'note.md' },
    { readText: async () => ok({ text: 'disk text', version: 'v1' }) },
    () => true, () => {}, () => {}, timer, draft);
  const first = create();
  await first.load();
  await first.load(true);
  assert.equal(first.text, 'disk text');
  assert.equal(first.error, null);
  assert.equal(first.dirty, false);
  first.dispose();
  const reopened = create();
  await reopened.load();
  assert.equal(reopened.text, 'discarded text');
  assert.equal(reopened.dirty, true);
  reopened.dispose();
}

async function caughtFailureStopsHost() {
  const token = defineApi({ id: 'review.service', version: '1.0.0' });
  let handle; let disposed = false; let guarded = 0;
  const manifest = (id, provides, requires) => ({ manifestVersion: 1, id, version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './index.js', provides, requires, permissions: [], optionalPermissions: [] });
  const provider = definePlugin({ manifest: manifest('review.provider', [{ kind: 'api', id: token.id, version: token.version }], []),
    activate(ctx) { ctx.provide(token, { read() { throw Error('Recoverable read failure'); } }); } });
  const client = definePlugin({ manifest: manifest('review.consumer', [], [{ kind: 'api', id: token.id, range: '^1.0.0' }]),
    activate(ctx) { handle = ctx.use(token); return { dispose() { disposed = true; } }; } });
  const session = new HostSession({ scheduler: new TestScheduler(), load: async () => ({ plugins: [provider, client], entrypoints: ['review.consumer'],
    beforeClose: async () => { guarded++; return false; } }) });
  await session.start();
  try { handle.read(); } catch { /* Consumer handled this error. */ }
  session.refresh();
  await session.reportFault();
  assert.equal(session.snapshot().phase, 'fallback');
  assert.equal(disposed, true);
  assert.equal(guarded, 0);
  await session.stop();
}

async function jsonServerFailureReportsConnected() {
  let api; let status; let ctx; let broken = false;
  const host = testHost({ 'test.consumer': ['account.network', 'account.access'] });
  host.register(createServerTransport({ mode: 'desktop', fetch: async () => new Response(JSON.stringify(broken
    ? { ok: false, error: { code: 'SERVER_UNAVAILABLE', message: 'Unavailable' } }
    : ok({ protocol: 1, buildId: 'review', registration: 'open' })), { status: broken ? 503 : 200 }) }));
  host.register(consumer([ServerTransport, ConnectionStatus], context => { ctx = context; api = ctx.use(ServerTransport); status = ctx.use(ConnectionStatus); }, ['account.network', 'account.access']));
  await host.start('test.consumer');
  try {
    await api.connect('http://localhost:3100', ctx.signal);
    broken = true;
    assert.equal((await api.request('GET', 'server')).error.code, 'SERVER_UNAVAILABLE');
    assert.equal(status.current().state, 'connected');
  } finally { await host.stopAll(); host.assertNoResources(); }
}

try {
  await discardedDraftReturns();
  await caughtFailureStopsHost();
  await jsonServerFailureReportsConnected();
  console.log('Review reproductions confirmed: discarded draft returns; caught API failure stops host without save gate; JSON 503 reports connected. No product data written.');
} catch (error) {
  console.error(`Review reproduction changed or failed: ${error.message}`);
  process.exitCode = 1;
}
