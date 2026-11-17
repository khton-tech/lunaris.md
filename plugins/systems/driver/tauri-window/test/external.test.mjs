import test from 'node:test';
import assert from 'node:assert/strict';
import { createExternalWindowPort } from '../dist/src/external.js';

const options = { title: 'Window', size: { width: 320, height: 200 } };
async function setup(overrides = {}) {
  let cleanup; let observer; let id;
  const operations = [];
  const ctx = { pluginId: 'test.driver', scope: { own(resource) { cleanup = resource.dispose; } } };
  const port = {
    async open(nextId, ...args) { id = nextId; return overrides.open ? overrides.open(...args) : {}; },
    async listen(callback) { observer = callback; return () => { observer = undefined; }; },
    async operate(_id, operation) { operations.push(operation.kind); await overrides.operate?.(operation); },
  };
  const api = await createExternalWindowPort(ctx, { debug() {}, error() {} }, port);
  return { api, operations, cleanup, nativeClose: () => observer(id) };
}

test('native close settles the handle and aborts the mounted surface', async () => {
  const fixture = await setup();
  const { value } = await fixture.api.open(options, new AbortController().signal);
  const closed = value.closed;
  fixture.nativeClose();
  await closed;
  assert.equal(value.signal.aborted, true);
  assert.equal((await value.show()).error.code, 'CANCELLED');
  assert.equal((await value.close()).ok, true);
  await fixture.cleanup();
  assert.deepEqual(fixture.operations, []);
});

test('owner cancellation during creation also releases the pending native ticket', async () => {
  const creation = Promise.withResolvers();
  const fixture = await setup({ open: () => creation.promise });
  const owner = new AbortController();
  const opening = fixture.api.open(options, owner.signal);
  owner.abort();
  creation.reject(new Error('Window owner stopped'));
  assert.equal((await opening).error.code, 'CANCELLED');
  await fixture.cleanup();
  assert.deepEqual(fixture.operations, ['close']);
});

test('the external window driver forwards named placement and layer choices', async () => {
  const openings = []; const moves = [];
  const fixture = await setup({
    open(options) { openings.push(options); return {}; },
    operate(operation) { if (operation.kind === 'move') moves.push(operation.position); },
  });
  const { value } = await fixture.api.open({ ...options, position: 'bottom-right', layer: 'bottom' }, new AbortController().signal);
  assert.deepEqual(openings, [{ ...options, position: 'bottom-right', layer: 'bottom' }]);
  assert.equal((await value.move('center-left')).ok, true);
  assert.equal((await value.move('center')).error.code, 'INVALID_ARGUMENT');
  assert.equal((await value.move({ x: -100, y: 40 })).ok, true);
  assert.deepEqual(moves, ['center-left', { x: -100, y: 40 }]);
  await fixture.cleanup();
});
