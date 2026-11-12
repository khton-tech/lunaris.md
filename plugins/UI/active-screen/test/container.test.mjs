import { useBrowser } from '../../../../tools/test/browser.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createKernel } from '@lunaris/kernel';
import { definePlugin } from '@lunaris/sdk';
import { TestScheduler } from '@lunaris/test';
import { Logger } from '@lunaris/logging';
import { Vault, VaultChanged } from '@lunaris/vault';
import { Components } from '@lunaris/components';
import { ActiveScreen } from '@lunaris/active-screen';
import componentProvider from '@lunaris/component-provider';
import screenProvider from '@lunaris/active-screen-provider';
import workspaceProvider from '@lunaris/workspace-provider';
import localization from '@lunaris/localization-manager';
import container from '@lunaris/active-screen-plugin';
import { flush } from '../../../../tools/test/workspace.mjs';

const manifest = (id, provides = [], requires = [], permissions = []) => ({ manifestVersion: 1, id, version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './index.js',
  provides: provides.map(t => ({ kind: t.kind, id: t.id, version: t.version })), requires: requires.map(t => ({ kind: t.kind, id: t.id, range: `^${t.version}` })), permissions, optionalPermissions: [] });
async function setup() {
  const dom = useBrowser(new JSDOM('<div id="target"></div>')); const target = dom.window.document.getElementById('target');
  let ctx; let components; let screens; const publishes = []; const layouts = []; const placeholders = [];
  const services = definePlugin({ manifest: manifest('test.services', [Logger, Vault, VaultChanged]), activate(context) {
    context.provide(Vault, { current: () => ({ id: 'vault-one', name: 'One' }), async open() {}, async close() {} });
    context.provide(Logger, Object.fromEntries(['log', 'debug', 'info', 'warn', 'error'].map(level => [level, () => true])));
  } });
  const consumer = definePlugin({ manifest: manifest('test.consumer', [], [Components, ActiveScreen], ['ui.dom']), activate(context) {
    ctx = context; components = ctx.use(Components); screens = ctx.use(ActiveScreen);
  } });
  const kernel = createKernel({ scheduler: new TestScheduler(), initialGrants: {
    'test.consumer': ['ui.dom'], 'lunaris.component-provider': ['ui.dom'], 'lunaris.active-screen': ['ui.dom'], 'lunaris.active-screen-provider': ['vault.access'],
  } });
  for (const item of [services, componentProvider, screenProvider, workspaceProvider, localization, container, consumer]) kernel.register(item);
  await kernel.start('test.consumer'); await kernel.start(container.manifest.id);
  const empty = components.register({ id: 'lunaris.workspace-empty', mount(element, props) {
    placeholders.push(props.title);
    const node = dom.window.document.createElement('p'); element.append(node); node.textContent = props.title;
    return { update(next) { placeholders.push(next.title); node.textContent = next.title; }, dispose() { node.remove(); } };
  } }, ctx.signal); assert.equal(empty.ok, true);
  function registerLayout(fail = false) {
    const scope = ctx.scope.child();
    const result = components.register({ id: 'lunaris.active-screen', mount(element, props) {
      if (fail) throw new Error('Layout failure');
      const root = dom.window.document.createElement('section'); element.append(root); const nodes = new Map();
      publishes.push(props.onTargets);
      function update(next) {
        layouts.push(next);
        for (const [id, node] of nodes) if (!next.ids.includes(id)) { node.remove(); nodes.delete(id); }
        for (const id of next.ids) {
          if (!nodes.has(id)) { const node = dom.window.document.createElement('div'); nodes.set(id, node); root.append(node); }
          nodes.get(id).hidden = id !== next.activeId;
        }
        next.onTargets(new Map(nodes));
      }
      update(props); return { update, dispose() { props.onTargets(null); root.remove(); } };
    } }, scope.signal); assert.equal(result.ok, true); return scope;
  }
  function mount() {
    const scope = ctx.scope.child(); const result = components.mount('lunaris.active-screen-host', target, { workspace: { vaultId: 'vault-one', vaultName: 'One' } }, scope.signal);
    assert.equal(result.ok, true); return scope;
  }
  return { dom, target, ctx, components, screens, publishes, layouts, placeholders, registerLayout, mount, async stop() {
    await kernel.stopAll(); assert.equal(target.childElementCount, 0);
    assert.deepEqual(kernel.inspect().diagnostics.filter(item => item.code === 'CLEANUP_FAILED'), []); dom.window.close();
  } };
}

