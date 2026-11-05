import test from 'node:test';
import assert from 'node:assert/strict';
import { isStartupSnapshot } from '@lunaris/startup';

test('startup payloads reject invalid phases, raw errors, counters and accessors', () => {
  assert.equal(isStartupSnapshot({ sequence: 1, state: 'loading', stage: 'activation', pluginId: 'example.app' }), true);
  assert.equal(isStartupSnapshot({ sequence: 2, state: 'loaded', stage: 'ready' }), true);
  for (const value of [null, {}, { sequence: -1, state: 'loaded', stage: 'ready' },
    { sequence: 1, state: 'loaded', stage: 'activation' },
    { sequence: 1, state: 'failed', stage: 'failed', error: new Error('private') },
    { get sequence() { throw Error('must not run'); }, state: 'loaded', stage: 'ready' }]) {
    assert.equal(isStartupSnapshot(value), false);
  }
});
