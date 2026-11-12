import test from 'node:test';
import assert from 'node:assert/strict';
import { ExplorerModel, topLevel } from '../dist/src/model.js';

const info = (path, kind = 'file') => ({ path, kind, size: 0, modifiedAt: null });
const ok = value => ({ ok: true, value });
const fail = code => ({ ok: false, error: { code, message: code } });
test('background scans publish structural changes and failures without loading pulses', async () => {
  let entries = [info('note.md')]; let failure = false; const states = [];
  const model = new ExplorerModel('vault', { async list() { return failure ? fail('IO_ERROR') : ok(entries); } },
    () => true, () => states.push({ loading: model.loading, error: model.error }), () => {});
  await model.refresh(); states.length = 0;
  entries = [{ ...info('note.md'), size: 42, modifiedAt: 100 }];
  await model.refresh(true); assert.deepEqual(states, []);
  entries = [info('renamed.md')]; await model.refresh(true);
  assert.equal(states.length, 1); assert.deepEqual(model.tree().map(item => item.id), ['renamed.md']);
  failure = true; await model.refresh(true); assert.equal(states.at(-1).error, 'IO_ERROR');
  failure = false; await model.refresh(true); assert.equal(states.at(-1).error, '');
  entries = []; await model.refresh(true); assert.deepEqual(model.tree(), []);
  assert.ok(states.every(state => state.loading === 0));
});

function setup(overrides = {}, relocated, changed = () => {}) {
  const entries = new Map([['folder', info('folder', 'directory')], ['folder/note.md', info('folder/note.md')], ['a.md', info('a.md')]]);
  const calls = []; const logs = []; let active = true;
  const fs = {
    async list(target) { calls.push(['list', target]); return ok([...entries.values()].filter(item => item.path.slice(0, Math.max(0, item.path.lastIndexOf('/'))) === target.path)); },
    async createDirectory(target) { calls.push(['mkdir', target]); if (entries.has(target.path)) return fail('ALREADY_EXISTS'); entries.set(target.path, info(target.path, 'directory')); return ok(null); },
    async writeText(target, text, options) { calls.push(['write', target, text, options]); if (entries.has(target.path)) return fail('ALREADY_EXISTS'); entries.set(target.path, info(target.path)); return ok({ version: '1' }); },
    async move(source, destination, overwrite) {
      calls.push(['move', source, destination, overwrite]);
      if (entries.has(destination.path)) return fail('ALREADY_EXISTS');
      if (!entries.has(source.path)) return fail('NOT_FOUND');
      for (const [path, item] of [...entries]) if (path === source.path || path.startsWith(source.path + '/')) { entries.delete(path); const next = destination.path + path.slice(source.path.length); entries.set(next, { ...item, path: next }); }
      return ok(null);
    },
    async copy(source, destination, overwrite) { calls.push(['copy', source, destination, overwrite]); if (entries.has(destination.path)) return fail('ALREADY_EXISTS'); if (!entries.has(source.path)) return fail('NOT_FOUND'); entries.set(destination.path, info(destination.path)); return ok(null); },
    async remove(target, recursive) { calls.push(['remove', target, recursive]); entries.delete(target.path); return ok(null); },
    ...overrides,
  };
  const model = new ExplorerModel('vault', fs, () => active, changed, (...args) => logs.push(args), relocated);
  return { model, calls, entries, logs, stop() { active = false; } };
}
test('toolbar sorting keeps folders first and expand all loads nested visible directories', async () => {
  const s = setup();
  s.entries.set('z.md', info('z.md'));
  s.entries.set('folder/nested', info('folder/nested', 'directory'));
  s.entries.set('folder/nested/deep.md', info('folder/nested/deep.md'));
  s.entries.set('.hidden', info('.hidden', 'directory'));
  s.entries.set('link', info('link', 'symlink'));
  await s.model.refresh(); s.model.sort('desc');
  assert.deepEqual(s.model.tree().map(entry => entry.id), ['folder', 'z.md', 'link', 'a.md']);
  await s.model.expandAll();
  assert.deepEqual([...s.model.expanded], ['folder', 'folder/nested']);
  assert.equal(s.model.tree()[0].children[0].children[0].id, 'folder/nested/deep.md');
  assert.equal(s.calls.some(call => ['.hidden', 'link'].includes(call[1].path)), false);
  assert.equal(s.model.expanding, false);
  s.stop(); s.model.sort('asc'); await s.model.expandAll();
  assert.equal(s.model.sortDirection, 'desc');
});

