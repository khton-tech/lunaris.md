import test from 'node:test';
import assert from 'node:assert/strict';
import { createApplicationExecution } from '@lunaris/application-host';
import { createTestKernel } from '@lunaris/test';
import { defineApi, definePlugin } from '@lunaris/sdk';
import { Logger } from '@lunaris/logging';
import { Vault } from '@lunaris/vault';
import { LimeRuntime } from '@lunaris/lime';
import { createLimeRuntime } from '../dist/lime-runtime.js';

const manifest = (id, fields = {}) => ({ manifestVersion: 1, id, version: '1.0.0', engine: '^0.1.0', sdk: '^0.1.0',
  entry: './plugin.js', provides: [], requires: [], permissions: [], optionalPermissions: [], ...fields });
const requirement = token => ({ kind: token.kind, id: token.id, range: '^1.0.0' });
const methods = Object.fromEntries(['log', 'debug', 'info', 'warn', 'error'].map(name => [name, () => true]));
const env = { vaultId: 'shared-vault', generation: 1 };

test('built-in and installed plugins use the same permission check, host objects and activation cleanup', async () => {
  const kernel = createTestKernel();
  kernel.installMock(Logger, methods);
  kernel.installMock(Vault, { current: () => null, open: async () => ({ ok: true, value: null }), close: async () => ({ ok: true, value: null }) });
  const Native = defineApi({ id: 'test.native-capability', version: '1.0.0', consumePermission: 'test.native' });
  const active = new Set();
  const makeResource = id => new (class NativeResource {
    open(owner) { active.add(id); owner.addEventListener('abort', () => active.delete(id), { once: true }); }
  })();
  kernel.installMock(Native, { open: makeResource });
  let evaluated = 0;
  const driver = createApplicationExecution(code => import('data:text/javascript;base64,' + Buffer.from(code + '\n// ' + ++evaluated).toString('base64')));
  kernel.register(driver);
  kernel.register(createLimeRuntime(kernel, [driver.manifest.id]));
  kernel.grant('lunaris.lime-runtime-adapter', 'runtime.manage');

  let runtime;
  kernel.register(definePlugin({ manifest: manifest('test.manager', { requires: [requirement(LimeRuntime)], permissions: ['runtime.manage'] }),
    activate(ctx) { runtime = ctx.use(LimeRuntime); } }));
  kernel.grant('test.manager', 'runtime.manage');
  await kernel.start('test.manager');
  assert.equal((await runtime.open(env)).ok, true);

  const fields = { requires: [requirement(Native)], permissions: ['test.native'] };
  kernel.register(definePlugin({ manifest: manifest('test.builtin', fields), activate(ctx) { ctx.use(Native).open(ctx.pluginId).open(ctx.signal); } }));
  kernel.grant('test.builtin', 'test.native');
  await kernel.start('test.builtin');

  const installed = manifest('test.installed', fields);
  const source = { entry: 'plugin.js', modules: { 'plugin.js': `export default { manifest: ${JSON.stringify(installed)},
    activate(ctx) {
      if (ctx.resources.text('assets/check.txt') !== 'shared') throw Error('missing asset');
      const resource = ctx.use(${JSON.stringify(Native)}).open(ctx.pluginId);
      resource.open(ctx.signal);
    }
  };` }, resources: { 'assets/check.txt': [...new TextEncoder().encode('shared')] } };
  assert.equal((await runtime.register(env, installed, source, false)).ok, true);
  assert.equal(evaluated, 0);
  assert.equal((await runtime.enable(env, installed.id)).ok, true);
  assert.deepEqual([...active].sort(), ['test.builtin', 'test.installed']);
  assert.equal((await runtime.disable(env, installed.id)).ok, true);
  assert.deepEqual([...active], ['test.builtin']);
  assert.equal((await runtime.enable(env, installed.id)).ok, true);
  assert.equal(evaluated, 2);
  assert.equal((await runtime.close(env)).ok, true);
  await kernel.stopAll();
  assert.equal(active.size, 0);
  kernel.assertNoResources();
});
