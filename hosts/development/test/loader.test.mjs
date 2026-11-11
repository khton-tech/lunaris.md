import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, symlink } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { validateLocalPlugin, loadLocalPlugins } from '@lunaris/development';

const prefix = path.join(tmpdir(), 'lunaris-host-');
async function fixture(t, changes = {}, source) {
  const root = await mkdtemp(prefix);
  t.after(async () => { assert.ok(path.resolve(root).startsWith(prefix)); await rm(root, { recursive: true, force: true }); });
  const manifest = { manifestVersion: 1, id: 'test.local', version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './plugin.mjs', provides: [], requires: [], permissions: [], optionalPermissions: [], ...changes };
  await writeFile(path.join(root, 'manifest.json'), JSON.stringify(manifest));
  await writeFile(path.join(root, 'plugin.mjs'), source ?? `import { definePlugin } from ${JSON.stringify(import.meta.resolve('@lunaris/sdk'))}; export default definePlugin({ manifest: ${JSON.stringify(manifest)}, activate(ctx) { ctx.scope.own({dispose(){}}); } });`);
  return root;
}
test('valid local module loads through the public host and cleans up real timers', async t => {
  const root = await fixture(t); const session = await loadLocalPlugins([root]);
  assert.equal(session.kernel.inspect().plugins[0].state, 'registered');
  await session.start(); assert.equal(session.kernel.inspect().plugins[0].state, 'active');
  await session.stop(); assert.equal(session.kernel.inspect().plugins[0].ownedResources, 0);
});

test('author plugins receive the normal replaceable Logger and bounded original diagnostics without console output', async t => {
  const data = { manifestVersion: 1, id: 'test.local', version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './plugin.mjs', provides: [], requires: [{ kind: 'api', id: 'lunaris.logger', range: '^1.0.0' }], permissions: [], optionalPermissions: [] };
  const root = await fixture(t, { requires: data.requires }, `import {definePlugin} from ${JSON.stringify(import.meta.resolve('@lunaris/sdk'))}; import {Logger} from ${JSON.stringify(import.meta.resolve('@lunaris/logging'))}; export default definePlugin({manifest:${JSON.stringify(data)},activate(ctx){const logger=ctx.use(Logger);logger.info(ctx.pluginId,'Author ready');logger.error(ctx.pluginId,'Author operation failed',{error:new Error('original developer error')});}});`);
  const session = await loadLocalPlugins([root]); await session.start();
  assert.ok(session.logs().some(record => record.source === 'test.local' && record.message === 'Author ready'));
  assert.equal(session.logs().find(record => record.message === 'Author operation failed').error.message, 'original developer error');
  assert.ok(Object.isFrozen(session.logs())); await session.stop();
});
test('metadata and engine checks fail before entry evaluation', async t => {
  for (const change of [{ entry: './../escape.mjs' }, { engine: '^9.0.0' }, { version: 'invalid' }]) {
    const root = await fixture(t, change, 'throw new Error("must not evaluate");');
    await assert.rejects(loadLocalPlugins([root]), error => ['MANIFEST_INVALID', 'VERSION_INCOMPATIBLE'].includes(error.code));
  }
});
test('all roots are validated before evaluating even the first module', async t => {
  const good = await fixture(t, {}, 'throw new Error("first module was evaluated");');
  const bad = await fixture(t, { id: 'test.bad', engine: '^9.0.0' });
  await assert.rejects(loadLocalPlugins([good, bad]), { code: 'VERSION_INCOMPATIBLE' });
});
test('real-path containment rejects a directory link escape', async t => {
  const root = await fixture(t); const outside = await fixture(t, { id: 'test.outside' });
  await symlink(outside, path.join(root, 'external'), process.platform === 'win32' ? 'junction' : 'dir');
  const manifest = JSON.parse(await (await import('node:fs/promises')).readFile(path.join(root, 'manifest.json'), 'utf8'));
  manifest.entry = './external/plugin.mjs'; await writeFile(path.join(root, 'manifest.json'), JSON.stringify(manifest));
  await assert.rejects(validateLocalPlugin(root), { code: 'LOAD_PATH_INVALID' });
});
test('entry drift and malformed exports are readable load errors', async t => {
  const root = await fixture(t); const manifest = JSON.parse(await (await import('node:fs/promises')).readFile(path.join(root, 'manifest.json'), 'utf8'));
  manifest.version = '0.1.1'; await writeFile(path.join(root, 'manifest.json'), JSON.stringify(manifest));
  await assert.rejects(loadLocalPlugins([root]), { code: 'MANIFEST_DRIFT' });
  const invalid = await fixture(t, {}, 'export default {};'); await assert.rejects(loadLocalPlugins([invalid]), { code: 'LOAD_ENTRY_INVALID' });
});