test('expand all stops loading after its Vault scope closes', async () => {
  let finish;
  const s = setup({ list: () => new Promise(resolve => { finish = resolve; }) });
  const expanding = s.model.expandAll(); s.stop();
  finish(ok([info('old', 'directory')])); await expanding;
  assert.equal(s.model.directories.size, 0); assert.equal(s.model.expanding, false);
});

test('lazy directories, folder-first sorting and portable create policy', async () => {
  const { model, calls } = setup(); await model.refresh();
  assert.deepEqual(model.tree().map(item => item.id), ['folder', 'a.md']);
  assert.deepEqual(model.tree()[0].children, []);
  assert.equal(calls.filter(call => call[0] === 'list').length, 1);
  model.toggle('folder', true); await new Promise(resolve => setImmediate(resolve));
  assert.equal(model.tree()[0].children[0].id, 'folder/note.md');
  assert.equal(await model.create('folder', 'new.md', false), true);
  assert.deepEqual(calls.find(call => call[0] === 'write'), ['write', { vaultId: 'vault', path: 'folder/new.md' }, '', { mode: 'create' }]);
  assert.equal(await model.create('', '../bad', false), false); assert.equal(model.error, 'INVALID_PATH');
  assert.equal(await model.create('', 'a.md', false), false); assert.equal(model.error, 'ALREADY_EXISTS');
});

test('dot directories and their subtrees are hidden while dot files remain ordinary files', async () => {
  const s = setup(); s.entries.set('.lunaris', info('.lunaris', 'directory')); s.entries.set('.env', info('.env'));
  s.entries.set('folder/.git', info('folder/.git', 'directory')); s.entries.set('folder/.git/config', info('folder/.git/config'));
  await s.model.refresh(); await s.model.load('folder');
  assert.deepEqual(s.model.tree().map(entry => entry.id), ['folder', '.env', 'a.md']);
  assert.deepEqual(s.model.tree()[0].children.map(entry => entry.id), ['folder/note.md']);
  assert.equal(s.calls.some(call => call[0] === 'list' && call[1].path.startsWith('.lunaris')), false);
});
test('rename preserves expanded state and remaps selection after confirmed filesystem success', async () => {
  const { model, calls } = setup(); await model.refresh(); model.toggle('folder', true); await model.load('folder'); model.select(['folder/note.md']);
  assert.equal(await model.rename('folder', 'renamed'), true);
  assert.deepEqual(model.selection, ['renamed/note.md']); assert.equal(model.expanded.has('renamed'), true);
  assert.equal(model.tree().find(item => item.id === 'renamed').children[0].id, 'renamed/note.md');
  assert.equal(calls.find(call => call[0] === 'move')[3], false);
});
test('multi-item transfers normalize ancestors, reject cycles, keep partial successes and never overwrite', async () => {
  const { model, calls, entries } = setup(); await model.refresh();
  assert.deepEqual(topLevel(['folder', 'folder/note.md', 'folder']), ['folder']);
  assert.equal(await model.transfer(['folder'], 'folder/nested', false), false);
  assert.equal(calls.some(call => call[0] === 'move'), false);
  entries.set('folder/a.md', info('folder/a.md'));
  assert.equal(await model.transfer(['a.md', 'missing.md'], 'folder', false), false);
  assert.equal(entries.has('a.md'), true);
  assert.equal(await model.transfer(['a.md', 'missing.md'], '', true), false);
  assert.ok(calls.filter(call => call[0] === 'copy').every(call => call[3] === false));
});
test('pending filesystem results never mutate a stopped session or redirect to a new Vault', async () => {
  let resolve; const pending = new Promise(yes => { resolve = yes; });
  const { model, stop, calls } = setup({ list: () => pending });
  const load = model.load(''); stop(); resolve(ok([info('stale.md')])); await load;
  assert.deepEqual(model.tree(), []); assert.equal(await model.create('', 'new.md', false), false); assert.deepEqual(calls, []);
});
test('refresh prunes removed directory subtrees and stale asynchronous scans', async () => {
  const { model, entries } = setup(); await model.refresh(); await model.load('folder'); model.select(['folder/note.md']);
  entries.delete('folder'); await model.refresh();
  assert.equal(model.directories.has('folder'), false); assert.deepEqual(model.selection, []);
});
test('large directories retain all entries as data; no recursive filesystem scan', async () => {
  const items = Array.from({ length: 10000 }, (_, index) => info(`note-${index}.md`)); let calls = 0;
  const { model } = setup({ list: async () => { calls++; return ok(items); } });
  await model.refresh(); assert.equal(model.tree().length, 10000); assert.equal(calls, 1);
});


