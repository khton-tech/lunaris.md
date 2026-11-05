import test from 'node:test';
import assert from 'node:assert/strict';
import { definePlugin } from '@lunaris/sdk';
import { createTestKernel } from '@lunaris/test';
import { Logger, LogSink } from '@lunaris/logging';
import { createLogger } from '@lunaris/logger';
import { createDevToolsLogger } from '@lunaris/dev-tools-logger';

function consumer(activate) {
  return definePlugin({ manifest: { manifestVersion: 1, id: 'test.consumer', version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './consumer.js',
    provides: [], requires: [{ kind: 'api', id: Logger.id, range: '^1.0.0' }], permissions: [], optionalPermissions: [] },
  activate(ctx) { activate(ctx.use(Logger), ctx); } });
}

test('SDK consumer delivers structured records, filters levels and preserves error/data identity', async () => {
  const host = createTestKernel(); const records = []; let logger;
  const failure = new Error('disk full'); const data = { path: 'example.md' };
  host.installMock(LogSink, { write(record) { records.push(record); return true; } });
  host.register(createLogger()); host.register(consumer(api => { logger = api; }));
  await host.start('test.consumer');
  assert.equal(records.shift().code, 'LOGGER_READY');
  assert.equal(logger.debug('test.consumer', 'Hidden'), false);
  assert.equal(logger.error('test.consumer', 'Cannot save document', { code: 'FILE_WRITE_FAILED', error: failure, data }), true);
  const record = records[0];
  assert.equal(record.source, 'test.consumer'); assert.equal(record.level, 'error');
  assert.equal(record.code, 'FILE_WRITE_FAILED'); assert.equal(record.error, failure); assert.equal(record.data, data);
  assert.ok(Object.isFrozen(record)); assert.ok(Number.isFinite(record.timestamp));
  for (const input of [null, { level: 'fatal', source: 'test', message: 'No' }, { level: 'info', source: '', message: 'No' }]) {
    assert.equal(logger.log(input), false);
  }
  assert.equal(records.length, 1);
  await host.stopAll(); host.assertNoResources();
  assert.throws(() => logger.info('test.consumer', 'Stale'), { code: 'SCOPE_CLOSED' });
});

test('host selects interchangeable sinks without changing the consumer', async () => {
  const host = createTestKernel(); const writes = [[], []];
  const ids = writes.map((records, index) => host.installMock(LogSink, { write(record) { records.push(record); return true; } }, { id: `test.sink-${index}` }));
  host.register(createLogger()); host.register(consumer(api => api.warn('test.consumer', 'Selected sink')));
  for (const [index, id] of ids.entries()) {
    host.selectProvider('lunaris.logger', 'api', LogSink.id, id);
    await host.start('test.consumer'); await host.stopAll(); host.assertNoResources();
    assert.equal(writes[index].filter(record => record.message === 'Selected sink').length, 1);
  }
});

test('minimum level and undelivered/reentrant writes have explicit results', async () => {
  const host = createTestKernel(); let logger; let writes = 0;
  host.installMock(LogSink, { write() {
    writes++;
    assert.equal(logger.error('test.consumer', 'Recursive output'), false);
    return false;
  } });
  host.register(createLogger({ minimumLevel: 'error' })); host.register(consumer(api => { logger = api; }));
  await host.start('test.consumer');
  assert.equal(logger.warn('test.consumer', 'Filtered'), false);
  assert.equal(logger.error('test.consumer', 'Undelivered'), false);
  assert.equal(writes, 1); assert.deepEqual(host.diagnostics(), []);
  await host.stopAll(); host.assertNoResources();
});

test('console failures stay within the driver and do not produce fatal SDK diagnostics', async () => {
  const host = createTestKernel(); let logger;
  const fail = () => { throw new Error('Console unavailable'); };
  host.register(createDevToolsLogger({ output: { debug: fail, info: fail, warn: fail, error: fail }, banner: { art: 'LUNARIS', caption: 'test' } }));
  host.register(createLogger()); host.register(consumer(api => { logger = api; }));
  await host.start('test.consumer');
  assert.equal(logger.error('test.consumer', 'Save failed'), false);
  host.assertState('test.consumer', 'active'); assert.deepEqual(host.diagnostics(), []);
  await host.stopAll(); host.assertNoResources();
});

test('stopping the sink stops dependent consumers and supports clean restart', async () => {
  const host = createTestKernel(); let logger;
  const id = host.installMock(LogSink, { write() { return true; } });
  host.register(createLogger()); host.register(consumer(api => { logger = api; }));
  await host.start('test.consumer'); const stale = logger;
  await host.stop(id); host.assertNoResources();
  host.assertState('lunaris.logger', 'stopped'); host.assertState('test.consumer', 'stopped');
  await host.start('test.consumer');
  assert.throws(() => stale.info('test.consumer', 'Old handle'), { code: 'SCOPE_CLOSED' });
  assert.equal(logger.info('test.consumer', 'New handle'), true);
  await host.stopAll(); host.assertNoResources();
});