test('missing, failing and replaced container roles show a fallback and recover through the SDK registry', async () => {
  const s = await setup(); const view = s.mount(); assert.match(s.target.textContent, /Screen unavailable/);
  const failing = s.registerLayout(true); await flush(); assert.match(s.target.textContent, /Screen unavailable/);
  await failing.dispose(); const layout = s.registerLayout(); await flush(); assert.match(s.target.textContent, /No workspace plugins/);
  assert.ok(s.target.querySelector('section')); await layout.dispose(); await flush();
  assert.equal(s.target.querySelector('section'), null); assert.match(s.target.textContent, /Screen unavailable/);
  s.registerLayout(); await flush(); assert.match(s.target.textContent, /No workspace plugins/);
  const stalePublish = s.publishes.at(-1); await view.dispose(); assert.equal(s.target.childElementCount, 0);
  stalePublish(new Map([['test.stale', s.target]])); s.screens.select(null); await flush(); assert.equal(s.target.childElementCount, 0);
  s.mount(); assert.ok(s.target.querySelector('section')); await s.stop();
});

test('blank and unavailable screens publish their placeholder once and ignore unrelated role changes', async () => {
  const s = await setup();
  try {
    s.registerLayout(); await flush();
    s.mount(); await flush();
    assert.deepEqual(s.layouts.map(props => props.activeId), ['__placeholder']);
    assert.deepEqual(s.placeholders, ['No workspace plugins']);
    const unrelated = s.ctx.scope.child();
    const registration = s.components.register({ id: 'test.unrelated', mount() { return { update() {}, dispose() {} }; } }, unrelated.signal);
    assert.equal(registration.ok, true); await flush();
    await unrelated.dispose(); await flush();
    assert.equal(s.layouts.length, 1);
    assert.equal(s.placeholders.length, 1);

    s.screens.register({ id: 'test.missing', componentId: 'test.missing-role' }, s.ctx.signal);
    await flush();
    const beforeMissing = s.layouts.length;
    s.screens.select('test.missing'); await flush();
    assert.equal(s.layouts.length, beforeMissing + 1);
    assert.ok(s.layouts.every(props => props.activeId === '__placeholder'));
    assert.deepEqual(s.placeholders, ['No workspace plugins', 'Screen unavailable']);
    s.screens.update('test.missing', {}); await flush();
    assert.equal(s.layouts.length, beforeMissing + 2);
    assert.equal(s.placeholders.length, 2);

    await s.layouts.at(-1).tabs.onAdd(); await flush();
    assert.equal(s.screens.snapshot().activeId, null);
    assert.equal(s.layouts.at(-1).tabs.tabs.length, 2);
    assert.equal(s.layouts.at(-1).tabs.busy, false);
    assert.equal(await s.layouts.at(-1).tabs.onNavigate(-1), true); await flush();
    assert.equal(s.screens.snapshot().activeId, 'test.missing');
    assert.equal(s.layouts.at(-1).activeId, '__placeholder');
  } finally { await s.stop(); }
});

test('a newly available screen receives its visible allocated target before mounting', async () => {
  const s = await setup();
  try {
    s.registerLayout(); await flush();
    s.mount(); await flush();
    s.screens.register({ id: 'test.available', componentId: 'test.available-role' }, s.ctx.signal);
    s.screens.select('test.available'); await flush();
    let visibleDuringMount = false;
    const registered = s.components.register({ id: 'test.available-role', mount(element) {
      visibleDuringMount = !element.hidden;
      const node = element.ownerDocument.createElement('article'); element.append(node);
      return { update() {}, dispose() { node.remove(); } };
    } }, s.ctx.signal);
    assert.equal(registered.ok, true); await flush();
    assert.equal(visibleDuringMount, true);
    assert.equal(s.layouts.at(-1).activeId, 'test.available');
    assert.ok(s.target.querySelector('article'));
  } finally { await s.stop(); }
});
