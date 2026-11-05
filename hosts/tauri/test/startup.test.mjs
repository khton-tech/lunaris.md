import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { definePlugin } from '@lunaris/sdk';
import { TestScheduler } from '@lunaris/test';
import { Logger } from '@lunaris/logging';
import { Startup, StartupChanged } from '@lunaris/startup';
import { createStartupProvider } from '@lunaris/startup-provider';
import { HostSession } from '@lunaris/tauri';
import { mountSystemView } from '../dist/view.js';

const manifest = (id, provides = [], requires = []) => ({ manifestVersion: 1, id, version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './index.js', provides, requires, permissions: [], optionalPermissions: [] });
const logger = definePlugin({ manifest: manifest('test.logger', [{ kind: 'api', id: Logger.id, version: Logger.version }]), activate(ctx) {
  ctx.provide(Logger, Object.fromEntries(['log', 'debug', 'info', 'warn', 'error'].map(name => [name, () => true])));
} });

async function setup({ fail = false } = {}) {
  const dom = new JSDOM('<div id="system"></div><div id="app"></div>');
  const document = dom.window.document; const app = document.getElementById('app');
  const entered = Promise.withResolvers(); const finish = Promise.withResolvers();
  const changes = []; let api; let initial; let controller; let attempts = 0;
  const reader = definePlugin({ manifest: manifest('test.reader', [], [Startup, StartupChanged].map(token => ({ kind: token.kind, id: token.id, range: '^1.0.0' }))), activate(ctx) {
    api = ctx.use(Startup); initial = api.snapshot(); ctx.events.on(StartupChanged, value => { changes.push(value); });
  } });
  const slow = definePlugin({ manifest: manifest('test.slow'), async activate() {
    entered.resolve(); await finish.promise;
    if (fail && attempts === 1) throw Error('private startup error');
  } });
  const session = new HostSession({ scheduler: new TestScheduler(), load: async () => {
    attempts++; controller = createStartupProvider();
    return { startup: controller, plugins: [logger, controller.plugin, reader, slow],
      entrypoints: [controller.plugin.manifest.id, 'test.reader', 'test.slow'],
      view: { duringStartup: true, mount(signal) {
        signal.throwIfAborted(); const node = document.createElement('div'); node.textContent = 'Loading'; app.append(node);
        return { dispose() { node.remove(); } };
      } },
    };
  } });
  const view = mountSystemView(document.getElementById('system'), app, session);
  const starting = session.start(); await entered.promise;
  return { dom, app, session, view, finish, starting, changes, api, initial, controller };
}

test('early surface stays visible during slow activation; late SDK reader sees current milestone and loaded event', async () => {
  const { dom, app, session, view, finish, starting, changes, api, initial } = await setup();
  assert.equal(session.snapshot().phase, 'starting'); assert.equal(session.snapshot().applicationVisible, true);
  assert.equal(app.hidden, false); assert.equal(app.textContent, 'Loading');
  assert.equal(initial.stage, 'activation'); assert.equal(initial.pluginId, 'test.reader');
  assert.equal(api.snapshot().pluginId, 'test.slow');
  finish.resolve(); await starting;
  assert.equal(api.snapshot().state, 'loaded'); assert.equal(changes.at(-1).stage, 'ready');
  assert.ok(changes.every((value, index) => index === 0 || value.sequence > changes[index - 1].sequence));
  await session.stop(); assert.equal(app.hidden, true); assert.equal(app.childElementCount, 0);
  view.dispose(); dom.window.close();
});

test('early activation failure removes surface, redacts error and retries with fresh startup ingress', async () => {
  const { dom, app, session, view, finish, starting, controller } = await setup({ fail: true });
  finish.resolve(); await starting;
  assert.equal(session.snapshot().phase, 'fallback'); assert.equal(app.hidden, true); assert.equal(app.childElementCount, 0);
  assert.equal(session.snapshot().startup.state, 'failed');
  assert.equal(session.snapshot().startup.errorCode, 'ACTIVATION_FAILED');
  assert.ok(!JSON.stringify(session.snapshot().startup).includes('private'));
  await session.start(); assert.equal(session.snapshot().phase, 'running');
  assert.equal(controller.update({ sequence: 999, state: 'loaded', stage: 'ready' }), false);
  await session.stop(); view.dispose(); dom.window.close();
});

test('stop during early activation cannot publish a stale loaded state', async () => {
  const { dom, app, session, view, finish, starting } = await setup();
  const stopping = session.stop(); assert.equal(app.hidden, true);
  finish.resolve(); await Promise.all([starting, stopping]);
  assert.equal(session.snapshot().phase, 'stopped'); assert.equal(session.snapshot().startup.state, 'stopped');
  assert.equal(app.childElementCount, 0); view.dispose(); dom.window.close();
});
