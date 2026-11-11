import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import execution from '@lunaris/quickjs-execution';
import { setupWorkspace, flush } from '../../../tools/test/workspace.mjs';

test('the documented counter runs in QuickJS inside Workspace and restores its Vault setting', async () => {
  const recipe = await readFile(new URL('../../../DOCS/guides/plugin-recipes.md', import.meta.url), 'utf8');
  const block = type => recipe.match(new RegExp('```' + type + '\\r?\\n([\\s\\S]+?)\\r?\\n```'))[1];
  const manifest = {
    manifestVersion: 1, id: 'test.counter-recipe', version: '1.0.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './plugin.js',
    provides: [], optionalPermissions: [], ...JSON.parse(block('json')),
  };
  const contents = block('ts').replace('import manifest from "../manifest.json" with { type: "json" };', 'const manifest = ' + JSON.stringify(manifest) + ';');
  const result = await build({ stdin: { contents, loader: 'ts', resolveDir: process.cwd() }, bundle: true, platform: 'neutral', format: 'esm', write: false });
  const workspace = await setupWorkspace({ settings: true, pluginRuntime: true, plugins: [execution] });
  try {
    await workspace.open();
    const vaultId = workspace.service.current().id;
    const env = { vaultId, generation: 1 };
    const runtime = workspace.tools.runtime;
    assert.equal((await runtime.open(env)).ok, true);
    const registered = await runtime.register(env, manifest, { entry: 'plugin.js', modules: { 'plugin.js': result.outputFiles[0].text } }, true);
    assert.equal(registered.ok, true, JSON.stringify(workspace.logs));
    await flush();
    const increment = [...workspace.surface.querySelectorAll('button')].find(button => button.textContent === 'Increase');
    assert.ok(increment);
    increment.click();
    await flush();
    assert.equal(workspace.preferences.get('count'), 1);
    assert.deepEqual(workspace.preferenceWrites.find(write => write.key === 'count').target, { scope: 'vault', vaultId });
    assert.equal((await runtime.disable(env, manifest.id)).ok, true);
    await flush();
    assert.equal(workspace.tools.settings.snapshot().items.some(item => item.id === manifest.id + '.counter-value'), false);
    assert.equal((await runtime.enable(env, manifest.id)).ok, true);
    await flush();
    assert.equal(workspace.tools.settings.snapshot().items.find(item => item.id === manifest.id + '.counter-value').value, 1);
  } finally {
    await workspace.stop();
  }
});
