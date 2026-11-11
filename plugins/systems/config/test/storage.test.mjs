import test from 'node:test';
import assert from 'node:assert/strict';
import { createStorage } from '../dist/src/storage.js';

const target = { vaultId: 'a', path: 'config.toml' };
const ok = value => ({ ok: true, value });
function setup() {
  let text = '[plugins."test.a"]\nvalue = 1\n[plugins."test.b"]\nvalue = 2\n'; let version = 1;
  let reads = 0; let writes = 0; let gate; let fail = false;
  const storage = createStorage({ async readText() { reads++; const result = { text, version: String(version) }; await gate;
    return fail ? { ok: false, error: { code: 'IO_ERROR', message: 'Failed' } } : ok(result); },
    async writeText(_target, next, options) { assert.equal(options.expectedVersion, String(version)); writes++; text = next; return ok({ version: String(++version) }); },
  }, () => false);
  return { storage, get reads() { return reads; }, get writes() { return writes; }, set gate(value) { gate = value; }, set fail(value) { fail = value; },
    external(value) { text = value; version++; } };
}

test('concurrent namespace reads share one file read and return isolated snapshots', async () => {
  const s = setup(); const results = await Promise.all([s.storage.read(target, 'test.a'), s.storage.read(target, 'test.b'), s.storage.read(target, 'test.a')]);
  assert.equal(s.reads, 1); assert.equal(results[1].value.value, 2);
  results[0].value.value = 99; assert.equal(results[2].value.value, 1);
  s.external('[plugins."test.a"]\nvalue = 3\n');
  assert.equal((await s.storage.read(target, 'test.a')).value.value, 3); assert.equal(s.reads, 2);
});

test('writes separate read batches and retain optimistic versions', async () => {
  const s = setup();
  const before = s.storage.read(target, 'test.a');
  const write = s.storage.mutate(target, 'test.a', 'value', 3);
  const after = s.storage.read(target, 'test.a');
  assert.equal((await before).value.value, 1); assert.equal((await write).value, true);
  assert.equal((await after).value.value, 3); assert.equal(s.writes, 1);
});

test('unchanged scalar settings do not write and failed shared reads are retried', async () => {
  const s = setup(); assert.equal((await s.storage.mutate(target, 'test.a', 'value', 1)).value, false); assert.equal(s.writes, 0);
  s.fail = true; const before = s.reads;
  const results = await Promise.all([s.storage.read(target, 'test.a'), s.storage.read(target, 'test.b')]);
  assert.equal(s.reads, before + 1); assert.ok(results.every(result => !result.ok));
  s.fail = false; assert.equal((await s.storage.read(target, 'test.a')).value.value, 1);
});
