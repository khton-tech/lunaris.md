import assert from 'node:assert/strict';
import { createTestKernel } from '@lunaris/test';
import { defineApi, definePlugin } from '@lunaris/sdk';
import { Logger } from '@lunaris/logging';
import { PluginExecution } from '@lunaris/execution';
import execution from '@lunaris/quickjs-execution';

assert.equal(typeof globalThis.gc, 'function');
const kernel = createTestKernel(); let loader; let service;
kernel.installMock(Logger, Object.fromEntries(['log', 'debug', 'info', 'warn', 'error'].map(name => [name, () => true])));
kernel.register(execution);
const manifest = (id, requires = [], provides = [], permissions = []) => ({ manifestVersion: 1, id, version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './plugin.js', requires, provides, permissions, optionalPermissions: [] });
kernel.register(definePlugin({ manifest: manifest('test.loader', [{ kind: 'api', id: PluginExecution.id, range: '^1.0.0' }], [], ['runtime.manage']), activate(ctx) { loader = ctx.use(PluginExecution); } }));
kernel.grant('test.loader', 'runtime.manage'); await kernel.start('test.loader');
const Api = defineApi({ id: 'test.callbacks', version: '1.0.0' });
const metadata = manifest('test.package', [], [{ kind: 'api', id: Api.id, version: Api.version }]);
const code = `export default {manifest:${JSON.stringify(metadata)},activate(ctx){ctx.provide({kind:'api',id:'test.callbacks',version:'1.0.0'},{make(){return Array.from({length:20},(_,i)=>()=>i);},async later(){return 5;}});}};`;
const owner = new AbortController();
kernel.register(loader.load(metadata, { entry: 'plugin.js', modules: { 'plugin.js': code } }, { vaultId: 'vault-a', generation: 1 }, owner.signal), { ownerId: execution.manifest.id });
kernel.register(definePlugin({ manifest: manifest('test.reader', [{ kind: 'api', id: Api.id, range: '^1.0.0' }]), activate(ctx) { service = ctx.use(Api); } }));
await kernel.start('test.reader');
for (let index = 0; index < 600; index++) {
  let callbacks = service.make(); assert.equal(callbacks[3](), 3); callbacks = null;
  if (index % 10 === 0) { globalThis.gc(); await new Promise(resolve => setImmediate(resolve)); }
}
for (let index = 0; index < 4500; index++) {
  assert.equal(await service.later(), 5);
  if (index % 20 === 0) { globalThis.gc(); await new Promise(resolve => setImmediate(resolve)); }
}
await kernel.stopAll(); kernel.assertNoResources();
process.stdout.write('Reclamation passed: 12000 transient callbacks and 4500 async calls.\n');
