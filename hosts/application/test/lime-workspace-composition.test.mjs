import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Views, ViewSurfaces } from '@lunaris/components';
import { Logger } from '@lunaris/logging';
import { Workspace, WorkspaceLayout } from '@lunaris/workspace';
import execution from '@lunaris/quickjs-execution';
import { setupWorkspace, panel, flush } from '../../../tools/test/workspace.mjs';

test('an owner-selected QuickJS package creates and rearranges Workspace regions and restores the standard layout', async () => {
  const manifest = {
    manifestVersion: 1, id: 'test.custom-layout', version: '1.0.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './plugin.js',
    provides: [{ id: WorkspaceLayout.id, kind: 'api', version: WorkspaceLayout.version }],
    requires: [Views, Workspace, Logger].map(token => ({ id: token.id, kind: 'api', range: '^' + token.version })),
    permissions: ['ui.dom'], optionalPermissions: [],
  };
  const contents = `
    import { definePlugin } from '@lunaris/sdk';
    import { Views } from '@lunaris/components';
    import { Logger } from '@lunaris/logging';
    import { Workspace, WorkspaceLayout } from '@lunaris/workspace';
    export default definePlugin({ manifest: ${JSON.stringify(manifest)}, activate(ctx) {
      const logger = ctx.use(Logger);
      const listeners = new Set();
      const custom = { kind: 'region', region: 'test.tools', label: 'Tools' };
      const main = { kind: 'region', region: 'main', grow: 3 };
      let clicks = 0;
      ctx.provide(WorkspaceLayout, {
        describe() {
          if (clicks > 1) return { kind: 'row', children: [main, main] };
          return clicks
            ? { kind: 'column', children: [{ kind: 'row', children: [custom] }, main] }
            : { kind: 'row', children: [main, custom] };
        },
        watch(listener, owner) {
          listeners.add(listener);
          owner.addEventListener('abort', () => listeners.delete(listener), { once: true });
        },
      });
      const registered = ctx.use(Views).register({ id: 'test.layout-tools', render() {
        return { kind: 'button', label: 'Move tools', onPress() {
          clicks++;
          for (const listener of listeners) listener();
        } };
      } }, ctx.signal);
      if (!registered.ok) throw new Error(registered.error.message);
      const contribution = ctx.use(Workspace).register({ id: 'test.layout-tools', componentId: 'test.layout-tools', region: 'test.tools' }, ctx.signal);
      if (!contribution.ok) throw new Error(contribution.error.message);
      logger.info(ctx.pluginId, 'Layout ready');
    } });
  `;
  const result = await build({ stdin: { contents, loader: 'js', resolveDir: process.cwd() }, bundle: true, platform: 'neutral', format: 'esm', write: false });
  const workspace = await setupWorkspace({ pluginRuntime: true, plugins: [execution] });
  const { surface, tools } = workspace;
  let measureLayout;
  let width = 1200;
  const { window } = workspace.dom;
  window.HTMLElement.prototype.getBoundingClientRect = () => new window.DOMRect(0, 0, width, 720);
  globalThis.ResizeObserver = class {
    constructor(callback) { this.callback = callback; }
    observe(element) { if (element.classList.contains('lm-composed-workspace')) measureLayout = this.callback; }
    unobserve() {}
    disconnect() {}
  };
  try {
    const main = panel(workspace, 'test.main-view');
    assert.equal(tools.workspace.register({ id: 'test.main', componentId: 'test.main-view' }, workspace.ctx.signal).ok, true);
    await workspace.open();
    const env = { vaultId: workspace.service.current().id, generation: 1 };
    assert.equal((await tools.runtime.open(env)).ok, true);
    assert.equal((await tools.runtime.register(env, manifest, { entry: 'plugin.js', modules: { 'plugin.js': result.outputFiles[0].text } }, true)).ok, true);
    assert.ok(surface.querySelector('.lm-workspace-layout'));
    const binding = { consumerId: 'lunaris.workspace', kind: 'api', contractId: WorkspaceLayout.id, providerId: manifest.id };
    const revision = tools.composition.snapshot(env).value.revision;
    const applied = await tools.composition.apply(env, { bindings: [binding], disabledBuiltins: [] }, revision);
    assert.equal(applied.ok, true, JSON.stringify(applied));
    await flush();

    const regions = () => [...surface.querySelectorAll('[data-workspace-region]')].map(node => node.dataset.workspaceRegion);
    assert.deepEqual(regions(), ['main', 'test.tools']);
    const toolsButton = surface.querySelector('[data-workspace-region="test.tools"] button');
    const mainContent = surface.querySelector('main article');
    assert.ok(mainContent);
    assert.ok(toolsButton);
    assert.equal(toolsButton.closest('.lm-root').dataset.presentation, 'embedded');
    assert.equal(toolsButton.closest('.lm-root').style.backgroundColor, 'transparent');
    const releases = main.releases.length;
    toolsButton.click();
    await flush();
    assert.deepEqual(regions(), ['test.tools', 'main']);
    assert.equal(surface.querySelector('main article'), mainContent);
    assert.equal(surface.querySelector('[data-workspace-region="test.tools"] button'), toolsButton);
    assert.equal(main.releases.length, releases);
    width = 600;
    measureLayout();
    await flush();
    assert.equal(surface.querySelector('.lm-composed-workspace').hasAttribute('data-compact'), true);
    assert.equal(surface.querySelector('main article'), mainContent);
    assert.equal(main.seen.at(-1).workspace.compact, true);
    tools.themes.register({ id: 'test.composition-light', name: 'Light', properties: { appearance: 'light', colors: { background: '#ffffff', text: '#202020' } } }, workspace.ctx.signal);
    tools.themes.select('test.composition-light');
    assert.equal(surface.querySelector('.lm-composed-workspace').closest('.lm-root').style.backgroundColor, 'rgb(255, 255, 255)');
    assert.equal(toolsButton.closest('.lm-root').style.backgroundColor, 'transparent');
    toolsButton.click();
    await flush();
    assert.deepEqual(regions(), ['test.tools', 'main']);
    assert.ok(workspace.logs.some(log => log[3]?.code === 'WORKSPACE_LAYOUT_INVALID'));

    assert.equal((await tools.runtime.remove(env, manifest.id)).error.code, 'CONFLICT');
    const revert = await tools.composition.apply(env, { bindings: [], disabledBuiltins: [] }, tools.composition.snapshot(env).value.revision);
    assert.equal(revert.ok, true, JSON.stringify(revert));
    assert.equal((await tools.runtime.remove(env, manifest.id)).ok, true);
    await flush();
    assert.ok(surface.querySelector('.lm-workspace-layout'));
    assert.ok(surface.querySelector('main article'));
    assert.deepEqual(regions(), []);
    assert.equal(toolsButton.isConnected, false);
  } finally {
    await workspace.stop();
  }
});

