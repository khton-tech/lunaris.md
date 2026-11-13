import test from 'node:test';
import assert from 'node:assert/strict';
import { Logger } from '@lunaris/logging';
import { SessionCredentials } from '@lunaris/remote';
import { definePlugin } from '@lunaris/sdk';
import { createTauriCredentials } from '@lunaris/tauri-credentials';
import { createTestKernel } from '@lunaris/test';

test('credential bridge delegates valid sessions and rejects malformed data', async () => {
  const session = { server: 'https://example.test', account: { id: 'account-1', login: 'owner' }, token: 'test-token' };
  const malformed = { ...session, token: '' };
  const calls = [];
  let stored = session;
  const driver = createTauriCredentials(async (operation, value) => {
    calls.push([operation, value]);
    return { ok: true, value: operation === 'load' ? stored : null };
  });
  const consumerId = 'test.credentials-consumer';
  const kernel = createTestKernel({ initialGrants: {
    [driver.manifest.id]: ['credentials.native'],
    [consumerId]: ['credentials.access'],
  } });
  const log = () => true;
  kernel.installMock(Logger, { log, debug: log, info: log, warn: log, error: log });
  kernel.register(driver);
  let credentials;
  kernel.register(definePlugin({
    manifest: { manifestVersion: 1, id: consumerId, version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './index.js',
      provides: [], requires: [{ kind: 'api', id: SessionCredentials.id, range: '^1.0.0' }],
      permissions: ['credentials.access'], optionalPermissions: [] },
    activate(ctx) { credentials = ctx.use(SessionCredentials); },
  }));
  try {
    await kernel.start(consumerId);
    assert.deepEqual(await credentials.load(), { ok: true, value: session });
    assert.deepEqual(await credentials.save(session), { ok: true, value: null });
    assert.deepEqual(await credentials.remove(session.token), { ok: true, value: null });
    assert.equal((await credentials.save(malformed)).error.code, 'INVALID_ARGUMENT');
    stored = malformed;
    assert.equal((await credentials.load()).error.code, 'INVALID_ARGUMENT');
    assert.deepEqual(calls, [['load', undefined], ['save', session], ['remove', session.token], ['load', undefined]]);
  } finally {
    await kernel.stopAll();
    kernel.assertNoResources();
  }
});
