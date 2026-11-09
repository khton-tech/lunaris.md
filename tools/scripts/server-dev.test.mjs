import test from 'node:test';
import assert from 'node:assert/strict';
import { developmentConfig, restartQueue } from './server-dev.mjs';

test('development keeps absolute data roots and policy while aligning browser and API origins', () => {
  const original = Object.freeze({ host: '0.0.0.0', port: 9000, publicOrigin: 'https://notes.example',
    metadataDirectory: '/private/metadata', userDataDirectory: '/private/files', registration: 'invitation' });
  const config = developmentConfig(original);
  assert.equal(config.publicOrigin, 'http://127.0.0.1:3101'); assert.equal(config.port, 3100);
  assert.equal(config.host, '127.0.0.1'); assert.equal(config.metadataDirectory, original.metadataDirectory);
  assert.equal(config.userDataDirectory, original.userDataDirectory); assert.equal(config.registration, 'invitation');
  assert.equal(original.port, 9000);
});

test('restart queue serializes bursts and discards pending work after shutdown', async () => {
  const first = Promise.withResolvers(); const second = Promise.withResolvers(); let calls = 0; let active = 0;
  const failures = [];
  const queue = restartQueue(async () => {
    assert.equal(++active, 1); calls++;
    await (calls === 1 ? first.promise : second.promise); active--;
  }, error => failures.push(error));
  queue.request(); queue.request(); queue.request();
  assert.equal(calls, 1); first.resolve(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 2); queue.request(); queue.close(); second.resolve();
  await new Promise(resolve => setImmediate(resolve));
  queue.request(); assert.equal(calls, 2); assert.deepEqual(failures, []);
});