test('a QuickJS view owns a fresh application surface after the owner disables Workspace', async () => {
  const manifest = {
    manifestVersion: 1, id: 'test.independent-workspace', version: '1.0.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './plugin.js',
    provides: [],
    requires: [Views, ViewSurfaces, Logger].map(token => ({ id: token.id, kind: 'api', range: '^' + token.version })),
    permissions: ['ui.dom'], optionalPermissions: [],
  };
  const contents = `
    import { definePlugin } from '@lunaris/sdk';
    import { Views, ViewSurfaces } from '@lunaris/components';
    import { Logger } from '@lunaris/logging';
    export default definePlugin({ manifest: ${JSON.stringify(manifest)}, activate(ctx) {
      const logger = ctx.use(Logger);
      const views = ctx.use(Views);
      const surfaces = ctx.use(ViewSurfaces);
      const id = ctx.pluginId + '.view';
      let mount;
      const registered = views.register({ id, render(props) {
        return { kind: 'button', label: 'Count: ' + props.count, onPress() {
          const next = mount.update({ count: props.count + 1 });
          if (!next.ok) throw new Error(next.error.message);
        } };
      } }, ctx.signal);
      if (!registered.ok) throw new Error(registered.error.message);
      const invalid = views.register({ id: ctx.pluginId + '.broken', render() { throw new Error('View error'); } }, ctx.signal);
      if (!invalid.ok) throw new Error(invalid.error.message);
      const failure = surfaces.mount(ctx.pluginId + '.broken', ctx.pluginId + '.failed', {}, ctx.signal);
      if (failure.ok || failure.error.code !== 'RENDER_FAILED') throw new Error('Failed surface accepted');
      const duplicate = surfaces.mount(id, 'lunaris.workspace.screen', { count: 0 }, ctx.signal);
      if (duplicate.ok || duplicate.error.code !== 'ALREADY_REGISTERED') throw new Error('Existing slot takeover accepted');
      const native = surfaces.mount('lunaris.workspace-empty', ctx.pluginId + '.native', {}, ctx.signal);
      if (native.ok || native.error.code !== 'NOT_FOUND') throw new Error('Native role accepted');
      const opened = surfaces.mount(id, ctx.pluginId + '.screen', { count: 0 }, ctx.signal);
      if (!opened.ok) throw new Error(opened.error.message);
      mount = opened.value;
      logger.info(ctx.pluginId, 'Independent workspace ready');
    } });
  `;
  const result = await build({ stdin: { contents, loader: 'js', resolveDir: process.cwd() }, bundle: true, platform: 'neutral', format: 'esm', write: false });
  const workspace = await setupWorkspace({ pluginRuntime: true, plugins: [execution] });
  const { surface, tools } = workspace;
  try {
    await workspace.open();
    const env = { vaultId: workspace.service.current().id, generation: 1 };
    assert.equal((await tools.runtime.open(env)).ok, true);
    assert.ok(surface.querySelector('.lm-workspace-layout'));
    const installed = await tools.runtime.register(env, manifest, { entry: 'plugin.js', modules: { 'plugin.js': result.outputFiles[0].text } }, true);
    assert.equal(installed.ok, true, JSON.stringify(workspace.logs));
    const guest = () => surface.querySelector('[data-lunaris-slot="test.independent-workspace.screen"]');
    assert.equal(surface.querySelector('[data-lunaris-slot="test.independent-workspace.failed"]'), null);
    assert.equal(guest().querySelector('.lm-root').dataset.presentation, 'standalone');
    const revision = tools.composition.snapshot(env).value.revision;
    const applied = await tools.composition.apply(env, { bindings: [], disabledBuiltins: ['lunaris.workspace'] }, revision);
    assert.equal(applied.ok, true, JSON.stringify(applied));
    await flush();
    assert.equal(surface.querySelector('.lm-workspace-layout'), null);
    assert.equal(guest().querySelector('button').textContent, 'Count: 0');
    guest().querySelector('button').click();
    await flush();
    assert.equal(guest().querySelector('button').textContent, 'Count: 1');
    const restored = await tools.composition.apply(env, { bindings: [], disabledBuiltins: [] }, tools.composition.snapshot(env).value.revision);
    assert.equal(restored.ok, true, JSON.stringify(restored));
    assert.equal((await tools.runtime.disable(env, manifest.id)).ok, true);
    await flush();
    assert.equal(guest(), null);
    assert.ok(surface.querySelector('.lm-workspace-layout'));
  } finally {
    await workspace.stop();
  }
});
