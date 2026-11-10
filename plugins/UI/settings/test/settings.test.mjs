import test from 'node:test';
import assert from 'node:assert/strict';
import { setupWorkspace, panel, flush } from '../../../../tools/test/workspace.mjs';
import { typeInput } from '../../../../tools/test/browser.mjs';
const setup = () => setupWorkspace({ settings: true });
const button = s => s.surface.querySelector('.lm-sidebar-tab[aria-label="Settings"]');
const category = (s, title) => [...s.surface.querySelectorAll('.lm-settings-category')].find(element => element.textContent === title);
const register = (s, id = 'test.category', title = 'Example') => s.tools.settings.registerCategory({ id, title }, s.ctx.signal);
const section = (s, extra = {}, owner = s.ctx.signal) => s.tools.settings.registerSection({ id: 'test.section', categoryId: 'test.category', title: 'Controls', componentId: 'test.controls', ...extra }, owner);

test('Settings preserves the Workspace panel surface and lends explicit embedded intrinsic presentation to sections', async () => {
  const s = await setup(); const form = panel(s, 'test.controls'); register(s);
  section(s, { props: { presentation: { mode: 'standalone', sizing: 'fill' } } }); await s.open();
  s.tools.sidebar.select('lunaris.settings.navigation'); await flush();
  const region = s.surface.querySelector('.lm-workspace-panel');
  const navigation = region.querySelector('.lm-settings-navigation');
  const roots = () => [...region.querySelectorAll('.lm-root')];
  assert.ok(region.classList.contains('lm-workspace-card'));
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

test('foundation adds a bottom settings entry and shows empty navigation without fake settings or writes', async () => {
  const s = await setup(); await s.open();
  assert.equal(button(s).parentElement.classList.contains('lm-sidebar-end'), true);
  button(s).click(); await flush();
  // The sole tab may already be active; explicitly open it after a toggle.
  s.tools.sidebar.select('lunaris.settings.navigation'); await flush();
  assert.match(s.surface.querySelector('.lm-workspace-panel').textContent, /No settings available/);
  assert.deepEqual(s.tools.settings.snapshot(), { categories: [], sections: [], groups: [], items: [] });
  assert.equal(s.tools.screens.snapshot().activeId, null); assert.deepEqual(s.preferenceWrites, []); await s.stop();
});
test('categories open one settings screen and section views survive props, locale, theme and Sidebar updates', async () => {
  const s = await setup(); const view = panel(s, 'test.controls'); register(s); section(s); await s.open();
  s.tools.sidebar.select('lunaris.settings.navigation'); await flush(); category(s, 'Example').click(); await flush();
  assert.equal(s.tools.screens.snapshot().activeId, 'lunaris.settings.screen');
  const content = s.surface.querySelector('[data-settings-section="test.section"] article'); assert.ok(content);
  s.tools.settings.updateSection('test.section', { title: 'Updated controls', props: { label: 'Changed' } }); await flush();
  assert.equal(s.surface.querySelector('[data-settings-section="test.section"] article'), content); assert.match(content.textContent, /Changed/);
  s.tools.localization.register('test.translations', { en: {}, fr: {} }, s.ctx.signal); s.tools.localization.setLocale('fr');
  s.tools.themes.select(null); await flush(); assert.equal(s.surface.querySelector('[data-settings-section="test.section"] article'), content);
  s.tools.sidebar.select(null); await flush(); assert.equal(content.isConnected, true);
  s.tools.sidebar.select('lunaris.settings.navigation'); await flush(); assert.equal(category(s, 'Example').getAttribute('aria-current'), 'page');
  assert.equal(view.releases.length, 0); assert.deepEqual(s.preferenceWrites, []); await s.stop();
});
test('switching categories releases old sections and supports categories without controls', async () => {
  const s = await setup(); const view = panel(s, 'test.controls'); register(s); register(s, 'test.other', 'Other'); section(s); await s.open();
  category(s, 'Example').click(); await flush(); const old = s.surface.querySelector('[data-settings-section]');
  category(s, 'Other').click(); await flush(); assert.equal(old.isConnected, false); assert.equal(view.releases.length, 1);
  assert.match(s.surface.querySelector('.lm-settings-page').textContent, /No settings in this category/); await s.stop();
});
test('orphan and missing sections appear after late category/role registration, recover and leave on owner removal', async () => {
  const s = await setup(); const owner = s.ctx.scope.child(); section(s, {}, owner.signal); await s.open();
  register(s); await flush(); category(s, 'Example').click(); await flush();
  assert.match(s.surface.querySelector('.lm-settings-page').textContent, /Section unavailable/);
  const view = panel(s, 'test.controls'); await flush(); assert.ok(s.surface.querySelector('[data-settings-section] article'));
  await view.owner.dispose(); await flush(); assert.match(s.surface.querySelector('.lm-settings-page').textContent, /Section unavailable/);
  panel(s, 'test.controls'); await flush(); assert.ok(s.surface.querySelector('[data-settings-section] article'));
  await owner.dispose(); await flush(); assert.equal(s.surface.querySelector('[data-settings-section]'), null); await s.stop();
});
test('Vault changes clear selected categories and section instances without reopening settings', async () => {
  const s = await setup(); const view = panel(s, 'test.controls'); register(s); section(s); await s.open();
  category(s, 'Example').click(); await flush(); const old = s.surface.querySelector('[data-settings-section]');
  await s.open(); assert.equal(old.isConnected, false); assert.equal(s.tools.screens.snapshot().activeId, null);
  assert.equal(category(s, 'Example').getAttribute('aria-current'), null); assert.ok(view.releases.length >= 1);
  category(s, 'Example').click(); await flush(); assert.match(s.surface.querySelector('.lm-settings-page').textContent, /Example/);
  await s.service.close(); await flush(); assert.equal(s.surface.querySelector('.lm-settings-page'), null); await s.stop();
});

test('failed sections recover after props updates and removing the current category releases its view', async () => {
  const s = await setup(); const options = { fail: true }; const view = panel(s, 'test.controls', options);
  const owner = s.ctx.scope.child(); s.tools.settings.registerCategory({ id: 'test.category', title: 'Example' }, owner.signal); section(s); await s.open();
  category(s, 'Example').click(); await flush(); assert.match(s.surface.querySelector('.lm-settings-page').textContent, /Section unavailable/);
  options.fail = false; s.tools.settings.updateSection('test.section', { title: 'Recovered', props: { label: 'Ready' } }); await flush();
  assert.match(s.surface.querySelector('[data-settings-section] article').textContent, /Ready/);
  await owner.dispose(); await flush(); assert.equal(view.releases.length, 1); assert.equal(s.surface.querySelector('[data-settings-section]'), null);
  assert.match(s.surface.querySelector('.lm-settings-page').textContent, /Select a category/); await s.stop();
});

test('screen switching preserves settings inputs; callbacks from a released navigation view are inert', async () => {
  const s = await setup(); register(s); section(s); let disposed = 0;
  s.tools.components.register({ id: 'test.controls', mount(target) {
    const input = target.ownerDocument.createElement('input'); target.append(input);
    return { update() {}, dispose() { disposed++; input.remove(); } };
  } }, s.ctx.signal);
  await s.open(); const oldButton = category(s, 'Example'); oldButton.click(); await flush();
  const input = s.surface.querySelector('[data-settings-section] input'); input.value = 'Draft';
  s.tools.screens.select(null); await flush(); assert.equal(input.isConnected, true);
  category(s, 'Example').click(); await flush(); assert.equal(s.surface.querySelector('[data-settings-section] input'), input); assert.equal(input.value, 'Draft');
  s.tools.sidebar.select(null); await flush(); s.tools.screens.select(null); oldButton.click(); await flush();
  assert.equal(s.tools.screens.snapshot().activeId, null);
  await s.open(); oldButton.click(); await flush(); assert.equal(s.tools.screens.snapshot().activeId, null); assert.equal(disposed, 1); await s.stop();
});

const group = (s, id = 'test.group', extra = {}, owner = s.ctx.signal) => s.tools.settings.registerGroup({ id, categoryId: 'test.category', title: 'Group', ...extra }, owner);
const item = (s, id, extra = {}, owner = s.ctx.signal) => s.tools.settings.registerItem({ id, groupId: 'test.group', title: id, type: 'text', value: '', onChange() {}, ...extra }, owner);
const openCategory = async s => { await s.open(); s.tools.sidebar.select('lunaris.settings.navigation'); await flush(); category(s, 'Example').click(); await flush(); };

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

test('opening a settings category closes mobile presentation while preserving navigation selection', async () => {
 const s=await setupWorkspace({settings:true,mobileMenu:true});
 try {
  s.dom.window.HTMLElement.prototype.getBoundingClientRect=()=>new s.dom.window.DOMRect(0,0,360,720);
  register(s); await s.open(); s.tools.sidebar.select('lunaris.settings.navigation'); await flush();
  s.tools.navigation.open(); await flush(); assert.equal(s.tools.navigation.isOpen(),true);
  category(s,'Example').click(); await flush(); assert.equal(s.tools.navigation.isOpen(),false);
  assert.equal(s.tools.screens.snapshot().activeId,'lunaris.settings.screen');
  s.tools.navigation.open(); await flush(); category(s,'Example').click(); await flush();
  assert.equal(s.tools.navigation.isOpen(),false);
 } finally {await s.stop();}
});