test('partial cut/paste preserves failed sources in the buffer and reports retained successes', async () => {
  const { model, entries } = setup();
  entries.set('b.md', info('b.md')); entries.set('folder/a.md', info('folder/a.md'));
  await model.refresh(); model.buffer(['a.md', 'b.md'], true);
  assert.equal(await model.paste('folder'), false);
  assert.equal(model.error, 'PARTIAL_FAILURE'); assert.deepEqual(model.clipboard, { paths: ['a.md'], cut: true });
  assert.equal(entries.has('a.md'), true); assert.equal(entries.has('b.md'), false); assert.equal(entries.has('folder/b.md'), true);
});


test('creation and paste into unopened directories load their contents before settling', async () => {
  const { model } = setup(); await model.refresh();
  assert.equal(model.directories.has('folder'), false);
  assert.equal(await model.create('folder', 'created.md', false), true);
  assert.ok(model.tree()[0].children.some(item => item.id === 'folder/created.md'));
  assert.deepEqual(model.selection, ['folder/created.md']);
  const s = setup(); await s.model.refresh(); s.model.buffer(['a.md'], false);
  assert.equal(await s.model.paste('folder'), true);
  assert.ok(s.model.tree()[0].children.some(item => item.id === 'folder/a.md'));
});


test('a late initial scan cannot restore a directory removed during expansion', async () => {
  let resolve; const pending = new Promise(yes => { resolve = yes; }); let root = [info('folder', 'directory')];
  const { model } = setup({ list: async target => target.path === '' ? ok(root) : pending });
  await model.refresh(); const expanding = model.load('folder'); root = []; await model.refresh();
  resolve(ok([info('folder/stale.md')])); await expanding;
  assert.equal(model.directories.has('folder'), false); assert.deepEqual(model.tree(), []);
});


test('active document relocation is notified only after confirmed moves, never copies or failures', async () => {
  const relocated = []; const s = setup({}, async (...args) => { relocated.push(args); });
  await s.model.refresh();
  assert.equal(await s.model.rename('a.md', 'renamed.md'), true);
  assert.deepEqual(relocated, [['a.md', 'renamed.md']]);
  assert.equal(await s.model.transfer(['renamed.md'], 'folder', true), true);
  assert.equal(relocated.length, 1);
  assert.equal(await s.model.rename('renamed.md', 'folder'), false);
  assert.equal(relocated.length, 1);
  assert.equal(await s.model.transfer(['renamed.md'], 'folder', false), false);
  assert.equal(relocated.length, 1);
});

