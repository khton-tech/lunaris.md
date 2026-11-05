import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { definePlugin } from '@lunaris/sdk';
import { TestScheduler } from '@lunaris/test';
import { Logger } from '@lunaris/logging';
import { Components, ComponentsChanged } from '@lunaris/components';
import provider from '@lunaris/component-provider';
import { HostSession } from '@lunaris/tauri';

const manifest = (id, provides = [], requires = [], permissions = []) => ({ manifestVersion: 1, id, version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './index.js', provides, requires, permissions, optionalPermissions: [] });
const api = { kind: 'api', id: Components.id, range: '^1.0.0' };
const event = { kind: 'event', id: ComponentsChanged.id, range: '^1.0.0' };

test('host composes the component provider; a kit and a consumer share components across provider recovery', async () => {
  const dom = new JSDOM('<div id="app"></div>'); const target = dom.window.document.getElementById('app');
  let components; let mounts = 0;
  const logger = definePlugin({ manifest: manifest('test.logger', [{ kind: 'api', id: Logger.id, version: '1.0.0' }]), activate(ctx) {
    ctx.provide(Logger, Object.fromEntries(['log', 'debug', 'info', 'warn', 'error'].map(name => [name, () => true])));
  } });
  const kit = definePlugin({ manifest: manifest('test.kit', [], [api], ['ui.dom']), activate(ctx) {
    ctx.use(Components).register({ id: 'test.badge', mount(host, props) {
      const node = host.ownerDocument.createElement('b'); node.textContent = String(props.text); host.append(node);
      return { update() {}, dispose() { node.remove(); } };
    } }, ctx.signal);
  } });
  // Documented consumer pattern: mount now if available, otherwise when the role appears.
  const consumer = definePlugin({ manifest: manifest('test.app', [], [api, event], ['ui.dom']), activate(ctx) {
    components = ctx.use(Components);
    const show = () => { if (components.has('test.badge')) assert.equal(components.mount('test.badge', target, { text: `Mount ${++mounts}` }, ctx.signal).ok, true); };
    ctx.events.on(ComponentsChanged, change => { if (change.kind === 'registered' && change.componentId === 'test.badge') show(); });
    show();
  } });
  const session = new HostSession({ scheduler: new TestScheduler(), load: async () => ({
    plugins: [logger, provider, kit, consumer], entrypoints: ['test.kit', 'test.app'],
    grants: { [provider.manifest.id]: ['ui.dom'], 'test.kit': ['ui.dom'], 'test.app': ['ui.dom'] },
  }) });
  const settle = () => new Promise(resolve => setImmediate(resolve));
  await session.start(); await settle(); assert.equal(session.snapshot().phase, 'running'); assert.equal(target.textContent, 'Mount 1');
  const stale = components;
  await session.disable(provider.manifest.id); assert.equal(session.snapshot().phase, 'fallback');
  assert.equal(target.textContent, ''); assert.throws(() => stale.list());
  await session.enable(provider.manifest.id); await settle(); assert.equal(session.snapshot().phase, 'running');
  assert.equal(target.textContent, 'Mount 2');
  await session.stop(); assert.equal(target.textContent, ''); dom.window.close();
  assert.ok(!session.snapshot().kernel.diagnostics.some(item => item.code === 'CLEANUP_FAILED'));
});
