import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { setupWorkspace, panel, flush } from '../../../../tools/test/workspace.mjs';

const setup = options => setupWorkspace({ activeScreen: true, ...options });
const definition = (id, componentId = 'test.content', props = {}) => ({ id, componentId, props });
const target = (s, id) => s.surface.querySelector(`[data-screen-id="${id}"]`);
const active = s => [...s.surface.querySelectorAll('.lm-screen-target')].filter(element => !element.hidden);

test('screen selection and Sidebar tools have independent targets and lifetimes', async () => {
  const s = await setup({ sidebar: true }); const main = panel(s, 'test.main'); const side = panel(s, 'test.side'); await s.open();
  s.tools.screens.register(definition('test.one', 'test.main'), s.ctx.signal); s.tools.screens.select('test.one');
  s.tools.sidebar.register({ id: 'test.files', title: 'Files', icon: 'files', componentId: 'test.side' }, s.ctx.signal); await flush();
  const article = target(s, 'test.one').querySelector('article');
  assert.ok(s.surface.querySelector('.lm-workspace-panel article'));
  s.tools.sidebar.select(null); await flush(); assert.equal(target(s, 'test.one').querySelector('article'), article);
  assert.equal(main.releases.length, 0); assert.equal(side.releases.length, 1);
  s.tools.sidebar.select('test.files'); s.tools.screens.select(null); await flush();
  assert.ok(s.surface.querySelector('.lm-workspace-panel article')); assert.equal(article.isConnected, true); await s.stop();
});

test('a screen selecting another screen during mount converges without nested rendering or stale visibility', async () => {
  const s = await setup(); panel(s, 'test.destination'); let mounts = 0;
  s.tools.components.register({ id: 'test.redirect', mount() {
    mounts++; s.tools.screens.select('test.two'); return { update() {}, dispose() {} };
  } }, s.ctx.signal);
  await s.open();
  s.tools.screens.register(definition('test.one', 'test.redirect'), s.ctx.signal);
  s.tools.screens.register(definition('test.two', 'test.destination'), s.ctx.signal);
  s.tools.screens.select('test.one'); await flush();
  assert.equal(mounts, 1); assert.equal(s.tools.screens.snapshot().activeId, 'test.two');
  assert.equal(active(s)[0], target(s, 'test.two')); assert.equal(target(s, 'test.one').hidden, true);
  await s.stop();
});

test('no active screen uses the empty state and registration does not mount or open content', async () => {
  const s = await setup(); const view = panel(s, 'test.content'); await s.open();
  assert.ok(s.surface.querySelector('.lm-active-screen'));
  assert.match(s.surface.textContent, /No workspace plugins/);
  s.tools.screens.register(definition('test.one'), s.ctx.signal); await flush();
  assert.equal(view.seen.length, 0); assert.equal(target(s, 'test.one'), null);
  assert.equal(s.tools.screens.snapshot().activeId, null); await s.stop();
});

test('switching and null selection retain instances, drafts and scroll; hidden screens lose focus', async () => {
  const s = await setup(); let mounts = 0; let releases = 0;
  s.tools.components.register({ id: 'test.form', mount(element, props, signal) {
    mounts++; const input = element.ownerDocument.createElement('input'); element.append(input);
    signal.addEventListener('abort', () => { releases++; }, { once: true });
    return { update() {}, dispose() { input.remove(); } };
  } }, s.ctx.signal);
  await s.open();
  s.tools.screens.register(definition('test.one', 'test.form'), s.ctx.signal);
  s.tools.screens.register(definition('test.two', 'test.form'), s.ctx.signal);
  s.tools.screens.select('test.one'); await flush();
  const firstTarget = target(s, 'test.one'); const firstInput = firstTarget.querySelector('input');
  firstInput.value = 'Unsaved draft'; firstInput.focus(); firstTarget.scrollTop = 34;
  s.tools.screens.select('test.two'); await flush();
  assert.equal(firstTarget.hidden, true); assert.equal(firstTarget.hasAttribute('inert'), true);
  assert.equal(firstTarget.getAttribute('aria-hidden'), 'true'); assert.notEqual(s.dom.window.document.activeElement, firstInput);
  assert.equal(active(s).length, 1); assert.equal(releases, 0); assert.equal(mounts, 2);
  s.tools.screens.select(null); await flush(); assert.match(s.surface.textContent, /No workspace plugins/);
  assert.equal(firstInput.isConnected, true);
  s.tools.screens.select('test.one'); await flush();
  assert.equal(target(s, 'test.one'), firstTarget); assert.equal(firstTarget.querySelector('input'), firstInput);
  assert.equal(firstInput.value, 'Unsaved draft'); assert.equal(firstTarget.scrollTop, 34); assert.equal(mounts, 2);
  assert.equal(active(s)[0], firstTarget); assert.equal(firstTarget.hasAttribute('inert'), false);
  await s.stop(); assert.equal(releases, 2);
});

