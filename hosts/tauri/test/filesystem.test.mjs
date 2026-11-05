import test from 'node:test';
import assert from 'node:assert/strict';
import { definePlugin } from '@lunaris/sdk';
import { TestScheduler } from '@lunaris/test';
import { Logger } from '@lunaris/logging';
import { Filesystem } from '@lunaris/filesystem';
import filesystem from '@lunaris/filesystem-provider';
import { createTauriFilesystemDriver } from '@lunaris/tauri-filesystem';
import { HostSession } from '@lunaris/tauri';

const manifest = (id, provides = [], requires = [], permissions = []) => ({ manifestVersion: 1, id, version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './index.js', provides, requires, permissions, optionalPermissions: [] });

test('host grants compose a real provider/driver chain; expected filesystem errors do not enter recovery', async () => {
  const retired = new Set(); const sessions = []; let fs;
  const driver = createTauriFilesystemDriver({ async request(session, operation) {
    if (operation === 'begin') {
      assert.ok(!retired.has(session), 'retry must not reuse a retired native session'); sessions.push(session);
    }
    if (operation === 'end') retired.add(session);
    if (operation === 'readText') return { ok: false, error: { code: 'NOT_FOUND', message: 'File does not exist' } };
    return { ok: true, value: null };
  } });
  const logger = definePlugin({ manifest: manifest('test.logger', [{ kind: 'api', id: Logger.id, version: '1.0.0' }]), activate(ctx) {
    ctx.provide(Logger, Object.fromEntries(['log', 'debug', 'info', 'warn', 'error'].map(name => [name, () => true])));
  } });
  const consumer = definePlugin({ manifest: manifest('test.app', [], [{ kind: 'api', id: Filesystem.id, range: '^1.0.0' }], ['filesystem.access']), activate(ctx) { fs = ctx.use(Filesystem); } });
  const session = new HostSession({ scheduler: new TestScheduler(), load: async () => ({
    plugins: [logger, driver, filesystem, consumer], entrypoints: ['test.app'],
    grants: { 'lunaris.tauri-filesystem': ['filesystem.native'], 'lunaris.filesystem-provider': ['filesystem.access'], 'test.app': ['filesystem.access'] },
  }) });
  for (let i = 0; i < 3; i++) {
    await session.start(); assert.equal(session.snapshot().phase, 'running');
    assert.equal((await fs.readText({ vaultId: 'v', path: 'missing.md' })).error.code, 'NOT_FOUND');
    await session.refresh(); assert.equal(session.snapshot().phase, 'running');
  }
  assert.equal(new Set(sessions).size, 3);
  await session.disable('lunaris.tauri-filesystem'); assert.equal(session.snapshot().phase, 'fallback');
  await session.enable('lunaris.tauri-filesystem'); assert.equal(session.snapshot().phase, 'running');
  await session.stop(); assert.equal(retired.size, sessions.length);
});

test('composition cannot grant an undeclared plugin permission', async () => {
  const plugin = definePlugin({ manifest: manifest('test.no-permission'), activate() { assert.fail('must reject grants before activation'); } });
  const session = new HostSession({ scheduler: new TestScheduler(), load: async () => ({ plugins: [plugin], entrypoints: ['test.no-permission'], grants: { 'test.no-permission': ['filesystem.access'] } }) });
  await session.start(); assert.equal(session.snapshot().phase, 'fallback');
  assert.equal(session.snapshot().kernel.plugins[0].state, 'registered');
  await session.stop();
});
