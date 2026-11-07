import test from 'node:test';
import assert from 'node:assert/strict';
import { setupWorkspace, panel, flush } from '../../../../tools/test/workspace.mjs';
const setup = () => setupWorkspace({ settings: true });
const button = s => s.surface.querySelector('.lm-sidebar-tab[aria-label="Settings"]');
const category = (s, title) => [...s.surface.querySelectorAll('.lm-settings-category')].find(element => element.textContent === title);
const register = (s, id = 'test.category', title = 'Example') => s.tools.settings.registerCategory({ id, title }, s.ctx.signal);
const section = (s, extra = {}, owner = s.ctx.signal) => s.tools.settings.registerSection({ id: 'test.section', categoryId: 'test.category', title: 'Controls', componentId: 'test.controls', ...extra }, owner);

test('foundation adds a bottom settings entry and shows empty navigation without fake settings or writes', async () => {
  const s = await setup(); await s.open();
  assert.equal(button(s).parentElement.classList.contains('lm-sidebar-end'), true);
  button(s).click(); await flush();
  // The sole tab may already be active; explicitly open it after a toggle.
  s.tools.sidebar.select('lunaris.settings.navigation'); await flush();
  assert.match(s.surface.querySelector('.lm-workspace-panel').textContent, /No settings available/);
  assert.deepEqual(s.tools.settings.snapshot(), { categories: [], sections: [] });
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
