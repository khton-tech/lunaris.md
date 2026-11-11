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
  HTMLElement.prototype.getBoundingClientRect = () => new DOMRect(0, 0, 360, 720);
  const dialog = () => document.querySelector('[role="dialog"]');
  try {
    const stylesheet = document.createElement('style');
    stylesheet.textContent = readFileSync(new URL('../../mantine-components/styles.css', import.meta.url), 'utf8')
      .replace(/^@import '([^']+)';$/gm, (_, path) => readFileSync(new URL(import.meta.resolve(path)), 'utf8'));
    document.head.append(stylesheet);
    panel(s, 'test.content');
    await s.open();
    assert.equal(s.surface.querySelectorAll('.lm-active-screen').length, 1);
    const toolbar = s.surface.querySelector('.lm-workspace-mobile-toolbar');
    assert.equal(toolbar.hidden, false);
    assert.equal(toolbar.querySelectorAll('button').length, 1);
    const button = toolbar.querySelector('button');
    assert.equal(button.textContent, '1');
    assert.equal(button.getAttribute('aria-label'), 'Open tabs: 1');

    s.tools.screens.register(definition('test.one', 'test.content', { tabTitle: 'First screen' }), s.ctx.signal);
    s.tools.screens.select('test.one');
    await flush();
    s.surface.querySelector('.lm-workspace-tab-add').click();
    await flush();
    assert.equal(toolbar.querySelector('button'), button);
    assert.equal(button.textContent, '2');
    s.tools.localization.setLocale('ru');
    await flush();
    assert.equal(button.getAttribute('aria-label'), 'Открытые вкладки: 2');

    button.focus();
    button.click();
    await flush();
    assert.equal(dialog()?.querySelector('[aria-current="true"]')?.textContent, 'Новая вкладка');
    const modalRoot = dialog().closest('.mantine-Modal-root');
    const close = dialog().querySelector('button[aria-label="Скрыть список вкладок"]');
    const computed = s.dom.window.getComputedStyle;
    assert.equal(computed(close).display, 'inline-flex');
    assert.equal(computed(close).flexShrink, '0');
    assert.equal(close.querySelector('svg').getAttribute('width'), '1.15em');
    assert.equal(computed(dialog().querySelector('.lm-mobile-tabs-row')).minBlockSize, '44px');
    assert.ok([...document.styleSheets].some(sheet => [...sheet.cssRules].some(rule =>
      rule.selectorText?.includes(`#${modalRoot.id}`) && rule.style?.getPropertyValue('--mantine-scale') === '1')));
    close.click();
    await flush();
    assert.equal(dialog(), null);
    button.focus();
    button.click();
    await flush();
    document.activeElement.dispatchEvent(new s.dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await delay(30);
    assert.equal(dialog(), null);
    assert.equal(document.activeElement, button);
    button.click();
    await flush();
    const row = [...dialog().querySelectorAll('button')].find(item => item.textContent === 'First screen');
    row.click();
    await flush();
    assert.equal(dialog(), null);
    assert.equal(s.tools.screens.snapshot().activeId, 'test.one');
    assert.equal(button.textContent, '2');

    s.surface.querySelector('.lm-workspace-tab[data-selected] .lm-workspace-tab-action').click();
    await flush();
    assert.equal(button.textContent, '1');
    assert.equal(button.getAttribute('aria-label'), 'Открытые вкладки: 1');
    button.click();
    await flush();
    assert.ok(dialog());
    await s.service.close();
    await flush();
    assert.equal(dialog(), null);
    assert.deepEqual(s.tools.mobileMenu.list().filter(item => item.placement !== 'launcher'), []);
  } finally { await s.stop(); }
});
