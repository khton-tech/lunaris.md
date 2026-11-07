import test from 'node:test';
import assert from 'node:assert/strict';
import { DocumentSession, AUTOSAVE_DELAY } from '../dist/src/session.js';
const ok = value => ({ ok: true, value });
function setup(options = {}) {
  let now = 0; let next = 0; const timers = new Map(); const writes = []; const logs = [];
  const clock = { after(callback, delay) { const id = ++next; timers.set(id, { at: now + delay, callback }); return id; }, cancel(id) { timers.delete(id); } };
  let disk = { text: '# Note', version: 'v1' };
  const session = new DocumentSession({ vaultId: 'v', path: 'note.md' }, {
    async readText() { return options.read ? options.read() : ok(disk); },
    async writeText(target, text, policy) {
      writes.push({ target, text, policy }); if (options.write) return options.write(target, text, policy);
      disk = { text, version: `v${writes.length + 1}` }; return ok({ version: disk.version });
    },
  }, () => options.alive !== false, () => {}, (...args) => logs.push(args), clock);
  return { session, writes, timers, logs, async tick(delta) { now += delta; for (const [id, timer] of timers) if (timer.at <= now) { timers.delete(id); timer.callback(); } await new Promise(setImmediate); } };
}
test('autosave waits two seconds after the last edit and uses the loaded version', async () => {
  const s = setup(); await s.session.load(); assert.equal(AUTOSAVE_DELAY, 2000);
  s.session.edit('first'); await s.tick(1500); assert.equal(s.writes.length, 0);
  s.session.edit('latest'); await s.tick(1999); assert.equal(s.writes.length, 0);
  await s.tick(1); assert.equal(s.writes.length, 1); assert.equal(s.writes[0].text, 'latest');
  assert.deepEqual(s.writes[0].policy, { mode: 'replace', expectedVersion: 'v1' }); assert.equal(s.session.dirty, false);
  s.session.dispose();
});
test('edits during an in-flight write are saved serially without falsely marking the latest text saved', async () => {
  const entered = Promise.withResolvers(); const release = Promise.withResolvers(); let count = 0;
  const s = setup({ async write() { if (++count === 1) { entered.resolve(); await release.promise; } return ok({ version: `v${count + 1}` }); } });
  await s.session.load(); s.session.edit('first'); const saving = s.session.flush(); await entered.promise;
  s.session.edit('second'); assert.equal(s.session.dirty, true); assert.equal(s.writes.length, 1);
  release.resolve(); assert.equal((await saving).ok, true);
  assert.deepEqual(s.writes.map(write => [write.text, write.policy.expectedVersion]), [['first', 'v1'], ['second', 'v2']]);
  assert.equal(s.session.savedText, 'second'); assert.equal(s.session.dirty, false); s.session.dispose();
});
test('conflict and failed reads retain text; reload never silently discards a dirty buffer', async () => {
  const options = {}; const s = setup(options); await s.session.load(); s.session.edit('draft');
  options.write = async () => ({ ok: false, error: { code: 'CONFLICT', message: 'External change' } });
  assert.equal((await s.session.flush()).error.code, 'CONFLICT'); assert.equal(s.session.text, 'draft');
  s.session.edit('retained'); await s.tick(5000); assert.equal(s.writes.length, 1);
  await s.session.load(); assert.equal(s.session.text, 'retained');
  options.read = async () => ({ ok: false, error: { code: 'ACCESS_DENIED', message: 'Denied' } });
  await s.session.load(true); assert.equal(s.session.text, 'retained'); assert.equal(s.session.dirty, true);
  assert.ok(s.logs.some(log => log[0] === 'warn')); s.session.dispose();
});
test('locks prevent edits and shutdown cancels timers and ignores late reads/writes', async () => {
  const s = setup(); await s.session.load(); s.session.edit('draft'); const release = s.session.hold();
  s.session.edit('blocked'); assert.equal(s.session.text, 'draft'); assert.equal(s.timers.size, 0);
  await s.session.flush(); release(); release(); assert.equal(s.session.locks, 0);
  s.session.edit('pending'); s.session.dispose(); await s.tick(3000); assert.equal(s.writes.length, 1);
  const late = Promise.withResolvers(); const options = { read: () => late.promise }; const t = setup(options);
  const reading = t.session.load(); options.alive = false; late.resolve(ok({ text: 'stale', version: 'late' })); await reading;
  assert.equal(t.session.loaded, false); t.session.dispose();
});
test('manual save cancels debounce, undo to saved text remains clean, and missing files are never recreated', async () => {
  const s = setup(); await s.session.load(); s.session.edit('temporary'); s.session.edit('# Note'); await s.tick(2000);
  assert.equal(s.writes.length, 0); s.session.edit('manual'); await s.session.flush(); assert.equal(s.timers.size, 0);
  s.session.edit('removed draft'); s.session.missing = true;
  assert.equal((await s.session.flush()).error.code, 'NOT_FOUND'); assert.equal(s.writes.length, 1); s.session.dispose();
});

test('a clean buffer cannot accept edits while an external reload is in flight', async () => {
  const options = {}; const s = setup(options); await s.session.load();
  const pending = Promise.withResolvers(); options.read = () => pending.promise;
  const reading = s.session.load(); assert.equal(s.session.loading, true);
  s.session.edit('must not race the read'); assert.equal(s.session.text, '# Note');
  pending.resolve(ok({ text: 'External content', version: 'v2' })); await reading;
  s.session.edit('after reload'); assert.equal(s.session.text, 'after reload'); s.session.dispose();
});

test('closing a session before its scheduled read starts performs no filesystem access', async () => {
  let reads = 0; const s = setup({ read() { reads++; return ok({ text: 'unexpected', version: 'v1' }); } });
  const reading = s.session.load(); s.session.dispose(); await reading;
  assert.equal(reads, 0); assert.equal(s.session.loaded, false);
});
