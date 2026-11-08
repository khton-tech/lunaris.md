import { readFileSync } from "node:fs";
import test from 'node:test';
import assert from 'node:assert/strict';
import { definePlugin } from '@lunaris/sdk';
import { Window } from '@lunaris/window';
import windowProvider from '@lunaris/window-provider';
import { createTauriWindowDriver } from '@lunaris/tauri-window';
import titlebar from '@lunaris/window-titlebar';
import { setupWorkspace, flush } from '../../../../tools/test/workspace.mjs';
import { bindWindowClose } from '../../../../hosts/tauri/dist/desktop.js';

async function setup(options = {}) {
  let api; let focused = true; let maximized = false; let title = 'Lunaris'; let changed;
  let decorated = true; let closeHandler; let s; let closed = false;
  const operations = [];
  const driver = createTauriWindowDriver({
    async read() { return { title, focused, maximized, capabilities: { title: true, minimize: true, maximize: true, close: true, drag: true, customTitlebar: true } }; },
    async listen(fn) { changed = fn; return () => {}; }, async isDecorated() { return true; },
    async setDecorations(value) { decorated = value; operations.push(['decorations', value]); },
    async setTitle(value) { title = value; }, async minimize() { operations.push(['minimize']); },
    async toggleMaximize() { maximized = !maximized; }, async startDragging() { operations.push(['drag']); },
    async close() { operations.push(['close']); if (closeHandler) await closeHandler({ preventDefault() { operations.push(['blocked']); } }); },
  });
  const actor = definePlugin({ manifest: { manifestVersion: 1, id: 'test.window-client', version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './index.js',
    provides: [], requires: [{ kind: 'api', id: Window.id, range: '^1.0.0' }], permissions: ['window.control'], optionalPermissions: [] },
    activate(ctx) { api = ctx.use(Window); } });
  const workspaceOptions = { ...options, sidebar: true, plugins: [driver, windowProvider, titlebar, actor], entrypoints: [titlebar.manifest.id, actor.manifest.id],
    grants: { [driver.manifest.id]: ['window.native'], [windowProvider.manifest.id]: ['window.control'], [titlebar.manifest.id]: ['window.control', 'ui.dom'], [actor.manifest.id]: ['window.control'] } };
  s = await setupWorkspace(workspaceOptions);
  await bindWindowClose({ async requestClose() {
    const result = await s.service.close();
    if (!result.ok) return false;
    await s.session.stop(); closed = true; return true;
  } }, { async onCloseRequested(handler) { closeHandler = handler; return () => {}; } });
  return { ...s, api, operations, get decorated() { return decorated; }, get closed() { return closed; },
    allowClose() { delete workspaceOptions.closeFailure; },
    async focus(value) { focused = value; changed(); await flush(); } };
}