test('creation reads only its destination and keeps loading stable across a warm tree', async () => {
  const states = []; const s = setup({}, undefined, () => states.push({ loading: s.model.loading, busy: s.model.busy }));
  for (let index = 0; index < 20; index++) s.entries.set('folder-' + index, info('folder-' + index, 'directory'));
  await s.model.refresh(); await s.model.expandAll(); s.calls.length = 0; states.length = 0;
  assert.equal(await s.model.create('folder', 'created.md', false), true);
  assert.deepEqual(s.calls.filter(call => call[0] === 'list').map(call => call[1].path), ['folder']);
  assert.ok(states.every(state => state.loading === 0));
  assert.equal(states.at(-1).busy, false);
  const snapshot = s.model.tree(); s.model.select(['folder']); s.model.buffer(['a.md'], false);
  assert.equal(s.model.tree(), snapshot);
  s.model.sort('desc'); assert.notEqual(s.model.tree(), snapshot);
});

test('background refresh commits root and descendant changes as one immutable tree snapshot', async () => {
  const pending = Promise.withResolvers(); const states = []; let changing = false;
  const s = setup({ list: async target => {
    if (changing && target.path === 'folder') return pending.promise;
    return ok(target.path ? [info('folder/note.md')] : [info('folder', 'directory'), info(changing ? 'new.md' : 'old.md')]);
  } }, undefined, () => states.push(s.model.tree()));
  await s.model.refresh(); await s.model.load('folder'); const previous = s.model.tree(); states.length = 0;
  changing = true; const refresh = s.model.refresh(true); await new Promise(resolve => setImmediate(resolve));
  assert.equal(s.model.tree(), previous); assert.equal(states.length, 0);
  pending.resolve(ok([info('folder/changed.md')])); await refresh;
  assert.equal(states.length, 1);
  assert.deepEqual(s.model.tree().map(item => item.id), ['folder', 'new.md']);
  assert.equal(s.model.tree()[0].children[0].id, 'folder/changed.md');
  assert.equal(previous[0].children[0].id, 'folder/note.md');
});

test('superseded scan rejections cannot replace a newer successful listing with an error', async () => {
  const pending = Promise.withResolvers(); let first = true;
  const s = setup({ list: () => { if (first) { first = false; return pending.promise; } return Promise.resolve(ok([info('current.md')])); } });
  const old = s.model.load(''); await s.model.load(''); const snapshot = s.model.tree();
  pending.reject(new Error('Old request failed')); await old;
  assert.equal(s.model.error, ''); assert.deepEqual(s.logs, []); assert.equal(s.model.tree(), snapshot);
});

test('confirmed directory relocation retains its loaded descendants before document notification', async () => {
  let s;
  s = setup({}, async () => {
    const tree = s.model.tree();
    assert.equal(tree.some(item => item.id === 'folder'), false);
    assert.equal(tree.find(item => item.id === 'renamed').children[0].id, 'renamed/note.md');
  });
  await s.model.refresh(); await s.model.load('folder'); s.model.expanded.add('folder'); s.calls.length = 0;
  assert.equal(await s.model.rename('folder', 'renamed'), true);
  assert.deepEqual(s.calls.filter(call => call[0] === 'list').map(call => call[1].path), ['']);
  assert.deepEqual([...s.model.expanded], ['renamed']);
});

test('structural mutation invalidates an older background scan without restoring stale names', async () => {
  const pending = Promise.withResolvers(); let blocked = false;
  const s = setup({ list: async target => blocked ? pending.promise : ok([info('a.md')]) });
  await s.model.refresh(); blocked = true; const refresh = s.model.refresh(true);
  blocked = false; assert.equal(await s.model.create('', 'new.md', false), true);
  const snapshot = s.model.tree(); pending.resolve(ok([info('obsolete.md')]));
  assert.equal(await refresh, false); assert.equal(s.model.tree(), snapshot); assert.equal(s.model.error, '');
});

