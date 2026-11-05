import test from 'node:test';
import assert from 'node:assert/strict';
import { format } from 'node:util';
import { readFile } from 'node:fs/promises';
import { definePlugin } from '@lunaris/sdk';
import { createTestKernel } from '@lunaris/test';
import { LogSink } from '@lunaris/logging';
import { createDevToolsLogger } from '@lunaris/dev-tools-logger';

async function setup(options) {
  const host = createTestKernel(); let sink;
  host.register(createDevToolsLogger(options));
  host.register(definePlugin({ manifest: { manifestVersion: 1, id: 'test.writer', version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './writer.js',
    provides: [], requires: [{ kind: 'api', id: LogSink.id, range: '^1.0.0' }], permissions: [], optionalPermissions: [] },
  activate(ctx) { sink = ctx.use(LogSink); } }));
  await host.start('test.writer');
  return { host, sink };
}

test('native severity, readable single-line labels and original error objects survive formatting', async () => {
  const calls = []; const output = Object.fromEntries(['debug', 'info', 'warn', 'error'].map(level => [level, (...args) => calls.push({ level, args })]));
  const { host, sink } = await setup({ output });
  const error = new Error('Disk failure'); const data = { path: 'note.md' };
  const timestamp = new Date(2026, 10, 5, 14, 32, 7, 104).getTime();
  for (const level of ['debug', 'info', 'warn', 'error']) {
    assert.equal(sink.write({ timestamp, level, source: 'file\nprovider', message: 'Cannot save %c%s\ndocument', code: 'FILE_WRITE_FAILED', data, error }), true);
    const call = calls.at(-1);
    assert.equal(call.level, level);
    assert.match(format(...call.args.slice(0, -2)), /14:32:07\.104\s+(DEBUG|INFO|WARN|ERROR)\s+\[file provider\] Cannot save %c%s document · FILE_WRITE_FAILED/);
    assert.equal(call.args.at(-1), error); assert.equal(call.args.at(-2), data);
    assert.ok(!call.args.some(value => typeof value === 'string' && value.includes('\n')));
  }
  assert.equal(sink.write({ timestamp: NaN, level: 'error', source: 'test', message: 'Invalid' }), false);
  assert.equal(calls.length, 4);
  await host.stopAll(); host.assertNoResources();
});

test('the supplied ASCII artwork prints once across activation/recovery cycles', async () => {
  const calls = []; const art = await readFile(new URL('../../../../../resources/ascii_art.txt', import.meta.url), 'utf8');
  const output = Object.fromEntries(['debug', 'info', 'warn', 'error'].map(level => [level, (...args) => calls.push(args)]));
  const { host } = await setup({ output, banner: { art, caption: 'Lunaris.md · v0.1.0 · Tauri' } });
  assert.equal(calls.length, 1); assert.equal(calls[0][1], art.trimEnd());
  for (let i = 0; i < 3; i++) {
    await host.stopAll(); host.assertNoResources(); await host.start('test.writer');
  }
  assert.equal(calls.length, 1);
  await host.stopAll(); host.assertNoResources();
});
