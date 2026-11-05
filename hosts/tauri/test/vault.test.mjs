import test from 'node:test';
import assert from 'node:assert/strict';
import { definePlugin } from '@lunaris/sdk';
import { TestScheduler } from '@lunaris/test';
import { Logger } from '@lunaris/logging';
import { Vault } from '@lunaris/vault';
import { ApplicationDirectory, Filesystem } from '@lunaris/filesystem';
import filesystem from '@lunaris/filesystem-provider';
import vaultManager from '@lunaris/vault-manager';
import { createTauriFilesystemDriver } from '@lunaris/tauri-filesystem';
import { HostSession } from '@lunaris/tauri';

const manifest = (id, provides = [], requires = [], permissions = []) => ({ manifestVersion: 1, id, version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './index.js', provides, requires, permissions, optionalPermissions: [] });

test('host composes Vault Manager and application storage through SDK grants and resets context on retry', async () => {
  let manager; let directory; let fs; let signal; let selects = 0; let ended = 0;
  const driver = createTauriFilesystemDriver({ async request(session, operation) {
    if (operation === 'selectVault') { selects++; return { ok: true, value: { id: `vault-${selects}`, name: 'Notes' } }; }
    if (operation === 'openConfig') return { ok: true, value: { id: 'application', name: 'Settings' } };
    if (operation === 'end') ended++;
    return { ok: true, value: null };
  } });
  const logger = definePlugin({ manifest: manifest('test.logger', [{ kind: 'api', id: Logger.id, version: '1.0.0' }]), activate(ctx) {
    ctx.provide(Logger, Object.fromEntries(['log', 'debug', 'info', 'warn', 'error'].map(name => [name, () => true])));
  } });
  const consumer = definePlugin({ manifest: manifest('test.app', [], [Vault, ApplicationDirectory, Filesystem].map(token => ({ kind: 'api', id: token.id, range: '^1.0.0' })), ['vault.access', 'filesystem.access', 'filesystem.app-config']), activate(ctx) {
    manager = ctx.use(Vault); directory = ctx.use(ApplicationDirectory); fs = ctx.use(Filesystem); signal = ctx.signal;
  } });
  const session = new HostSession({ scheduler: new TestScheduler(), load: async () => ({
    plugins: [logger, driver, filesystem, vaultManager, consumer], entrypoints: ['test.app'], grants: {
      'lunaris.tauri-filesystem': ['filesystem.native'],
      'lunaris.filesystem-provider': ['filesystem.access', 'filesystem.app-config'],
      'lunaris.vault-manager': ['filesystem.access'],
      'test.app': ['vault.access', 'filesystem.access', 'filesystem.app-config'],
    },
  }) });
  await session.start(); assert.equal(session.snapshot().phase, 'running'); assert.equal(selects, 0);
  assert.equal((await directory.openConfig(signal)).value.id, 'application'); assert.equal(manager.current(), null);
  assert.equal((await manager.open()).value.id, 'vault-1');
  assert.equal((await manager.close()).ok, true);
  assert.equal((await fs.stat({ vaultId: 'vault-1', path: '' })).error.code, 'VAULT_CLOSED');
  await session.refresh(); assert.equal(session.snapshot().phase, 'running');
  assert.equal((await manager.open()).value.id, 'vault-2');
  await session.start(); assert.equal(manager.current(), null); assert.equal(ended, 1);
  assert.equal(session.snapshot().phase, 'running');
  await session.stop(); assert.equal(ended, 2); assert.equal(session.snapshot().phase, 'stopped');
});
