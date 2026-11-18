import test from 'node:test';
import assert from 'node:assert/strict';
import { setupWorkspace, openSettings, panel, flush } from '../../../../tools/test/workspace.mjs';
import { typeInput } from '../../../../tools/test/browser.mjs';
const setup = () => setupWorkspace({ settings: true });
const button = s => s.surface.querySelector('.lm-sidebar-tab[aria-label="Settings"]');
const dialog = s => s.surface.querySelector('.lm-settings-dialog');
const close = async s => { dialog(s).querySelector('[aria-label="Close settings"]').click(); await flush(); };
const category = (s, title) => [...s.surface.querySelectorAll('.lm-settings-category')].find(element => element.textContent === title);
const register = (s, id = 'test.category', title = 'Example') => s.tools.settings.registerCategory({ id, title }, s.ctx.signal);
const section = (s, extra = {}, owner = s.ctx.signal) => s.tools.settings.registerSection({ id: 'test.section', categoryId: 'test.category', title: 'Controls', componentId: 'test.controls', ...extra }, owner);

test('the Workspace owns the overlay and Settings lends explicit embedded intrinsic presentation to sections', async () => {
  const s = await setup(); const form = panel(s, 'test.controls'); register(s);
  section(s, { props: { presentation: { mode: 'standalone', sizing: 'fill' } } }); await s.open();
  await openSettings(s);
  const region = s.surface.querySelector('[data-workspace-region="overlay"]');
  const navigation = region.querySelector('.lm-settings-navigation');
  const roots = () => [...region.querySelectorAll('.lm-root')];
  assert.ok(region.contains(dialog(s)));
  assert.equal(s.surface.querySelector('.lm-workspace-panel').hidden, true, 'Settings owns no panel contribution');
  assert.equal(navigation.style.backgroundColor, '');
  for (const root of roots()) assert.ok(['', 'transparent'].includes(root.style.backgroundColor));
  category(s, 'Example').click(); await flush();
  assert.deepEqual(form.seen.at(-1).presentation, { mode: 'embedded', sizing: 'content' });
  s.tools.themes.register({ id: 'test.palette', name: 'Palette', properties: { colors: { background: '#fafafa', panel: '#223344', text: '#112233' } } }, s.ctx.signal);
  s.tools.themes.select('test.palette'); await flush();
  assert.equal(navigation.style.backgroundColor, '');
  for (const root of roots()) assert.ok(['', 'transparent'].includes(root.style.backgroundColor));
  assert.equal(s.surface.querySelector('.lm-settings-page').style.backgroundColor, '');
  assert.equal(s.surface.querySelector('.lm-workspace-layout').closest('.lm-root').style.backgroundColor, 'rgb(250, 250, 250)');
  await form.owner.dispose(); await flush();
  const fallback = s.surface.querySelector('[data-settings-section] .lm-workspace-empty').closest('.lm-root');
  assert.equal(fallback.style.containerType, 'inline-size'); assert.equal(fallback.style.backgroundColor, 'transparent');
  assert.equal(s.surface.querySelector('[data-settings-section]').style.backgroundColor, '');
  await s.stop();
});

