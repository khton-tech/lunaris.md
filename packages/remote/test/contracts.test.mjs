import test from 'node:test';
import assert from 'node:assert/strict';
import { AccountSessionChanged, ConnectionChanged, Drafts, encodeRemoteReference, decodeRemoteReference } from '@lunaris/remote';
test('durable remote references distinguish identical account and Vault IDs on different origins', () => {
  const reference = 'account/vault'; const first = encodeRemoteReference('https://first.example', reference); const second = encodeRemoteReference('https://second.example', reference);
  assert.notEqual(first, second); assert.deepEqual(decodeRemoteReference(first), { server: 'https://first.example', reference });
  assert.equal(decodeRemoteReference(reference), null); assert.equal(decodeRemoteReference('["lunaris-remote-v1","", "account/vault"]'), null);
});
test('session and connection events reject malformed state', () => {
  assert.equal(AccountSessionChanged.validate({ current: null }), true);
  assert.equal(AccountSessionChanged.validate({ current: { server: 'https://s', epoch: 'e', account: { id: 'a', login: 'alice' } } }), true);
  for (const value of [null, {}, { current: {} }, { current: { account: {} } }]) assert.equal(AccountSessionChanged.validate(value), false);
  assert.equal(ConnectionChanged.validate({ state: 'expired', epoch: 'e' }), true);
  assert.equal(ConnectionChanged.validate({ state: 'unknown', epoch: 'e' }), false);
});
test('draft storage requires conditional removal and rejects accessor methods', () => {
  assert.equal(Drafts.validate({ load() {}, save() {}, remove() {} }), true);
  assert.equal(Drafts.validate({ load() {}, save() {} }), false);
  assert.equal(Drafts.validate({ load() {}, save() {}, get remove() { throw Error('must not run'); } }), false);
});

test('remote content limits count UTF-8 bytes and bound binary expansion', async()=>{
 const {REMOTE_FILE_LIMITS,remoteFileContentFits}=await import('@lunaris/remote');const n=REMOTE_FILE_LIMITS.maxFileBytes;
 assert.equal(remoteFileContentFits('writeText',{text:'a'.repeat(n)}),true);assert.equal(remoteFileContentFits('writeText',{text:'a'.repeat(n+1)}),false);
 assert.equal(remoteFileContentFits('writeText',{text:'я'.repeat(n/2)}),true);assert.equal(remoteFileContentFits('writeText',{text:'я'.repeat(n/2+1)}),false);
 assert.equal(remoteFileContentFits('writeFile',{data:Array(n).fill(255)}),true);assert.equal(remoteFileContentFits('writeFile',{data:Array(n+1).fill(0)}),false);
 assert.ok(JSON.stringify({text:'\u0000'.repeat(n)}).length<REMOTE_FILE_LIMITS.maxRequestBytes);
});
