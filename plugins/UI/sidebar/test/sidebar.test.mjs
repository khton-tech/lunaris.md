import test from 'node:test';
import assert from 'node:assert/strict';
import { setupWorkspace, panel, flush } from '../../../../tools/test/workspace.mjs';
const setup = options => setupWorkspace({ sidebar: true, ...options });
const tab = (id, componentId, extra = {}) => ({ id, componentId, title: id === 'test.files' ? 'Files' : 'Search', icon: id === 'test.files' ? 'files' : 'search', ...extra });
const button = (s, title) => s.surface.querySelector(`.lm-sidebar-tab[aria-label="${title}"]`);

test('bottom tabs occupy a separate end group and keyboard order follows visual order', async () => {
  const s = await setup(); panel(s, 'test.content'); await s.open();
  s.tools.sidebar.register({ id: 'test.settings', componentId: 'test.content', title: 'Settings', icon: 'settings', placement: 'end', order: -100 }, s.ctx.signal);
  s.tools.sidebar.register(tab('test.files', 'test.content', { order: 100 }), s.ctx.signal); await flush();
  assert.equal(button(s, 'Settings').parentElement.classList.contains('lm-sidebar-end'), true);
  button(s, 'Files').focus(); button(s, 'Files').dispatchEvent(new s.dom.window.KeyboardEvent('keydown', { key: 'End', bubbles: true }));
  assert.equal(s.dom.window.document.activeElement, button(s, 'Settings')); await s.stop();
});

test('separate sidebar is invisible without tabs and does not replace the main workspace placeholder', async () => {
  const s = await setup(); await s.open();
  assert.ok(s.session.snapshot().kernel.plugins.some(plugin => plugin.manifest.id === 'lunaris.sidebar' && plugin.state === 'active'));
  assert.equal(s.surface.querySelector('.lm-sidebar-rail'), null); assert.ok(s.surface.querySelector('.lm-workspace-main .lm-workspace-empty'));
  assert.deepEqual(s.tools.workspace.list(), []); await s.stop();
});

