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
  }, () => options.alive !== false, () => options.changed?.(), (...args) => logs.push(args), clock, options.draft);
  return { session, writes, timers, logs, async tick(delta) { now += delta; for (const [id, timer] of timers) if (timer.at <= now) { timers.delete(id); timer.callback(); } await new Promise(setImmediate); } };
}
test('autosave waits one second after the last edit and uses the loaded version', async () => {
  const s = setup(); await s.session.load(); assert.equal(AUTOSAVE_DELAY, 1000);
  s.session.edit('first'); await s.tick(500); assert.equal(s.writes.length, 0);
  s.session.edit('latest'); await s.tick(999); assert.equal(s.writes.length, 0);
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

test('a delayed save echo checks its version without locking input', async () => {
  const options = {}; const s = setup(options); await s.session.load();
  s.session.edit('saved text'); await s.session.flush();
  const pending = Promise.withResolvers(); options.read = () => pending.promise;
  const checking = s.session.refresh(); assert.equal(s.session.loading, false);
  s.session.edit('keep typing during the check');
  pending.resolve(ok({ text: 'saved text', version: s.session.version })); await checking;
  assert.equal(s.session.text, 'keep typing during the check'); assert.equal(s.session.dirty, true);
  s.session.dispose();
});

test('unchanged notifications stay quiet while genuine external changes still reload', async () => {
  const options = {}; const s = setup(options); await s.session.load();
  let reads = 0;
  options.read = async () => { reads++; assert.equal(s.session.loading, false); return ok({ text: '# Note', version: 'v1' }); };
  await s.session.refresh(); assert.equal(reads, 1); assert.equal(s.session.loading, false);
  options.read = async () => ok({ text: 'External replacement', version: 'v2' });
  await s.session.refresh(); assert.equal(s.session.text, 'External replacement'); assert.equal(s.session.version, 'v2');
  s.session.dispose();
});

test('external changes use one read without loading or reloading local recovery', async () => {
  let reads = 0; let draftReads = 0; let current = { text: '# Note', version: 'v1' };
  const s = setup({
    read: async () => { reads++; return ok(current); },
    draft: { load: async () => { draftReads++; return ok(null); }, save: async () => ok(null), remove: async () => ok(null) },
    changed: () => { if (reads > 1) assert.equal(s.session.loading, false); },
  });
  await s.session.load(); current = { text: 'External', version: 'v2' };
  await s.session.refresh();
  assert.equal(reads, 2); assert.equal(draftReads, 1);
  assert.equal(s.session.text, 'External'); assert.equal(s.session.savedText, 'External');
  assert.equal(s.session.dirty, false); s.session.dispose();
});

test('overlapping watch changes share their read and reconcile a later notification', async () => {
  const options = {}; const s = setup(options); await s.session.load();
  const pending = Promise.withResolvers(); let reads = 0;
  options.read = () => ++reads === 1 ? pending.promise : ok({ text: 'Newest', version: 'v3' });
  const first = s.session.refresh();
  const second = s.session.refresh(); const third = s.session.refresh();
  assert.equal(first, second); assert.equal(second, third); assert.equal(reads, 1);
  pending.resolve(ok({ text: 'Earlier', version: 'v2' })); await first;
  assert.equal(reads, 2); assert.equal(s.session.text, 'Newest');
  assert.equal(s.session.loading, false); s.session.dispose();
});

test('a failed external read retains the buffer and a later success clears the failure', async () => {
  const options = {}; const s = setup(options); await s.session.load();
  options.read = () => ({ ok: false, error: { code: 'NOT_FOUND', message: 'Removed' } });
  await s.session.refresh(); assert.equal(s.session.text, '# Note'); assert.equal(s.session.missing, true);
  options.read = () => ok({ text: '# Note', version: 'v1' });
  await s.session.refresh(); assert.equal(s.session.missing, false); assert.equal(s.session.error, null);
  s.session.dispose();
});

test('queued recovery writes persist only the latest snapshot after the active write', async () => {
  const pending = Promise.withResolvers(); const entered = Promise.withResolvers(); const writes = [];
  const s = setup({ draft: {
    load: async () => ok(null),
    async save(text) { writes.push(text); if (writes.length === 1) { entered.resolve(); await pending.promise; } return ok(null); },
    remove: async () => ok(null),
  } });
  await s.session.load(); s.session.edit('First'); await entered.promise;
  for (let i = 0; i < 100; i++) s.session.edit(`Next ${i}`);
  const latest = s.session.persistDraft(); assert.deepEqual(writes, ['First']);
  pending.resolve(); assert.equal((await latest).ok, true);
  assert.deepEqual(writes, ['First', 'Next 99']);
  assert.equal(s.session.draftSaved, true); assert.equal(s.session.hasUnprotectedChanges, false);
  s.session.dispose();
});

test('external reconciliation settles obsolete recovery after undo before accepting new disk content', async () => {
  const entered = Promise.withResolvers(); const release = Promise.withResolvers(); let stored; let writes = 0;
  let disk = { text: '# Note', version: 'v1' };
  const draft = {
    load: async () => ok(stored ?? null),
    async save(text, expectedVersion, revision) {
      if (++writes === 1) { entered.resolve(); await release.promise; }
      stored = { text, expectedVersion, revision }; return ok(null);
    },
    async remove(revision) { if (stored?.revision === revision) stored = undefined; return ok(null); },
  };
  const s = setup({ draft, read: () => ok(disk) }); await s.session.load();
  s.session.edit('Obsolete'); await entered.promise; s.session.edit('# Note');
  disk = { text: 'External', version: 'v2' };
  let finished = false; const refreshing = s.session.refresh().then(() => { finished = true; });
  await new Promise(setImmediate); assert.equal(finished, false); assert.equal(s.session.text, '# Note');
  release.resolve(); await refreshing;
  assert.equal(stored, undefined); assert.equal(s.session.text, 'External'); assert.equal(s.session.dirty, false);
  s.session.dispose();
  const reopened = setup({ draft, read: () => ok(disk) }); await reopened.session.load();
  assert.equal(reopened.session.text, 'External'); assert.equal(reopened.session.dirty, false); reopened.session.dispose();
});

test('typing during obsolete recovery cleanup cancels the external result without saving the new edit', async () => {
  const entered = Promise.withResolvers(); const release = Promise.withResolvers(); let stored;
  const options = { draft: {
    load: async () => ok(null),
    async save(text, expectedVersion, revision) { stored = { text, expectedVersion, revision }; return ok(null); },
    async remove(revision) { entered.resolve(); await release.promise; if (stored?.revision === revision) stored = undefined; return ok(null); },
  } };
  const s = setup(options); await s.session.load();
  s.session.edit('Obsolete'); await s.session.persistDraft(); s.session.edit('# Note'); await s.session.persistDraft();
  options.read = () => ok({ text: 'External', version: 'v2' });
  const refreshing = s.session.refresh(); await entered.promise;
  s.session.edit('Latest local edit'); await s.session.persistDraft(); release.resolve(); await refreshing;
  assert.equal(s.session.text, 'Latest local edit'); assert.equal(s.session.dirty, true);
  assert.equal(stored.text, 'Latest local edit'); assert.equal(s.writes.length, 0); s.session.dispose();
});

test('a refresh response cannot replace a buffer saved, relocated or closed during its read', async () => {
  for (const action of ['save', 'relocate', 'close']) {
    const options = {}; const s = setup(options); await s.session.load();
    const pending = Promise.withResolvers(); options.read = () => pending.promise;
    const checking = s.session.refresh();
    if (action === 'save') { s.session.edit('newer saved text'); await s.session.flush(); }
    else if (action === 'relocate') s.session.target = { vaultId: 'v', path: 'moved.md' };
    else s.session.dispose();
    pending.resolve(ok({ text: 'stale external text', version: 'stale' })); await checking;
    assert.equal(s.session.text, action === 'save' ? 'newer saved text' : '# Note'); s.session.dispose();
  }
});

test('closing a session before its scheduled read starts performs no filesystem access', async () => {
  let reads = 0; const s = setup({ read() { reads++; return ok({ text: 'unexpected', version: 'v1' }); } });
  const reading = s.session.load(); s.session.dispose(); await reading;
  assert.equal(reads, 0); assert.equal(s.session.loaded, false);
});

test('durable offline drafts restore even empty text and retain the expected remote version', async () => {
  let stored = null;
  const draft = { load: async () => ok(stored), save: async (text, expectedVersion, revision) => { stored = { text, expectedVersion, revision }; return ok(null); }, remove: async revision => { if (stored?.revision === revision) stored = null; return ok(null); } };
  const s = setup({ draft, write: async () => ({ ok: false, error: { code: 'OFFLINE', message: 'Disconnected' } }) });
  await s.session.load(); s.session.edit(''); await s.session.persistDraft(); assert.equal(s.session.draftSaved, true);
  assert.equal((await s.session.flush()).error.code, 'OFFLINE'); assert.equal(stored.text, ''); assert.equal(stored.expectedVersion, 'v1'); s.session.dispose();
  const restored = setup({ draft, read: async () => ({ ok: false, error: { code: 'OFFLINE', message: 'Disconnected' } }) });
  await restored.session.load(); assert.equal(restored.session.text, ''); assert.equal(restored.session.dirty, true); assert.equal(restored.session.loaded, true); assert.equal(restored.session.version, 'v1'); restored.session.dispose();
});
test('restored drafts never overwrite a newer remote version and storage failure is visible', async () => {
  const s = setup({ draft: { load: async () => ok({ text: 'local', expectedVersion: 'old', revision: 'r' }), save: async () => ({ ok: false, error: { code: 'IO_ERROR', message: 'Quota unavailable' } }), remove: async () => ok(null) } });
  await s.session.load(); assert.equal(s.session.error.code, 'CONFLICT'); assert.equal(s.session.text, 'local'); assert.equal(s.writes.length, 0);
  s.session.edit('latest'); await s.session.persistDraft(); assert.equal(s.session.draftError, true); assert.equal(s.session.draftSaved, false); s.session.dispose();
});
test('a late remote save acknowledges its own draft revision while newer edits remain durable', async () => {
  let stored; const removed = []; const entered = Promise.withResolvers(); const finish = Promise.withResolvers(); let count = 0;
  const draft = { load: async () => ok(null), save: async (text, expectedVersion, revision) => { stored = { text, expectedVersion, revision }; return ok(null); }, remove: async revision => { removed.push([revision, stored?.revision]); if (stored?.revision === revision) stored = null; return ok(null); } };
  const s = setup({ draft, write: async () => { if (++count === 1) { entered.resolve(); await finish.promise; } return ok({ version: `v${count + 1}` }); } });
  await s.session.load(); s.session.edit('first'); const saving = s.session.flush(); await entered.promise;
  s.session.edit('newer'); await s.session.persistDraft(); const newerRevision = stored.revision; finish.resolve(); await saving;
  assert.notEqual(removed[0][0], newerRevision); assert.equal(removed[0][1], newerRevision); assert.equal(s.session.dirty, false); assert.equal(stored, null); s.session.dispose();
});

test('clean flush settles delayed obsolete recovery writes before close', async()=>{
 let stored=null; const entered=Promise.withResolvers(),release=Promise.withResolvers(); let count=0;
 const draft={load:async()=>ok(stored),save:async(text,expectedVersion,revision)=>{if(++count===1){entered.resolve();await release.promise;}stored={text,expectedVersion,revision};return ok(null);},remove:async()=>{stored=null;return ok(null);}};
 const s=setup({draft});await s.session.load();s.session.edit('obsolete');await entered.promise;s.session.edit('# Note');
 assert.equal(s.session.dirty,false);assert.equal(s.session.hasUnprotectedChanges,true);
 let settled=false;const flush=s.session.flush().then(r=>{settled=true;return r;});await Promise.resolve();assert.equal(settled,false);
 release.resolve();assert.equal((await flush).ok,true);assert.equal(s.session.hasUnprotectedChanges,false);s.session.dispose();
 const reopened=setup({draft});await reopened.session.load();assert.equal(reopened.session.text,'# Note');assert.equal(reopened.session.dirty,false);reopened.session.dispose();
});
for(const thrown of [false,true]) test('failed durable discard retains buffer: thrown='+thrown,async()=>{
 const stored={text:'recover me',expectedVersion:'v1',revision:'r'};
 const s=setup({draft:{load:async()=>ok(stored),save:async()=>ok(null),remove:async()=>{if(thrown)throw Error('Storage');return {ok:false,error:{code:'IO_ERROR',message:'Storage'}};}}});
 await s.session.load();await s.session.load(true);assert.equal(s.session.text,'recover me');assert.equal(s.session.dirty,true);assert.equal(s.session.error.code,'IO_ERROR');s.session.dispose();
});

test('competing recovery candidates require selection and never autosave a hidden choice',async()=>{
 const records=['A','B'].map((text,index)=>({key:{server:'s',accountId:'a',vaultId:'v',path:'note.md',writerId:text},text,expectedVersion:'v1',revision:text,updatedAt:index}));const saved=[],removed=[];
 const s=setup({draft:{load:async()=>ok(records),save:async(text)=>{saved.push(text);return ok(null);},remove:async(revision,record)=>{removed.push([revision,record]);return ok(null);}}});
 await s.session.load();assert.equal(s.session.text,'# Note');assert.equal(s.session.recoveryCandidates.length,2);s.session.edit('silent');await s.tick(2000);assert.equal(s.writes.length,0);assert.deepEqual(saved,[]);
 s.session.selectRecovery(1);await s.session.persistDraft();assert.equal(s.session.text,'B');assert.equal(s.session.recoveryCandidates.length,0);assert.equal(s.writes.length,0);
 assert.equal((await s.session.flush()).ok,true);assert.equal(s.writes[0].text,'B');assert.ok(removed.some(([revision,record])=>revision==='B'&&record===records[1]));assert.equal(removed.some(([revision])=>revision==='A'),false);s.session.dispose();
});

test('discard waits for delayed draft saves and cannot leave discarded text for reopen',async()=>{
 let stored=null;const entered=Promise.withResolvers(),release=Promise.withResolvers();
 const draft={load:async()=>ok(stored),save:async(text,expectedVersion,revision)=>{entered.resolve();await release.promise;stored={text,expectedVersion,revision};return ok(null);},remove:async revision=>{if(stored?.revision===revision)stored=null;return ok(null);}};
 const s=setup({draft});await s.session.load();s.session.edit('Discard');await entered.promise;const discarding=s.session.load(true);await Promise.resolve();assert.equal(s.session.text,'Discard');release.resolve();await discarding;
 assert.equal(stored,null);assert.equal(s.session.text,'# Note');assert.equal(s.session.dirty,false);s.session.dispose();const reopened=setup({draft});await reopened.session.load();assert.equal(reopened.session.text,'# Note');reopened.session.dispose();
});
test('failed acknowledgement cleanup stays protected and retries on clean flush',async()=>{
 let calls=0;const s=setup({draft:{load:async()=>ok(null),save:async()=>ok(null),remove:async()=>++calls===1?{ok:false,error:{code:'IO_ERROR',message:'Transient'}}:ok(null)}});
 await s.session.load();s.session.edit('Saved');assert.equal((await s.session.flush()).ok,false);assert.equal(s.session.dirty,false);assert.equal(s.session.hasUnprotectedChanges,true);
 assert.equal((await s.session.flush()).ok,true);assert.equal(s.session.hasUnprotectedChanges,false);assert.equal(calls,2);s.session.dispose();
});

test('discard does not acknowledge an unsettled failed draft write',async()=>{
 const s=setup({draft:{load:async()=>ok(null),save:async()=>({ok:false,error:{code:'IO_ERROR',message:'Storage failure'}}),remove:async()=>{assert.fail('failed recovery write must be surfaced before discard');}}});
 await s.session.load();s.session.edit('Retain');await s.session.persistDraft();await s.session.load(true);assert.equal(s.session.text,'Retain');assert.equal(s.session.dirty,true);assert.equal(s.session.draftError,true);s.session.dispose();
});
