import test from 'node:test';
import assert from 'node:assert/strict';
import { definePlugin } from '@lunaris/sdk';
import { ActiveDocument, ActiveDocumentChanged, DocumentStatistics, DocumentStatisticsChanged } from '@lunaris/active-document';
import { FilesystemSources } from '@lunaris/filesystem';
import { AccountSession, AccountSessionChanged, ConnectionStatus, ConnectionChanged } from '@lunaris/remote';
import { ApplicationDom } from '@lunaris/components';
import { inspectLup } from '@lunaris/lup';
import statusBar from '@lunaris/status-bar';
import { packDrema } from '../../../../tools/scripts/lime-drema.mjs';
import { setupWorkspace, flush } from '../../../../tools/test/workspace.mjs';
const ok = value => ({ ok: true, value });
const fail = () => ({ ok: false, error: { code: 'UNSUPPORTED', message: 'Local storage' } });
async function setup(withStatistics = true, options = {}) {
 const state = { active: null, statistics: null, remote: null, connection: null, account: null }; let publisher;
 const tokens = [ActiveDocument, ActiveDocumentChanged, FilesystemSources, ConnectionStatus, ConnectionChanged, AccountSession, AccountSessionChanged,
  ...(withStatistics ? [DocumentStatistics, DocumentStatisticsChanged] : [])];
 const provider = definePlugin({ manifest: { manifestVersion: 1, id: 'test.status-data', version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './index.js',
  provides: tokens.map(t => ({ kind: t.kind, id: t.id, version: t.version })), requires: [], permissions: [], optionalPermissions: [] }, activate(ctx) {
   publisher = ctx;
   ctx.provide(ActiveDocument, { current: () => state.active, open: async () => ok(null), close: async () => ok(null), relocate: async () => ok(null), reconcile: async () => ok(null) });
   ctx.provide(FilesystemSources, { list: () => [], location: fail, locationVisible: () => true, capabilitiesFor: fail, remoteIdentity: () => state.remote ? ok(state.remote) : fail() });
   ctx.provide(ConnectionStatus, { current: () => state.connection });
   ctx.provide(AccountSession, { current: () => state.account, connect: async () => fail(), register: async () => fail(), login: async () => fail(), logout: async () => ok(null) });
   if (withStatistics) ctx.provide(DocumentStatistics, { current: () => state.statistics });
 } });
 const s = await setupWorkspace({ ...options, plugins: [provider, statusBar, ...options.plugins ?? []], entrypoints: [statusBar.manifest.id, ...options.entrypoints ?? []],
   grants: { ...options.grants, [statusBar.manifest.id]: statusBar.manifest.permissions } });
 return { ...s, state, async emit(token, value) { await publisher.events.emit(token, value); await flush(); } };
}
test('composed status bar shows local document counts, hides stale counts and follows Vault lifecycle', async () => {
 const s = await setup();
 try {
  assert.equal(s.surface.querySelector('.lm-status-bar'), null); await s.open();
  const bar = s.surface.querySelector('.lm-status-bar'); assert.ok(bar); assert.ok(bar.textContent.includes('No file open'));
  assert.equal(bar.closest('.lm-root').style.backgroundColor, 'transparent');
  assert.equal(bar.closest('.lm-root').dataset.sizing, 'content'); assert.equal(bar.closest('.lm-root').style.flex, '1 1 auto'); assert.equal(bar.closest('.lm-root').style.containerType, 'normal');
  assert.equal(bar.closest('.lm-workspace-bottom').parentElement.classList.contains('lm-workspace-main-pane'), true);
  s.state.active = { vaultId: s.service.current().id, path: 'folder/Пример.md' };
  s.state.statistics = { target: s.state.active, state: 'ready', words: 2, letters: 9 };
  await s.emit(ActiveDocumentChanged, { current: s.state.active });
  assert.equal(s.surface.querySelector('.lm-status-bar'), bar); assert.ok(bar.textContent.includes('Пример')); assert.ok(!bar.textContent.includes('Пример.md'));
  assert.equal(bar.querySelector('.lm-status-file').title, 'folder/Пример.md'); assert.ok(bar.querySelector('[aria-label="Words: 2"]')); assert.ok(bar.querySelector('[aria-label="Letters: 9"]')); assert.equal(bar.querySelector('.lm-status-counts').textContent, 'Words: 2Letters: 9'); assert.equal(bar.querySelector('.lm-status-server'), null);
  s.state.statistics = { ...s.state.statistics, words: 4, letters: 20 }; await s.emit(DocumentStatisticsChanged, { current: s.state.statistics }); assert.ok(bar.querySelector('[aria-label="Letters: 20"]'));
  s.state.active = { ...s.state.active, path: 'other.md' }; await s.emit(ActiveDocumentChanged, { current: s.state.active }); assert.equal(bar.querySelector('.lm-status-counts'), null);
  s.state.statistics = { target: s.state.active, state: 'loading', words: null, letters: null }; await s.emit(DocumentStatisticsChanged, { current: s.state.statistics }); assert.equal(bar.querySelector('.lm-status-counts'), null);
  await s.open(); assert.ok(s.surface.querySelector('.lm-status-bar').textContent.includes('No file open'));
  await s.service.close(); await flush(); assert.equal(s.surface.querySelector('.lm-status-bar'), null);
 } finally { await s.stop(); }
});
test('server status matches the selected root and account epoch, including offline, expiry and recovery', async () => {
 const s = await setup();
 try {
  await s.open(); s.state.remote = { server: 'https://notes.example', accountId: 'a', vaultId: 'remote-vault' };
  s.state.connection = { server: 'https://notes.example', epoch: 'e1', state: 'connected' };
  s.state.account = { server: 'https://notes.example', account: { id: 'a', login: 'alice' }, epoch: 'e1' };
  await s.emit(ConnectionChanged, { state: 'connected', epoch: 'e1' });
  const bar = s.surface.querySelector('.lm-status-bar'); assert.equal(bar.querySelector('.lm-status-server').getAttribute('aria-label'), 'Server connected');
  s.state.connection.state = 'offline'; await s.emit(ConnectionChanged, { state: 'offline', epoch: 'e1' }); assert.equal(bar.querySelector('.lm-status-server').getAttribute('aria-label'), 'Server offline');
  s.state.connection.epoch = 'old'; await s.emit(ConnectionChanged, { state: 'offline', epoch: 'old' }); assert.equal(bar.querySelector('.lm-status-server').getAttribute('aria-label'), 'Server status unknown');
  s.state.connection = { server: 'https://elsewhere.example', epoch: 'e1', state: 'connected' }; await s.emit(ConnectionChanged, { state: 'connected', epoch: 'e1' }); assert.equal(bar.querySelector('.lm-status-server').getAttribute('aria-label'), 'Server status unknown');
  s.state.connection = { server: 'https://notes.example', epoch: 'e2', state: 'expired' }; s.state.account = null;
  await s.emit(AccountSessionChanged, { current: null }); assert.equal(bar.querySelector('.lm-status-server').getAttribute('aria-label'), 'Session expired');
  s.state.connection.state = 'connected'; s.state.account = { server: 'https://notes.example', account: { id: 'a', login: 'alice' }, epoch: 'e2' };
  await s.emit(AccountSessionChanged, { current: s.state.account }); assert.equal(bar.querySelector('.lm-status-server').getAttribute('aria-label'), 'Server connected');
  s.state.remote = null; await s.emit(ConnectionChanged, { state: 'connected', epoch: 'e2' }); assert.equal(bar.querySelector('.lm-status-server'), null);
 } finally { await s.stop(); }
});
test('status bar remains available without an editor statistics provider', async () => {
 const s = await setup(false); try { await s.open(); const bar = s.surface.querySelector('.lm-status-bar'); assert.ok(bar); assert.equal(bar.querySelector('.lm-status-counts'), null); } finally { await s.stop(); }
});