test('the bottom rail action opens an accessible empty dialog without selecting a sidebar or screen tab', async () => {
  const s = await setup(); await s.open();
  assert.equal(button(s).parentElement.classList.contains('lm-sidebar-end'), true);
  assert.equal(button(s).getAttribute('aria-haspopup'), 'dialog');
  await openSettings(s);
  assert.match(dialog(s).textContent, /No settings available/);
  assert.equal(dialog(s).getAttribute('aria-modal'), 'true');
  assert.equal(s.tools.sidebar.snapshot().activeId, null);
  assert.deepEqual(s.tools.settings.snapshot(), { categories: [], sections: [], groups: [], items: [] });
  assert.equal(s.tools.screens.snapshot().activeId, null); assert.deepEqual(s.preferenceWrites, []); await s.stop();
});
test('desktop Settings preserves workspace and sidebar selection, theme updates and focus on dismissal', async () => {
  const s = await setup(); const view = panel(s, 'test.controls'); panel(s, 'test.files'); panel(s, 'test.editor'); register(s); section(s);
  s.tools.sidebar.register({ id: 'test.files', title: 'Files', icon: 'files', componentId: 'test.files' }, s.ctx.signal);
  s.tools.screens.register({ id: 'test.editor', componentId: 'test.editor', props: { tabTitle: 'Document' } }, s.ctx.signal);
  await s.open(); s.tools.screens.select('test.editor'); await flush();
  const editor = s.surface.querySelector('[data-panel="test.editor"]');
  const sidebar = s.surface.querySelector('[data-panel="test.files"]');
  const opener = button(s); opener.focus(); await openSettings(s);
  assert.equal(s.tools.screens.snapshot().activeId, 'test.editor');
  assert.equal(s.tools.sidebar.snapshot().activeId, 'test.files');
  assert.ok(editor?.isConnected && sidebar?.isConnected);
  const background = s.surface.querySelector('.lm-workspace-background');
  assert.equal(background.hasAttribute('inert'), true);
  const content = s.surface.querySelector('[data-settings-section="test.section"] article'); assert.ok(content);
  s.tools.settings.updateSection('test.section', { title: 'Updated controls', props: { label: 'Changed' } }); await flush();
  assert.equal(s.surface.querySelector('[data-settings-section="test.section"] article'), content); assert.match(content.textContent, /Changed/);
  s.tools.localization.register('test.translations', { en: {}, fr: {} }, s.ctx.signal); s.tools.localization.setLocale('fr');
  s.tools.themes.select(null); await flush(); assert.equal(s.surface.querySelector('[data-settings-section="test.section"] article'), content);
  assert.equal(category(s, 'Example').getAttribute('aria-current'), 'page');
  dialog(s).querySelector('[aria-label="Close settings"]').dispatchEvent(new s.dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await flush();
  assert.ok(!dialog(s)); assert.equal(background.hasAttribute('inert'), false);
  assert.ok(s.dom.window.document.activeElement === opener, 'Desktop focus returns to the rail action');
  assert.equal(s.surface.querySelector('[data-panel="test.editor"]'), editor);
  assert.equal(s.surface.querySelector('[data-panel="test.files"]'), sidebar);
  assert.equal(view.releases.length, 1);
  await openSettings(s); s.surface.querySelector('.lm-settings-window-backdrop').click(); await flush();
  assert.ok(!dialog(s)); assert.equal(view.releases.length, 2);
  assert.deepEqual(s.preferenceWrites, []); await s.stop();
});
test('switching categories releases old sections and supports categories without controls', async () => {
  const s = await setup(); const view = panel(s, 'test.controls'); register(s); register(s, 'test.other', 'Other'); section(s); await s.open();
  await openSettings(s); const old = s.surface.querySelector('[data-settings-section]');
  const page = s.surface.querySelector('.lm-settings-page'); page.scrollTop = 420;
  s.tools.settings.updateCategory('test.category', { title: 'Translated' }); await flush();
  assert.equal(page.scrollTop, 420, 'updates within the current category preserve the reading position');
  category(s, 'Other').click(); await flush(); assert.equal(old.isConnected, false); assert.equal(view.releases.length, 1);
  assert.equal(s.surface.querySelector('.lm-settings-page').scrollTop, 0);
  assert.match(s.surface.querySelector('.lm-settings-page').textContent, /No settings in this category/); await s.stop();
});
test('orphan and missing sections appear after late category/role registration, recover and leave on owner removal', async () => {
  const s = await setup(); const owner = s.ctx.scope.child(); section(s, {}, owner.signal); await s.open();
  await openSettings(s); register(s); await flush();
  assert.match(s.surface.querySelector('.lm-settings-page').textContent, /Section unavailable/);
  const view = panel(s, 'test.controls'); await flush(); assert.ok(s.surface.querySelector('[data-settings-section] article'));
  await view.owner.dispose(); await flush(); assert.match(s.surface.querySelector('.lm-settings-page').textContent, /Section unavailable/);
  panel(s, 'test.controls'); await flush(); assert.ok(s.surface.querySelector('[data-settings-section] article'));
  await owner.dispose(); await flush(); assert.equal(s.surface.querySelector('[data-settings-section]'), null); await s.stop();
});
test('Vault changes close settings and cancel section instances', async () => {
  const s = await setup(); const view = panel(s, 'test.controls'); register(s); section(s); await s.open();
  await openSettings(s); const old = s.surface.querySelector('[data-settings-section]');
  await s.open(); assert.equal(old.isConnected, false); assert.ok(!dialog(s));
  assert.equal(s.tools.screens.snapshot().activeId, null); assert.equal(view.releases.length, 1);
  await openSettings(s); assert.match(s.surface.querySelector('.lm-settings-page').textContent, /Example/);
  await s.service.close(); await flush(); assert.equal(s.surface.querySelector('.lm-settings-page'), null); await s.stop();
});

test('failed sections recover after props updates and removing the current category releases its view', async () => {
  const s = await setup(); const options = { fail: true }; const view = panel(s, 'test.controls', options);
  const owner = s.ctx.scope.child(); s.tools.settings.registerCategory({ id: 'test.category', title: 'Example' }, owner.signal); section(s); await s.open();
  await openSettings(s); assert.match(s.surface.querySelector('.lm-settings-page').textContent, /Section unavailable/);
  options.fail = false; s.tools.settings.updateSection('test.section', { title: 'Recovered', props: { label: 'Ready' } }); await flush();
  assert.match(s.surface.querySelector('[data-settings-section] article').textContent, /Ready/);
  await owner.dispose(); await flush(); assert.equal(view.releases.length, 1); assert.equal(s.surface.querySelector('[data-settings-section]'), null);
  assert.match(dialog(s).textContent, /No settings available/); await s.stop();
});

test('closing Settings releases its inputs and an old category button cannot reopen it', async () => {
  const s = await setup(); register(s); section(s); let disposed = 0;
  s.tools.components.register({ id: 'test.controls', mount(target) {
    const input = target.ownerDocument.createElement('input'); target.append(input);
    return { update() {}, dispose() { disposed++; input.remove(); } };
  } }, s.ctx.signal);
  await s.open(); await openSettings(s); const oldButton = category(s, 'Example');
  const input = s.surface.querySelector('[data-settings-section] input'); input.value = 'Draft';
  s.tools.screens.select(null); await flush(); assert.equal(input.isConnected, true);
  await close(s); assert.equal(input.isConnected, false); assert.equal(disposed, 1);
  oldButton.click(); await flush(); assert.ok(!dialog(s));
  await s.open(); oldButton.click(); await flush(); assert.ok(!dialog(s)); await s.stop();
});

const group = (s, id = 'test.group', extra = {}, owner = s.ctx.signal) => s.tools.settings.registerGroup({ id, categoryId: 'test.category', title: 'Group', ...extra }, owner);
const item = (s, id, extra = {}, owner = s.ctx.signal) => s.tools.settings.registerItem({ id, groupId: 'test.group', title: id, type: 'text', value: '', onChange() {}, ...extra }, owner);
const openCategory = async s => { await s.open(); await openSettings(s); category(s, 'Example').click(); await flush(); };

test('category icons follow public metadata and slider reset shares item cancellation and pending guards', async () => {
  const s = await setup(); register(s); group(s);
  s.tools.settings.updateCategory('test.category', { title: 'Example', icon: 'palette' });
  s.tools.settings.registerCategory({ id: 'test.editor', title: 'Editor', icon: 'editor' }, s.ctx.signal);
  s.tools.settings.registerCategory({ id: 'test.files', title: 'Files', icon: 'folder' }, s.ctx.signal);
  const owner = s.ctx.scope.child(); const pending = Promise.withResolvers(); const contexts = [];
  item(s, 'test.slider', { type: 'slider', value: 18, min: 12, max: 32, step: 1, unit: 'px', resetLabel: 'Use theme',
    onChange() {}, onReset(context) { contexts.push(context); return pending.promise; } }, owner.signal);
  await openCategory(s);
  const icons = ['Example', 'Editor', 'Files'].map(title => category(s, title).querySelector('svg').innerHTML);
  assert.equal(new Set(icons).size, 3);
  const headingIcon = s.surface.querySelector('.lm-settings-page h1 svg');
  assert.equal(headingIcon.innerHTML, icons[0]);
  assert.equal(headingIcon.getAttribute('aria-hidden'), 'true');
  const slider = s.surface.querySelector('[role=slider]'); assert.equal(slider.getAttribute('aria-valuenow'), '18');
  const reset = s.surface.querySelector('.lm-setting-reset'); reset.click(); reset.click(); await flush();
  assert.equal(contexts.length, 1); assert.equal(contexts[0].vaultId, 'vault-1'); assert.equal(reset.disabled, true);
  await owner.dispose(); await flush(); assert.equal(contexts[0].signal.aborted, true);
  assert.equal(s.surface.querySelector('[role=slider]'), null);
  pending.resolve(); await flush(); await s.stop();
});

test('declarative groups compose ordered controls from different owners, preserve inputs and honor registered placement', async () => {
  const s = await setup(); register(s); const other = s.ctx.scope.child(); group(s, 'test.group', { description: 'Interface preferences', order: 10 });
  group(s, 'test.earlier', { title: 'First', order: -1 });
  const seen = [];
  const change = id => (value, context) => {
    seen.push({ id, value, context }); const original = s.tools.settings.snapshot().items.find(item => item.id === id);
    const { id: _, groupId, order, ...presentation } = original;
    s.tools.settings.updateItem(id, { ...presentation, value });
  };
  item(s, 'test.text', { title: 'Name', description: 'Visible name', value: 'Old', order: 10, layout: 'stacked', onChange: change('test.text') });
  item(s, 'test.switch', { type: 'switch', title: 'Enabled', value: false, order: 0, onChange: change('test.switch') }, other.signal);
  item(s, 'test.number', { type: 'number', title: 'Size', value: 2, min: 1, max: 8, onChange: change('test.number') });
  await openCategory(s);
  assert.deepEqual([...s.surface.querySelectorAll('[data-settings-section]')].map(node => node.dataset.settingsSection), ['test.earlier', 'test.group']);
  assert.deepEqual([...s.surface.querySelectorAll('[data-settings-item]')].map(node => node.dataset.settingsItem), ['test.switch', 'test.number', 'test.text']);
  const row = s.surface.querySelector('[data-settings-item="test.text"]'); const input = row.querySelector('input');
  assert.equal(row.dataset.layout, 'stacked'); assert.ok(s.surface.textContent.includes('Interface preferences'));
  typeInput(input, 'New'); await flush(); assert.equal(input.value, 'New'); assert.equal(row.querySelector('input'), input);
  s.surface.querySelector('[data-settings-item="test.switch"] input').click(); await flush();
  assert.deepEqual(seen.map(value => value.value), ['New', true]); assert.equal(seen[0].context.vaultId, 'vault-1'); assert.ok(Object.isFrozen(seen[0].context));
  s.tools.settings.updateGroup('test.group', { title: 'Translated' }); await flush(); assert.equal(row.querySelector('input'), input);
  assert.equal(row.closest('.lm-root').style.backgroundColor, 'transparent'); assert.equal(row.closest('.lm-root').style.containerType, 'inline-size');
  await other.dispose(); await flush(); assert.equal(s.surface.querySelector('[data-settings-item="test.switch"]'), null); assert.equal(row.querySelector('input'), input);
  await s.stop();
});

test('removing an owned item aborts its pending context without disturbing siblings; switching Vault aborts remaining contexts', async () => {
  const s = await setup(); register(s); group(s); const owner = s.ctx.scope.child(); const contexts = []; const resolvers = [];
  const pending = (_, context) => { contexts.push(context); return new Promise(resolve => resolvers.push(resolve)); };
  item(s, 'test.pending', { onChange: pending }, owner.signal); item(s, 'test.sibling', { onChange: pending }); await openCategory(s);
  const first = s.surface.querySelector('[data-settings-item="test.pending"] input'); const sibling = s.surface.querySelector('[data-settings-item="test.sibling"] input');
  typeInput(first, 'Start'); await flush(); assert.equal(first.disabled, true); assert.equal(contexts[0].signal.aborted, false);
  await owner.dispose(); await flush(); assert.equal(contexts[0].signal.aborted, true); assert.equal(first.isConnected, false); assert.equal(sibling.isConnected, true);
  typeInput(first, 'Stale'); await flush(); assert.equal(contexts.length, 1);
  typeInput(sibling, 'Next'); await flush(); await s.open(); assert.equal(contexts[1].signal.aborted, true); assert.equal(sibling.isConnected, false);
  for (const resolve of resolvers) resolve(); await flush(); assert.equal(s.surface.querySelector('[role=alert]'), null); await s.stop();
});

test('declarative callback failures are contained, logged with the original error and remain editable', async () => {
  const s = await setup(); register(s); group(s); const original = new Error('Controller failure');
  item(s, 'test.failing', { onChange: async () => { throw original; } }); await openCategory(s);
  const input = s.surface.querySelector('[data-settings-item] input'); typeInput(input, 'Change'); await flush();
  assert.match(s.surface.querySelector('[role=alert]').textContent, /Cannot update this setting/); assert.equal(input.disabled, false);
  assert.ok(s.logs.some(log => log[0] === 'error' && log[3]?.error === original)); await s.stop();
});

test('mobile Settings opens full screen from the dock and navigates between the list and category', async () => {
  const s = await setupWorkspace({ settings: true, mobileMenu: true });
  try {
    let width = 360; let resize;
    const { ResizeObserver } = s.dom.window;
    s.dom.window.ResizeObserver = globalThis.ResizeObserver = class extends ResizeObserver {
      constructor(callback) { super(callback); this.callback = callback; }
      observe(element) { if (element.classList.contains('lm-workspace-layout')) resize = this.callback; }
    };
    s.dom.window.HTMLElement.prototype.getBoundingClientRect = () => new s.dom.window.DOMRect(0, 0, width, 720);
    const view = panel(s, 'test.controls'); register(s); section(s); await s.open();
    s.tools.settings.updateCategory('test.category', { title: 'Example', icon: 'palette' });
    assert.ok(!s.surface.querySelector('.lm-sidebar-rail button[aria-label="Settings"]'));
    const launcher = s.surface.querySelector('.lm-workspace-mobile-toolbar button[aria-label="Settings"]');
    assert.ok(launcher); launcher.focus(); launcher.click(); await flush();
    assert.equal(dialog(s).hasAttribute('data-full-screen'), true);
    assert.ok(!s.surface.querySelector('.lm-settings-page'));
    const entry = category(s, 'Example'); assert.ok(entry);
    const navigation = entry.closest('.lm-settings-navigation'); navigation.scrollTop = 40;
    entry.click(); await flush();
    assert.equal(entry.closest('[hidden]')?.className, 'lm-settings-window-navigation');
    const title = dialog(s).querySelector('.lm-settings-dialog-title');
    assert.equal(title.textContent, 'Example');
    assert.ok(title.querySelector('svg'));
    const viewNode = dialog(s).querySelector('[data-settings-section] article'); assert.ok(viewNode);
    width = 1200; resize(); await flush();
    assert.equal(dialog(s).hasAttribute('data-full-screen'), false);
    assert.ok(dialog(s).querySelector('[data-settings-section] article') === viewNode);
    width = 360; resize(); await flush();
    assert.equal(dialog(s).hasAttribute('data-full-screen'), true);
    assert.ok(dialog(s).querySelector('[data-settings-section] article') === viewNode);
    const back = dialog(s).querySelector('[aria-label="Back to categories"]');
    back.click(); await flush();
    assert.ok(!s.surface.querySelector('.lm-settings-page'));
    assert.equal(view.releases.length, 1);
    assert.equal(navigation.scrollTop, 40);
    assert.ok(s.dom.window.document.activeElement === entry, 'Back restores the category row');
    assert.equal(s.tools.screens.snapshot().activeId, null);
    assert.equal(s.tools.navigation.isOpen(), false);
    await close(s); assert.ok(!dialog(s));
    assert.ok(s.dom.window.document.activeElement === launcher, 'Mobile focus returns to the dock action');
  } finally { await s.stop(); }
});
