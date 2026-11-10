import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createTestKernel } from '@lunaris/test';
import { definePlugin } from '@lunaris/sdk';
import { Logger } from '@lunaris/logging';
import { LimePackagePicker } from '@lunaris/lime';
import { createLupPicker } from '@lunaris/lup-picker';

async function fixture() {
  const dom = new JSDOM('<body></body>'); const kernel = createTestKernel(); let api;
  kernel.installMock(Logger, { log() { return true; }, debug() { return true; }, info() { return true; }, warn() { return true; }, error() { return true; } });
  kernel.register(createLupPicker(dom.window.document));
  kernel.register(definePlugin({ manifest: { manifestVersion: 1, id: 'test.manager', version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './index.js', provides: [], requires: [{ kind: 'api', id: LimePackagePicker.id, range: '^1.0.0' }], permissions: ['runtime.manage'], optionalPermissions: [] }, activate(ctx) { api = ctx.use(LimePackagePicker); } }));
  kernel.grant('test.manager', 'runtime.manage'); await kernel.start('test.manager');
  return { kernel, dom, api, input: () => dom.window.document.querySelector('input') };
}

test('picker reads only the selected bytes, supports cancellation and rejects concurrent dialogs', async () => {
  const f = await fixture(); const owner = new AbortController();
  const pending = f.api.pick(owner.signal); const input = f.input(); assert.equal(input.accept, '.lup');
  assert.equal((await f.api.pick(owner.signal)).error.code, 'BUSY');
  Object.defineProperty(input, 'files', { value: [{ name: 'plugin.LUP', size: 3, async arrayBuffer() { return new Uint8Array([1, 2, 3]).buffer; } }] });
  input.dispatchEvent(new f.dom.window.Event('change'));
  assert.deepEqual((await pending).value, new Uint8Array([1, 2, 3])); assert.equal(f.input(), null);
  const cancel = f.api.pick(owner.signal); f.input().dispatchEvent(new f.dom.window.Event('cancel'));
  assert.deepEqual(await cancel, { ok: true, value: null }); await f.kernel.stopAll(); f.dom.window.close();
});

test('owner/driver cancellation releases pending input and discards late bytes', async () => {
  const f = await fixture(); const owner = new AbortController(); const gate = Promise.withResolvers();
  const pending = f.api.pick(owner.signal); const input = f.input();
  Object.defineProperty(input, 'files', { value: [{ name: 'plugin.lup', size: 1, arrayBuffer() { return gate.promise; } }] });
  input.dispatchEvent(new f.dom.window.Event('change')); owner.abort();
  assert.deepEqual(await pending, { ok: true, value: null }); assert.equal(f.input(), null);
  gate.resolve(new Uint8Array([1]).buffer); await Promise.resolve();
  const other = f.api.pick(new AbortController().signal); await f.kernel.stopAll();
  assert.deepEqual(await other, { ok: true, value: null }); assert.equal(f.input(), null); f.dom.window.close();
});

test('invalid extension/size is rejected before reading selected content', async () => {
  const f = await fixture(); const pending = f.api.pick(new AbortController().signal); let read = false; const input = f.input();
  Object.defineProperty(input, 'files', { value: [{ name: 'plugin.exe', size: 1, arrayBuffer() { read = true; } }] });
  input.dispatchEvent(new f.dom.window.Event('change')); assert.equal((await pending).error.code, 'INVALID_PACKAGE'); assert.equal(read, false);
  await f.kernel.stopAll(); f.dom.window.close();
});