test('an installed Drema package uses the same live DOM SDK as a built-in and edits the existing status bar', async () => {
  const { createApplicationExecution } = await import('@lunaris/application-host');
  const execution = createApplicationExecution(source => import('data:text/javascript;base64,' + Buffer.from(source).toString('base64')));
  let builtInRoot;
  const probe = definePlugin({ manifest: { manifestVersion: 1, id: 'test.dom-probe', version: '1.0.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './probe.js',
    provides: [], requires: [{ kind: 'api', id: ApplicationDom.id, range: '^1.0.0' }], permissions: ['ui.dom'], optionalPermissions: [] },
    activate(ctx) { builtInRoot = ctx.use(ApplicationDom).root(); },
  });
  const s = await setup(true, { pluginRuntime: true, plugins: [execution, probe], entrypoints: [probe.manifest.id], grants: { [probe.manifest.id]: ['ui.dom'] } });
  try {
    await s.open();
    const bar = s.surface.querySelector('footer.lm-status-bar');
    assert.ok(builtInRoot.contains(bar));
    const filename = bar.querySelector('.lm-status-file');
    const slots = () => [...s.surface.querySelectorAll('[data-lunaris-slot]')].map(node => node.dataset.lunarisSlot);
    const beforeSlots = slots();
    const archive = inspectLup(await packDrema());
    const asset = 'assets/drema.svg';
    const entry = archive.manifest.entry.slice(2);
    const decode = new TextDecoder();
    const env = { vaultId: s.service.current().id, generation: 1 };
    const { runtime, composition } = s.tools;
    assert.equal((await runtime.open(env)).ok, true);
    const result = await runtime.register(env, archive.manifest, {
      entry,
      modules: { [entry]: decode.decode(archive.read(entry)) },
      resources: { [asset]: [...archive.read(asset)] },
    }, true);
    assert.equal(result.ok, true, JSON.stringify({ result, logs: s.logs }));
    const selector = 'img[data-plugin-mascot="example.drema"]';
    const image = bar.querySelector(selector);
    assert.ok(image);
    assert.equal(image.parentElement, filename.parentElement);
    assert.equal(bar.querySelector('.lm-status-file'), filename);
    assert.equal(image.alt, '');
    assert.equal(decodeURIComponent(image.src.slice(image.src.indexOf(',') + 1)), decode.decode(archive.read(asset)));
    assert.deepEqual(slots(), beforeSlots);

    const apply = async disabledBuiltins => {
      const applied = await composition.apply(env, { bindings: [], disabledBuiltins }, composition.snapshot(env).value.revision);
      assert.equal(applied.ok, true, JSON.stringify(applied));
      await flush();
    };
    await apply([statusBar.manifest.id]);
    assert.equal(s.surface.querySelector('footer.lm-status-bar'), null);
    await apply([]);
    const replacement = s.surface.querySelector('footer.lm-status-bar');
    assert.notEqual(replacement, bar);
    assert.equal(replacement.querySelector(selector), image);

    assert.equal((await runtime.disable(env, archive.manifest.id)).ok, true);
    await flush();
    assert.equal(s.surface.querySelector(selector), null);
    assert.equal(s.surface.querySelector('footer.lm-status-bar'), replacement);
    assert.deepEqual(slots(), beforeSlots);
  } finally { await s.stop(); }
});