test('real titlebar remains above selector and Workspace, tracks API titles, theme and native state', async () => {
  const s = await setup();
  try {
    assert.equal(s.session.snapshot().phase, 'running');
    const header = s.surface.querySelector('.lm-window-titlebar'); assert.ok(header); assert.equal(s.decorated, false);
    const style = s.dom.window.document.createElement('style');
    style.textContent = readFileSync(new URL('../../mantine-components/styles.css', import.meta.url), 'utf8').replace(/^@import .*;$/gm, '');
    s.dom.window.document.head.append(style);
    assert.equal(s.dom.window.getComputedStyle(header).flexGrow, '1', 'The caption must fill its owned row rather than shrink to its controls.');
    assert.equal(header.parentElement.style.display, 'flex');
    assert.equal(header.closest('.lm-root').dataset.sizing, 'content', 'Full row width must retain intrinsic caption height.');
    assert.ok(s.surface.querySelector('.ln-vault'));
    assert.equal(header.closest('[data-lunaris-slot]').parentElement.firstElementChild, header.closest('[data-lunaris-slot]'));
    await s.api.setTitle('A very long document title — Lunaris'); await flush();
    assert.equal(header.querySelector('.lm-window-titlebar-title').textContent, 'A very long document title — Lunaris');
    header.querySelector('[aria-label=Maximize]').click(); await flush(); assert.ok(header.querySelector('[aria-label=Restore]'));
    await s.focus(false); assert.equal(header.dataset.focused, 'false');
    const names = s.tools.themes.list(); const luna = names.find(item => /Luna/.test(item.name));
    const captionRoot = header.closest('.lm-root');
    assert.equal(captionRoot.dataset.presentation, 'standalone');
    assert.equal(captionRoot.style.backgroundColor, 'rgb(15, 15, 15)');
    const normalMargin = s.dom.window.getComputedStyle(header).margin;
    assert.ok(luna); s.tools.themes.select(luna.id); await flush(); assert.equal(header.dataset.chrome, 'true');
    const chromeStyle = s.dom.window.getComputedStyle(header);
    for (const side of ['Top', 'Right', 'Bottom', 'Left']) assert.equal(chromeStyle['margin' + side], '0px', 'Native-style caption must reach every edge of its allocated region.');
    assert.equal(chromeStyle.borderRadius, '0px');
    assert.equal(header.style.color, 'var(--vault-caption-text,var(--vault-text))');
    const expectedBackground = s.dom.window.document.createElement('div');
    expectedBackground.style.backgroundColor = s.tools.themes.current().properties.colors.background;
    assert.equal(captionRoot.style.backgroundColor, expectedBackground.style.backgroundColor, 'Caption margins must show the current theme, not the host boot background.');
    assert.notEqual(captionRoot.style.backgroundColor, 'rgb(15, 15, 15)');
    s.tools.themes.select('lunaris.base-theme-engine.monochrome'); await flush();
    assert.equal(captionRoot.style.backgroundColor, 'rgb(15, 15, 15)');
    assert.equal(header.closest('.lm-root'), captionRoot);
    assert.equal(s.dom.window.getComputedStyle(header).margin, normalMargin, 'Leaving chrome mode restores normal theme spacing.');
    await s.open(); assert.equal(s.surface.querySelector('.lm-window-titlebar'), header);
    assert.ok(s.surface.querySelector('.lm-workspace-layout')); assert.equal(s.surface.querySelector('.ln-vault'), null);
    assert.equal(header.contains(s.surface.querySelector('.lm-workspace-layout')), false);
    await s.service.close(); await flush(); assert.equal(s.surface.querySelector('.lm-window-titlebar'), header); assert.ok(s.surface.querySelector('.ln-vault'));
    await s.session.disable(titlebar.manifest.id); await flush();
    assert.equal(s.surface.querySelector('.lm-window-titlebar'), null); assert.equal(s.decorated, true);
    assert.equal(s.session.snapshot().phase, 'fallback'); assert.equal(s.surface.childElementCount, 0);
    await s.session.enable(titlebar.manifest.id); await flush(); assert.ok(s.surface.querySelector('.lm-window-titlebar')); assert.equal(s.decorated, false);
  } finally { await s.stop(); assert.equal(s.decorated, true); }
});

test('custom close follows the normal save gate and leaves the window usable after a failed save', async () => {
  const options = { closeFailure: 'CONFLICT' }; const s = await setup(options);
  try {
    await s.open(); s.surface.querySelector('[aria-label=Close]').click(); await flush();
    assert.equal(s.closed, false); assert.equal(s.decorated, false); assert.equal(s.session.snapshot().phase, 'running');
    assert.ok(s.operations.some(([operation]) => operation === 'blocked'));
    s.surface.querySelector('[aria-label=Minimize]').click(); await flush();
    assert.ok(s.operations.some(([operation]) => operation === 'minimize'));
    s.allowClose(); s.surface.querySelector('[aria-label=Close]').click(); await flush();
    assert.equal(s.closed, true); assert.equal(s.decorated, true);
  } finally { await s.stop(); }
});

test('late renderer registration, loss and mount failure preserve native controls without disturbing screen slots', async () => {
  const s = await setup({ noKit: true });
  try {
    assert.equal(s.decorated, true);
    const owner = s.ctx.scope.child();
    const renderer = { id: 'lunaris.window-titlebar', mount(target) {
      const element = target.ownerDocument.createElement('header'); target.append(element);
      return { update() {}, dispose() { element.remove(); } };
    } };
    assert.equal(s.tools.components.register(renderer, owner.signal).ok, true); await flush(); assert.equal(s.decorated, false);
    await owner.dispose(); await flush(); assert.equal(s.decorated, true);
    const broken = s.ctx.scope.child();
    s.tools.components.register({ ...renderer, mount() { throw new Error('Renderer failure'); } }, broken.signal);
    await flush(); assert.equal(s.decorated, true);
    assert.equal(s.surface.querySelector('[data-lunaris-slot="lunaris.window-titlebar.caption"]'), null);
    await broken.dispose(); await flush();
    s.tools.components.register(renderer, s.ctx.signal); await flush(); assert.equal(s.decorated, false);
  } finally { await s.stop(); assert.equal(s.decorated, true); }
});
