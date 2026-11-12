import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocumentContent } from '../dist/src/document-content.js';
const target = { vaultId: 'v', path: 'note.md' };
function setup() {
  const session = { target, active: true, loaded: true, text: 'hello world', version: '1', locks: 0, recoveryCandidates: [] };
  let current = session; let alive = true; const calls = [];
  const host = { alive: () => alive, buffers: () => [session], read: async () => ({ ok: true, value: { text: 'disk', version: '0' } }),
    open: async () => ({ ok: true, value: null }), current: () => current,
    transact: (...args) => { calls.push(args); return true; } };
  return { session, host, calls, api: createDocumentContent(host), change: () => { current = null; }, stop: () => { alive = false; } };
}
test('reads current buffers and routes a guarded edit to one editor transaction', async () => {
  const s = setup(); assert.equal((await s.api.read(target)).value.text, 'hello world');
  assert.equal((await s.api.replace(target, {from: 0, to: 5}, '[[hello]]', 'hello world')).ok, true);
  assert.equal(s.calls.length, 1); assert.equal(s.calls[0][2], '[[hello]]');
});
test('stale offsets, invalid ranges and concurrent navigation never edit', async () => {
  const s = setup(); assert.equal((await s.api.replace(target, {from: 0, to: 5}, 'x', 'older world')).error.code, 'CONFLICT');
  assert.equal((await s.api.reveal(target, {from: -1, to: 5}, 'hello world')).error.code, 'INVALID_ARGUMENT');
  s.host.open = async () => { s.change(); return {ok:true,value:null}; };
  assert.equal((await s.api.replace(target, {from: 0,to:5}, 'x', 'hello world')).error.code, 'CONFLICT'); assert.equal(s.calls.length, 0);
});
test('closure during open cancels and missing renderer is explicit', async () => {
  const s = setup(); s.host.transact = () => false;
  assert.equal((await s.api.reveal(target, {from:0,to:5}, 'hello world')).error.code, 'UNSUPPORTED');
  s.host.open = async () => { s.stop(); return {ok:true,value:null}; };
  assert.equal((await s.api.reveal(target, {from:0,to:5}, 'hello world')).error.code, 'CANCELLED');
});