test('normalized subtree operations never rescan a removed source descendant', async () => {
  const moving = setup(); moving.entries.set('destination', info('destination', 'directory'));
  await moving.model.refresh(); await moving.model.load('folder'); moving.calls.length = 0;
  assert.equal(await moving.model.transfer(['folder', 'folder/note.md'], 'destination', false), true);
  assert.equal(moving.model.error, '');
  assert.deepEqual(moving.calls.filter(call => call[0] === 'list').map(call => call[1].path), ['', 'destination']);
  const removing = setup(); await removing.model.refresh(); await removing.model.load('folder'); removing.calls.length = 0;
  assert.equal(await removing.model.remove(['folder', 'folder/note.md']), true);
  assert.deepEqual(removing.calls.filter(call => call[0] === 'list').map(call => call[1].path), ['']);
  assert.equal(removing.model.error, '');
});

test('completed scans and repeated file removal release their revision bookkeeping', async () => {
  const s = setup(); await s.model.refresh();
  for (let index = 0; index < 50; index++) {
    const path = 'temporary-' + index + '.md';
    assert.equal(await s.model.create('', path, false), true);
    assert.equal(await s.model.remove([path]), true);
  }
  assert.equal(s.model.scans.size, 0);
  assert.equal(s.model.directories.size, 1);
});

test('folder disclosure during creation loads its children after the mutation settles', async () => {
  const pending = Promise.withResolvers(); const s = setup({ writeText: () => pending.promise });
  await s.model.refresh(); s.calls.length = 0;
  const creating = s.model.create('', 'created.md', false); s.model.toggle('folder', true);
  await new Promise(resolve => setImmediate(resolve)); assert.deepEqual(s.calls, []);
  pending.resolve(ok({ version: '1' })); assert.equal(await creating, true); await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(s.model.tree()[0].children.map(item => item.id), ['folder/note.md']);
  assert.deepEqual(s.calls.filter(call => call[0] === 'list').map(call => call[1].path), ['', 'folder']);
});

test('expand all waits for creation and discovers descendants through the settled tree', async () => {
  const pending = Promise.withResolvers(); const s = setup({ writeText: () => pending.promise });
  s.entries.set('folder/nested', info('folder/nested', 'directory')); s.entries.set('folder/nested/deep.md', info('folder/nested/deep.md'));
  await s.model.refresh(); s.calls.length = 0;
  const creating = s.model.create('', 'created.md', false); const expanding = s.model.expandAll();
  await new Promise(resolve => setImmediate(resolve)); assert.deepEqual(s.calls, []);
  pending.resolve(ok({ version: '1' })); assert.equal(await creating, true); await expanding;
  assert.deepEqual([...s.model.expanded], ['folder', 'folder/nested']);
  assert.equal(s.model.tree()[0].children[0].children[0].id, 'folder/nested/deep.md');
});