test('tool props update only the selected panel and preserve navigation contributions', async () => {
  const s = await setup({ mobileMenu: true });
  try {
    panel(s, 'test.content'); await s.open();
    s.tools.sidebar.register(tab('test.files', 'test.content'), s.ctx.signal);
    s.tools.sidebar.register(tab('test.search', 'test.content'), s.ctx.signal);
    await flush();
    const navigation = () => s.tools.workspace.list().filter(entry => entry.region !== 'left-panel');
    const before = navigation();
    for (let index = 0; index < 10; index++) s.tools.sidebar.update('test.files', { title: 'Files', icon: 'files', props: { label: `Files ${index}` } });
    await flush();
    assert.deepEqual(navigation(), before);
    assert.ok(navigation().every((entry, index) => entry === before[index]), 'tool state must preserve rail and mobile menu descriptors');
    assert.match(s.surface.querySelector('.lm-workspace-panel article').textContent, /Files 9/);
    const selected = s.tools.workspace.list().find(entry => entry.region === 'left-panel');
    s.tools.sidebar.update('test.search', { title: 'Search', icon: 'search', props: { label: 'Background result' } });
    await flush();
    assert.equal(s.tools.workspace.list().find(entry => entry.region === 'left-panel'), selected);
  } finally { await s.stop(); }
});
test('icon rail opens, switches and collapses independent content without remounting the rail or main', async () => {
  const s = await setup(); const files = panel(s, 'test.file-tree'); const search = panel(s, 'test.search-view'); await s.open();
  const placeholder = s.surface.querySelector('.lm-workspace-main .lm-workspace-empty');
  s.tools.sidebar.register(tab('test.files', 'test.file-tree'), s.ctx.signal);
  s.tools.sidebar.register(tab('test.search', 'test.search-view'), s.ctx.signal); await flush();
  assert.ok(s.surface.querySelector('.lm-workspace-rail nav')); assert.equal(button(s, 'Files').textContent, ''); assert.ok(button(s, 'Files').querySelector('svg'));
  assert.equal(button(s, 'Files').getAttribute('aria-pressed'), 'true'); assert.equal(button(s, 'Files').title, 'Files');
  assert.equal(s.surface.querySelector('.lm-workspace-panel article').dataset.panel, 'test.file-tree');
  const rail = s.surface.querySelector('.lm-sidebar-rail'); const searchButton = button(s, 'Search'); searchButton.focus(); searchButton.click(); await flush();
  assert.equal(s.surface.querySelector('.lm-sidebar-rail'), rail); assert.equal(s.dom.window.document.activeElement, searchButton);
  assert.equal(s.surface.querySelector('.lm-workspace-panel article').dataset.panel, 'test.search-view'); assert.equal(files.releases.length, 1);
  assert.equal(s.surface.querySelector('.lm-workspace-main .lm-workspace-empty'), placeholder);
  searchButton.click(); await flush(); assert.equal(s.surface.querySelector('.lm-workspace-panel').hidden, true); assert.equal(search.releases.length, 1);
  assert.equal(s.surface.querySelector('.lm-sidebar-rail'), rail); assert.equal(s.tools.sidebar.snapshot().activeId, null);
  searchButton.click(); await flush(); assert.equal(s.surface.querySelector('.lm-workspace-panel').hidden, false); await s.stop();
});
test('keyboard navigation and Escape retain deliberate focus and collapse the active side panel', async () => {
  const s = await setup(); panel(s, 'test.content'); await s.open();
  s.tools.sidebar.register(tab('test.files', 'test.content'), s.ctx.signal); s.tools.sidebar.register(tab('test.search', 'test.content'), s.ctx.signal); await flush();
  button(s, 'Files').focus(); button(s, 'Files').dispatchEvent(new s.dom.window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  assert.equal(s.dom.window.document.activeElement, button(s, 'Search')); assert.equal(s.tools.sidebar.snapshot().activeId, 'test.files');
  button(s, 'Search').click(); await flush(); const content = s.surface.querySelector('.lm-workspace-panel article'); content.tabIndex = 0; content.focus();
  content.dispatchEvent(new s.dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await flush();
  assert.equal(s.tools.sidebar.snapshot().activeId, null); assert.equal(s.dom.window.document.activeElement, button(s, 'Search')); await s.stop();
});

test('mobile overlay preserves Sidebar selection and the composed editor when opened and closed', async () => {
  const s = await setup({ mobileMenu: true });
  try {
    s.dom.window.HTMLElement.prototype.getBoundingClientRect = () => new s.dom.window.DOMRect(0, 0, 360, 720);
    panel(s, 'test.content');
    s.tools.sidebar.register(tab('test.files', 'test.content'), s.ctx.signal);
    s.tools.sidebar.register(tab('test.search', 'test.content'), s.ctx.signal);
    await s.open();
    const root = s.surface.querySelector('.lm-workspace-layout');
    const main = root.querySelector('.lm-workspace-main'); const editor = main.firstElementChild;
    const toggle = root.querySelector('.lm-workspace-mobile-launcher button');
    const dockToggle = root.querySelector('.lm-workspace-mobile-toolbar button');
    assert.ok(toggle); assert.ok(dockToggle);
    assert.equal(root.querySelectorAll('.lm-workspace-mobile-toolbar button').length,1);
    assert.equal(root.hasAttribute('data-mobile-open'), false);
    dockToggle.click(); await flush();
    assert.equal(root.hasAttribute('data-mobile-open'), true);
    assert.equal(main.parentElement.hasAttribute('inert'), true);
    button(s, 'Search').click(); await flush();
    assert.equal(s.tools.sidebar.snapshot().activeId, 'test.search');
    root.querySelector('.lm-workspace-backdrop').click(); await flush();
    assert.equal(root.hasAttribute('data-mobile-open'), false);
    assert.equal(s.tools.sidebar.snapshot().activeId, 'test.search');
    assert.equal(main.firstElementChild, editor); assert.equal(main.parentElement.hasAttribute('inert'), false);

    const swipe = (type, clientX) => {
      const event = new s.dom.window.Event(type, { bubbles: true, cancelable: true });
      const points = [{ identifier: 0, clientX, clientY: 200 }];
      Object.defineProperties(event, { touches: { value: type === 'touchend' ? [] : points }, changedTouches: { value: points } });
      editor.dispatchEvent(event);
    };
    swipe('touchstart', 170);
    swipe('touchmove', 284);
    assert.equal(root.hasAttribute('data-mobile-dragging'), true);
    assert.equal(s.tools.navigation.isOpen(), false);
    swipe('touchend', 284);
    await flush();
    assert.equal(s.tools.navigation.isOpen(), true);
    assert.equal(root.hasAttribute('data-mobile-open'), true);
    assert.equal(root.hasAttribute('data-mobile-dragging'), false);
    assert.equal(button(s, 'Search').getAttribute('aria-pressed'), 'true');
    assert.equal(main.firstElementChild, editor);
    root.querySelector('.lm-workspace-backdrop').click(); await flush();
    assert.equal(s.dom.window.document.activeElement, main);

    toggle.click(); await flush();
    assert.equal(s.tools.navigation.isOpen(), true);
    assert.equal(button(s, 'Search').getAttribute('aria-pressed'), 'true');
  } finally { await s.stop(); }
});
test('missing and replacement content roles retain the tab and show a localized unavailable panel', async () => {
  const s = await setup(); await s.open(); s.tools.sidebar.register(tab('test.files', 'test.file-tree', { icon: 'unknown-custom-icon' }), s.ctx.signal); await flush();
  assert.match(s.surface.querySelector('.lm-workspace-panel').textContent, /Panel unavailable/); assert.ok(button(s, 'Files').querySelector('svg'));
  const first = panel(s, 'test.file-tree'); await flush(); assert.ok(s.surface.querySelector('.lm-workspace-panel article'));
  await first.owner.dispose(); await flush(); assert.match(s.surface.querySelector('.lm-workspace-panel').textContent, /Panel unavailable/);
  panel(s, 'test.file-tree'); await flush(); assert.ok(s.surface.querySelector('.lm-workspace-panel article')); await s.stop();
});
test('owner removal selects a remaining tab and the last removal hides both sidebar regions', async () => {
  const s = await setup(); panel(s, 'test.content'); await s.open(); const owner = s.ctx.scope.child(); const other = s.ctx.scope.child();
  s.tools.sidebar.register(tab('test.files', 'test.content'), owner.signal); s.tools.sidebar.register(tab('test.search', 'test.content'), other.signal);
  await owner.dispose(); await flush(); assert.equal(s.tools.sidebar.snapshot().activeId, 'test.search'); assert.equal(button(s, 'Files'), null);
  await other.dispose(); await flush(); assert.equal(s.surface.querySelector('.lm-sidebar-rail'), null); assert.deepEqual(s.tools.workspace.list(), []);
  assert.equal(s.surface.querySelector('.lm-workspace-layout').hasAttribute('data-panel'), false); await s.stop();
});

test('a failed active renderer has an explanatory panel and can recover through a props update', async () => {
  const s = await setup(); const options = { fail: true }; panel(s, 'test.content', options); await s.open();
  s.tools.sidebar.register(tab('test.files', 'test.content'), s.ctx.signal); await flush();
  assert.match(s.surface.querySelector('.lm-workspace-panel').textContent, /Panel unavailable/);
  options.fail = false; s.tools.sidebar.update('test.files', { title: 'Files', icon: 'files', props: { label: 'Recovered' } }); await flush();
  assert.match(s.surface.querySelector('.lm-workspace-panel article').textContent, /Recovered/);
  assert.equal(s.surface.querySelector('.lm-workspace-panel .lm-workspace-empty'), null); await s.stop();
});
test('Vault transitions remount active content; localized title updates and themes preserve the selected tab', async () => {
  const s = await setup(); const view = panel(s, 'test.content'); s.tools.sidebar.register(tab('test.files', 'test.content'), s.ctx.signal); await s.open();
  const old = s.surface.querySelector('.lm-workspace-panel article'); const vaultId = view.seen.at(-1).workspace.vaultId;
  s.tools.sidebar.update('test.files', { title: '<img src=x>', icon: 'outline', props: { label: 'Updated' } }); await flush();
  assert.ok(button(s, '<img src=x>')); assert.equal(s.surface.querySelector('img'), null); assert.equal(s.tools.sidebar.snapshot().activeId, 'test.files');
  s.tools.themes.register({ id: 'test.light', name: 'Light', properties: { colors: { background: '#ffffff', text: '#202020' } } }, s.ctx.signal); s.tools.themes.select('test.light');
  assert.equal(s.surface.querySelector('.lm-sidebar-rail').closest('.lm-root').style.backgroundColor, 'transparent');
  assert.equal(s.surface.querySelector('.lm-workspace-layout').closest('.lm-root').style.backgroundColor, 'rgb(255, 255, 255)');
  await s.open(); assert.equal(old.isConnected, false); assert.notEqual(view.seen.at(-1).workspace.vaultId, vaultId);
  assert.equal(s.tools.sidebar.snapshot().activeId, 'test.files'); await s.service.close(); await flush(); assert.equal(s.surface.querySelector('.lm-sidebar-rail'), null);
  await s.open(); assert.ok(s.surface.querySelector('.lm-sidebar-rail')); await s.stop();
});
