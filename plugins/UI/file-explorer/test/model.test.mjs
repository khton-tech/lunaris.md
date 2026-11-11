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

function setup(overrides = {}, relocated) {
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
  const model = new ExplorerModel('vault', fs, () => active, () => {}, (...args) => logs.push(args), relocated);
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
