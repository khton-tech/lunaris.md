import test from 'node:test';
import assert from 'node:assert/strict';
import { Logger, LogSink, isLogInput, isLogRecord } from '@lunaris/logging';

test('API contracts reject missing methods and accessors without invoking them', () => {
  assert.equal(LogSink.validate({ write() {} }), true);
  assert.equal(LogSink.validate({}), false);
  assert.equal(LogSink.validate({ get write() { assert.fail('must not read accessor'); } }), false);
  assert.equal(Logger.validate({ log() {}, debug() {}, info() {}, warn() {}, error() {} }), true);
  assert.equal(Logger.validate({ log() {} }), false);
});

test('records require valid levels, source, message, optional code and a representable timestamp', () => {
  const input = { level: 'error', source: 'test.plugin', message: 'Save failed', error: new Error('disk') };
  assert.ok(isLogInput(input));
  assert.ok(isLogRecord({ ...input, timestamp: 0 }));
  for (const patch of [{ level: 'constructor' }, { level: 'fatal' }, { source: ' ' }, { message: '' }, { code: 4 }]) {
    assert.equal(isLogInput({ ...input, ...patch }), false);
  }
  for (const timestamp of [undefined, NaN, Infinity, 8.64e15 + 1, 'now']) {
    assert.equal(isLogRecord({ ...input, timestamp }), false);
  }
});