test('prop, theme and locale refreshes preserve mounted target identity and owner removal clears selection', async () => {
  const s = await setup(); const view = panel(s, 'test.content'); await s.open(); const owner = s.ctx.scope.child();
  s.tools.screens.register(definition('test.one'), owner.signal); s.tools.screens.select('test.one'); await flush();
  const element = target(s, 'test.one'); const node = element.querySelector('article');
  s.tools.screens.update('test.one', { label: 'Changed' }); await flush();
  assert.equal(target(s, 'test.one'), element); assert.equal(element.querySelector('article'), node); assert.match(node.textContent, /Changed/);
  s.tools.themes.register({ id: 'test.light', name: 'Light', properties: { colors: { background: '#ffffff', text: '#202020' } } }, s.ctx.signal);
  s.tools.themes.select('test.light'); await flush();
  s.tools.localization.register('test.locale', { en: {}, fr: {} }, s.ctx.signal);
  s.tools.localization.setLocale('fr'); await flush();
  assert.equal(target(s, 'test.one'), element); assert.equal(element.querySelector('article'), node);
  assert.equal(view.releases.length, 0);
  await owner.dispose(); await flush(); assert.equal(target(s, 'test.one'), null);
  assert.equal(s.tools.screens.snapshot().activeId, null); assert.equal(view.releases.length, 1); await s.stop();
});

test('missing, removed and replacement roles preserve logical selection and recover without changing other screens', async () => {
  const s = await setup(); await s.open();
  s.tools.screens.register(definition('test.one'), s.ctx.signal); s.tools.screens.select('test.one'); await flush();
  assert.equal(s.tools.screens.snapshot().activeId, 'test.one'); assert.match(s.surface.textContent, /Screen unavailable/);
  const first = panel(s, 'test.content'); await flush(); assert.ok(target(s, 'test.one').querySelector('article'));
  await first.owner.dispose(); await flush(); assert.match(s.surface.textContent, /Screen unavailable/);
  assert.equal(s.tools.screens.snapshot().activeId, 'test.one');
  panel(s, 'test.content'); await flush(); assert.ok(target(s, 'test.one').querySelector('article'));
  assert.equal(target(s, '__placeholder').hidden, true); await s.stop();
});

test('failed mount and update release failed instances and recover through a later props update', async () => {
  const s = await setup(); const options = { fail: true }; const view = panel(s, 'test.content', options); await s.open();
  s.tools.screens.register(definition('test.one'), s.ctx.signal); s.tools.screens.select('test.one'); await flush();
  assert.match(s.surface.textContent, /Screen unavailable/);
  options.fail = false; s.tools.screens.update('test.one', { label: 'Recovered' }); await flush();
  assert.match(target(s, 'test.one').textContent, /Recovered/);
  options.updateFail = true; s.tools.screens.update('test.one', { label: 'Failure' }); await flush();
  assert.match(s.surface.textContent, /Screen unavailable/); assert.equal(view.releases.length, 1);
  options.updateFail = false; s.tools.screens.update('test.one', { label: 'Restored' }); await flush();
  assert.match(target(s, 'test.one').textContent, /Restored/); await s.stop();
});

test('Vault switch and close clear selection, release cached views and create fresh context on later activation', async () => {
  const s = await setup({ mobileMenu: true }); const view = panel(s, 'test.content'); await s.open();
  assert.equal(s.surface.querySelectorAll('.lm-active-screen').length, 1);
  assert.equal(s.surface.querySelector('.lm-workspace-mobile-toolbar').hidden, true);
  s.tools.screens.register(definition('test.one'), s.ctx.signal); s.tools.screens.select('test.one'); await flush();
  const old = target(s, 'test.one'); const vaultId = view.seen.at(-1).workspace.vaultId;
  const previousMounts = view.seen.length;
  await s.open(); assert.equal(old.isConnected, false); assert.equal(s.tools.screens.snapshot().activeId, null);
  assert.equal(s.surface.querySelectorAll('.lm-active-screen').length, 1);
  assert.equal(view.seen.length, previousMounts, 'a new Vault must not briefly mount the previously selected screen');
  assert.equal(s.tools.screens.snapshot().screens.length, 1); assert.equal(view.releases.length, 1);
  s.tools.screens.select('test.one'); await flush(); assert.notEqual(view.seen.at(-1).workspace.vaultId, vaultId);
  await s.service.close(); await flush(); assert.equal(s.surface.querySelector('.lm-active-screen'), null);
  assert.equal(s.tools.screens.snapshot().activeId, null); assert.equal(view.releases.length, 2);
  await s.open(); assert.match(s.surface.textContent, /No workspace plugins/); await s.stop();
});