test('an expanding directory follows its confirmed rename across a pending initial listing', async () => {
  const pending = Promise.withResolvers(); let blocked = true;
  const s = setup({ list: async target => {
    if (target.path === 'folder' && blocked) return pending.promise;
    return ok([...s.entries.values()].filter(item => parent(item.path) === target.path));
  } });
  const parent = path => path.slice(0, Math.max(0, path.lastIndexOf('/')));
  await s.model.refresh(); const expanding = s.model.expandAll(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(await s.model.rename('folder', 'renamed'), true);
  blocked = false; pending.resolve(ok([info('folder/stale.md')])); await expanding;
  assert.deepEqual([...s.model.expanded], ['renamed']);
  assert.equal(s.model.tree()[0].children[0].id, 'renamed/note.md'); assert.equal(s.model.error, '');
});

test('pending nested expansion retires its old path when an ancestor is renamed', async () => {
  const pending = Promise.withResolvers(); const lists = [];
  const parent = path => path.slice(0, Math.max(0, path.lastIndexOf('/')));
  const s = setup({ async list(target) {
    lists.push(target.path);
    if (target.path === 'folder/nested') return pending.promise;
    if (target.path && !s.entries.has(target.path)) return fail('NOT_FOUND');
    return ok([...s.entries.values()].filter(item => parent(item.path) === target.path));
  } });
  s.entries.set('folder/nested', info('folder/nested', 'directory')); s.entries.set('folder/nested/deep.md', info('folder/nested/deep.md'));
  await s.model.refresh(); const expanding = s.model.expandAll(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(await s.model.rename('folder', 'renamed'), true);
  pending.resolve(ok([info('folder/nested/stale.md')])); await expanding;
  assert.equal(lists.filter(path => path === 'folder/nested').length, 1);
  assert.deepEqual([...s.model.expanded], ['renamed', 'renamed/nested']);
  assert.equal(s.model.tree()[0].children[0].children[0].id, 'renamed/nested/deep.md'); assert.equal(s.model.error, '');
});

test('targeted updates recover every previously failed directory before clearing its error', async () => {
  const lists = []; let failure = false;
  const s = setup({ async list(target) {
    lists.push(target.path);
    if (failure && target.path === 'folder') return fail('IO_ERROR');
    return ok(target.path ? [info('folder/note.md')] : [info('folder', 'directory'), info('a.md')]);
  } });
  await s.model.refresh(); await s.model.load('folder'); failure = true;
  await s.model.refresh(true); assert.equal(s.model.error, 'IO_ERROR'); lists.length = 0;
  await s.model.refresh(true, ['']); assert.deepEqual(lists, ['', 'folder']); assert.equal(s.model.error, 'IO_ERROR');
  failure = false; lists.length = 0;
  await s.model.refresh(true, ['']); assert.deepEqual(lists, ['', 'folder']); assert.equal(s.model.error, '');
});

test('a successful mutation retains an unresolved listing failure in another directory', async () => {
  let failure = false;
  const s = setup({ async list(target) {
    if (failure && target.path === 'folder') return fail('IO_ERROR');
    return ok(target.path ? [info('folder/note.md')] : [info('folder', 'directory'), info('a.md')]);
  } });
  await s.model.refresh(); await s.model.load('folder'); failure = true; await s.model.refresh(true);
  assert.equal(s.model.error, 'IO_ERROR'); assert.equal(await s.model.create('', 'created.md', false), true);
  assert.equal(s.model.error, 'IO_ERROR');
});

test('a concurrent directory failure retires a targeted scan until complete recovery', async () => {
  const pending = Promise.withResolvers(); let blocked = false; let failure = false;
  const root = [info('folder', 'directory'), info('a.md')];
  const s = setup({ async list(target) {
    if (target.path === '') return blocked ? pending.promise : ok(root);
    return failure ? fail('IO_ERROR') : ok([info('folder/note.md')]);
  } });
  await s.model.refresh(); await s.model.load('folder'); blocked = true;
  const refreshing = s.model.refresh(true, ['']); failure = true; await s.model.load('folder', true);
  blocked = false; pending.resolve(ok(root)); assert.equal(await refreshing, false);
  assert.equal(s.model.error, 'IO_ERROR'); assert.equal(s.model.scans.size, 0);
  failure = false; assert.equal(await s.model.refresh(true, ['']), true); assert.equal(s.model.error, '');
});

test('retry includes expanded directories whose first listing failed before caching', async () => {
  const lists = []; let failure = true;
  const s = setup({ async list(target) {
    lists.push(target.path);
    if (target.path === '') return ok([info('folder', 'directory')]);
    if (target.path === 'folder') return ok([info('folder/nested', 'directory')]);
    return failure ? fail('IO_ERROR') : ok([info('folder/nested/note.md')]);
  } });
  await s.model.refresh(); s.model.toggle('folder', true); await new Promise(resolve => setImmediate(resolve));
  s.model.toggle('folder/nested', true); await new Promise(resolve => setImmediate(resolve));
  assert.equal(s.model.directories.has('folder/nested'), false); assert.equal(s.model.error, 'IO_ERROR');
  failure = false; lists.length = 0; await s.model.refresh(true, ['']);
  assert.deepEqual(lists, ['', 'folder', 'folder/nested']); assert.equal(s.model.error, '');
  assert.equal(s.model.tree()[0].children[0].children[0].id, 'folder/nested/note.md');
});