test('compact Workspace shows one live tab counter and switches through the shared tab state', async () => {
  const s = await setup({ mobileMenu: true, sidebar: true });
  const { document, HTMLElement, DOMRect } = s.dom.window;
  let width = 360;
  let measureLayout;
  let measureDock;
  HTMLElement.prototype.getBoundingClientRect = function () {
    if (this.classList.contains('lm-workspace-mobile-toolbar')) return new DOMRect(width * .15, 660, this.hidden ? 0 : Math.round(width * .7), 52);
    return new DOMRect(0, 0, width, 720);
  };
  globalThis.ResizeObserver = s.dom.window.ResizeObserver = class {
    constructor(callback) { this.callback = callback; }
    observe(element) {
      if (element.classList.contains('lm-workspace-layout')) measureLayout = this.callback;
      if (element.classList.contains('lm-workspace-mobile-toolbar')) measureDock = this.callback;
    }
    unobserve() {}
    disconnect() {}
  };
  const menu = () => document.querySelector('.lm-mobile-choice-menu[role="menu"]');
  const command = label => [...menu().querySelectorAll('[role="menuitem"]')]
    .find(item => (item.getAttribute('aria-label') ?? item.textContent) === label);
  const openMenu = async button => { button.click(); await flush(); };
  try {
    const stylesheet = document.createElement('style');
    stylesheet.textContent = readFileSync(new URL('../../mantine-components/styles.css', import.meta.url), 'utf8')
      .replace(/^@import '([^']+)';$/gm, (_, path) => readFileSync(new URL(import.meta.resolve(path)), 'utf8'));
    document.head.append(stylesheet);
    panel(s, 'test.content');
    s.tools.sidebar.register({ id: 'test.files', title: 'Files', icon: 'files', componentId: 'test.content' }, s.ctx.signal);
    await s.open();
    assert.equal(s.surface.querySelectorAll('.lm-active-screen').length, 1);
    assert.equal(s.surface.querySelector('.lm-workspace-tab-strip'), null);
    assert.equal(s.surface.querySelector('.lm-workspace-tab-navigation'), null);
    const toolbar = s.surface.querySelector('.lm-workspace-mobile-toolbar');
    assert.equal(toolbar.hidden, false);
    assert.equal(s.dom.window.getComputedStyle(toolbar).width, '70%');
    const dockActions = toolbar.querySelector('.lm-mobile-menu-items');
    assert.equal(s.dom.window.getComputedStyle(dockActions).flexGrow, '1');
    assert.equal(dockActions.style.getPropertyValue('--group-justify'), 'space-evenly');
    const [back, forward, add, button, sidebar] = toolbar.querySelectorAll('button');
    assert.deepEqual([...toolbar.querySelectorAll('button')].map(action => action.getAttribute('aria-label')),
      ['Back', 'Forward', 'Add tab', 'Open tabs: 1', 'Sidebar']);
    assert.equal(back.disabled, true);
    assert.equal(forward.disabled, true);
    assert.equal(sidebar.disabled, false);
    assert.equal(button.textContent, '1');
    const glyph = s.dom.window.getComputedStyle(button.querySelector('.lm-mobile-page-count'));
    assert.equal(glyph.minInlineSize, '24px');
    assert.equal(glyph.minBlockSize, '20px');
    assert.equal(glyph.borderRadius, '5px');

    s.tools.screens.register(definition('test.one', 'test.content', { tabTitle: 'First screen' }), s.ctx.signal);
    s.tools.screens.select('test.one');
    await flush();
    add.click();
    await flush();
    assert.equal(toolbar.querySelector('[aria-label="Open tabs: 2"]'), button);
    assert.equal(button.textContent, '2');
    assert.equal(back.disabled, false);
    assert.equal(forward.disabled, true);
    back.click();
    await flush();
    assert.equal(s.tools.screens.snapshot().activeId, 'test.one');
    assert.equal(forward.disabled, false);
    forward.click();
    await flush();
    assert.equal(s.tools.screens.snapshot().activeId, null);
    assert.equal(forward.disabled, true);
    s.tools.localization.setLocale('ru');
    await flush();
    assert.equal(button.getAttribute('aria-label'), 'Открытые вкладки: 2');

    button.focus();
    button.click();
    await flush();
    assert.equal(button.getAttribute('aria-expanded'), 'true');
    assert.equal(button.getAttribute('aria-controls'), menu().id);
    assert.equal(menu().style.width, '252px');
    const { flushSync } = await import('react-dom');
    width = 420;
    flushSync(() => { measureLayout(); measureDock(); });
    await flush();
    assert.equal(menu().style.width, '294px');
    assert.equal(command('Добавить вкладку'), undefined);
    const currentTab = menu().querySelector('.lm-mobile-choice-row[data-selected]');
    const currentTabLabel = currentTab.querySelector('[aria-current="true"]');
    assert.equal(currentTabLabel.textContent, 'Новая вкладка');
    assert.equal(currentTabLabel.querySelector('svg'), null);
    assert.equal(currentTab.querySelector('[aria-label="Закрыть вкладку — Новая вкладка"]').disabled, false);
    assert.ok([...stylesheet.sheet.cssRules].some(rule =>
      rule.selectorText?.includes('.lm-mobile-choice-row[data-selected]::before') &&
      rule.style?.getPropertyValue('background') === 'var(--vault-accent)'));
    assert.equal(menu().classList.contains('lm-explorer-tab-menu'), true);
    const overlay = menu().closest('.lm-mobile-choice-overlay');
    assert.ok(overlay);
    assert.equal(s.surface.contains(menu()), false);
    const computed = s.dom.window.getComputedStyle;
    const menuStyle = computed(menu());
    assert.equal(menuStyle.overflowY, 'auto');
    assert.match(menuStyle.getPropertyValue('--mobile-choice-row-height'), /34px/);
    assert.match(menuStyle.maxHeight, /5\s*\*\s*var\(--mobile-choice-row-height\)/);
    assert.equal(computed(menu().querySelector('[role="menuitem"]')).minHeight, 'var(--mobile-choice-row-height)');
    assert.ok([...document.styleSheets].some(sheet => [...sheet.cssRules].some(rule =>
      rule.selectorText?.includes(`#${overlay.id}`) && rule.style?.getPropertyValue('--mantine-scale') === '1')));
    menu().dispatchEvent(new s.dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await delay(30);
    assert.equal(menu(), null);
    assert.equal(document.activeElement, button);
    button.click();
    await flush();
    const row = command('First screen');
    const next = new s.dom.window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true });
    row.dispatchEvent(next);
    assert.equal(next.defaultPrevented, true);
    row.click();
    await flush();
    assert.equal(menu(), null);
    assert.equal(s.tools.screens.snapshot().activeId, 'test.one');
    assert.equal(button.textContent, '2');

    await openMenu(button);
    command('Закрыть вкладку — Новая вкладка').click();
    await flush();
    assert.equal(button.textContent, '1');
    assert.equal(s.tools.screens.snapshot().activeId, 'test.one');
    await openMenu(button);
    command('Закрыть вкладку — First screen').click();
    await flush();
    assert.equal(s.tools.screens.snapshot().activeId, null);
    assert.equal(button.getAttribute('aria-label'), 'Открытые вкладки: 1');
    await openMenu(button);
    const disabledClose = command('Закрыть вкладку — Новая вкладка');
    assert.equal(disabledClose.disabled, true);
    disabledClose.click();
    await flush();
    assert.ok(menu());
    assert.equal(button.textContent, '1');
    button.click();
    await flush();

    width = 1000;
    flushSync(() => measureLayout());
    await flush();
    assert.equal(toolbar.hidden, true);
    assert.ok(s.surface.querySelector('.lm-workspace-tab-strip'));
    assert.ok(s.surface.querySelector('.lm-workspace-tab-navigation'));
    width = 360;
    flushSync(() => measureLayout());
    await flush();
    assert.equal(toolbar.hidden, false);
    assert.equal(s.surface.querySelector('.lm-workspace-tab-strip'), null);
    assert.equal(s.surface.querySelector('.lm-workspace-tab-navigation'), null);
    for (let index = 0; index < 6; index++) {
      add.click();
      await flush();
    }
    assert.equal(button.textContent, '7');
    await openMenu(button);
    assert.equal(menu().querySelectorAll('.lm-mobile-choice-row').length, 7);
    assert.equal(menu().querySelectorAll('[aria-current="true"]').length, 1);
    assert.equal(command('Добавить вкладку'), undefined);
    const lastRow = menu().querySelector('.lm-mobile-choice-row:last-child');
    lastRow.querySelector('.lm-mobile-choice-trailing').click();
    await flush();
    assert.equal(button.textContent, '6');
    await openMenu(button);
    await s.service.close();
    await flush();
    assert.equal(menu(), null);
    assert.deepEqual(s.tools.mobileMenu.list().filter(item => item.placement !== 'launcher').map(item => item.id), ['lunaris.sidebar.dock']);
  } finally { await s.stop(); }
});
