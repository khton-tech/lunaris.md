import test from 'node:test';
import assert from 'node:assert/strict';
import { setupWorkspace as setup, panel, flush } from '../../../../tools/test/workspace.mjs';

test('selector hands off to an empty workspace and closing returns to the selector', async () => {
  const s = await setup(); assert.ok(s.surface.querySelector('.ln-vault')); assert.equal(s.surface.querySelector('.lm-workspace-empty'), null);
  s.surface.querySelector('.ln-vault-recents button').click(); await flush();
  assert.equal(s.surface.querySelector('.ln-vault'), null); assert.equal(s.surface.querySelector('[data-lunaris-slot="lunaris.vault-selector.screen"]'), null);
  assert.equal(s.surface.querySelector('h1'), null);
  assert.equal(s.surface.querySelector('.lm-workspace-header'), null);
  assert.equal(s.surface.querySelector('.lm-workspace-empty h2').textContent, 'No workspace plugins');
  assert.equal(s.surface.querySelectorAll('.lm-workspace-empty').length, 1);
  await s.service.close(); await flush();
  assert.equal(s.surface.querySelector('.lm-workspace-header'), null); assert.ok(s.surface.querySelector('.ln-vault'));
  assert.equal(s.surface.querySelector('[data-lunaris-slot="lunaris.workspace.screen"]'), null);
  await s.open(); assert.ok(s.surface.querySelector('.lm-workspace-empty')); await s.stop();
});

test('registrations before opening render after loaded and survive Vault switches with fresh owned instances', async () => {
  const s = await setup(); const p = panel(s);
  assert.equal(s.tools.workspace.register({ id: 'test.content', componentId: 'test.panel', props: { label: 'Files' } }, s.ctx.signal).ok, true);
  assert.equal(s.surface.querySelector('article'), null); await s.open();
  const old = s.surface.querySelector('article'); assert.equal(old.textContent, 'Files: Notes'); assert.equal(s.surface.querySelector('.lm-workspace-empty'), null);
  const firstVault = p.seen.at(-1).workspace.vaultId; assert.equal(Object.isFrozen(p.seen.at(-1).workspace), true);
  await s.open(); assert.equal(old.isConnected, false); assert.notEqual(s.surface.querySelector('article'), old);
  assert.notEqual(p.seen.at(-1).workspace.vaultId, firstVault); assert.deepEqual(p.releases, [firstVault]);
  assert.equal(s.tools.workspace.list().length, 1); await s.stop(); assert.equal(p.releases.length, 2);
});

test('placeholder follows consumer ownership, missing roles, late registration and role replacement', async () => {
  const s = await setup(); await s.open(); const owner = s.ctx.scope.child();
  s.tools.workspace.register({ id: 'test.content', componentId: 'test.panel' }, owner.signal);
  assert.ok(s.surface.querySelector('.lm-workspace-empty'));
  const first = panel(s); await flush(); assert.ok(s.surface.querySelector('article')); assert.equal(s.surface.querySelector('.lm-workspace-empty'), null);
  await first.owner.dispose(); await flush(); assert.equal(s.surface.querySelector('article'), null); assert.ok(s.surface.querySelector('.lm-workspace-empty'));
  const second = panel(s); await flush(); assert.ok(s.surface.querySelector('article'));
  await owner.dispose(); await flush(); assert.equal(s.surface.querySelector('article'), null); assert.equal(s.tools.workspace.list().length, 0);
  assert.ok(s.surface.querySelector('.lm-workspace-empty')); assert.equal(second.releases.length, 1);
  const replacement = s.ctx.scope.child();
  assert.equal(s.tools.workspace.register({ id: 'test.content', componentId: 'test.panel' }, replacement.signal).ok, true);
  await owner.dispose(); assert.ok(s.surface.querySelector('article')); await s.stop();
});

test('failed render and update restore the placeholder without leaving empty content slots', async () => {
  const s = await setup(); await s.open(); const options = { fail: true }; panel(s, 'test.panel', options);
  s.tools.workspace.register({ id: 'test.content', componentId: 'test.panel' }, s.ctx.signal);
  assert.ok(s.surface.querySelector('.lm-workspace-empty')); assert.equal(s.surface.querySelector('article'), null);
  options.fail = false; s.tools.workspace.update('test.content', { label: 'Recovered' }); assert.ok(s.surface.querySelector('article'));
  options.updateFail = true; s.tools.workspace.update('test.content', {}); assert.equal(s.surface.querySelector('article'), null);
  assert.ok(s.surface.querySelector('.lm-workspace-empty'));
  assert.equal(s.surface.querySelector('[data-lunaris-slot="lunaris.workspace.content"]').childElementCount, 1);
  assert.ok(s.logs.some(log => log[0] === 'error' && log[3]?.code === 'RENDER_FAILED')); await s.stop();
});

test('input validation, frozen copies, duplicate IDs and ordered content preserve the live registry', async () => {
  const s = await setup(); panel(s); await s.open(); const api = s.tools.workspace;
  for (const input of [null, {}, { id: 'test.bad', componentId: 'test.panel', props: { workspace: {} } }, { id: 'test.bad', componentId: 'test.panel', order: NaN },
    { id: 'test.bad', componentId: 'test.panel', get props() { throw new Error('Getter invoked'); } }]) assert.equal(api.register(input, s.ctx.signal).error.code, 'INVALID_ARGUMENT');
  const aborted = new AbortController(); aborted.abort(); assert.equal(api.register({ id: 'test.bad', componentId: 'test.panel' }, aborted.signal).ok, false);
  const props = { label: 'Last' }; api.register({ id: 'test.last', componentId: 'test.panel', props, order: 20 }, s.ctx.signal); props.label = 'Changed';
  api.register({ id: 'test.first', componentId: 'test.panel', props: { label: 'First' }, order: -20 }, s.ctx.signal);
  assert.deepEqual(api.list().map(item => item.id), ['test.first', 'test.last']);
  assert.equal(Object.isFrozen(api.list()), true); assert.equal(Object.isFrozen(api.list()[0].props), true);
  assert.deepEqual([...s.surface.querySelectorAll('article')].map(node => node.textContent), ['First: Notes', 'Last: Notes']);
  const root = s.surface.querySelector('[data-lunaris-slot="lunaris.workspace.screen"]'); assert.ok(root.firstElementChild.querySelector('.lm-workspace-layout'));
  assert.equal(api.register({ id: 'test.first', componentId: 'test.panel' }, s.ctx.signal).error.code, 'ALREADY_REGISTERED');
  assert.equal(api.update('test.missing', {}).error.code, 'NOT_FOUND'); assert.equal(api.update('test.first', { workspace: {} }).error.code, 'INVALID_ARGUMENT');
  api.update('test.first', { label: 'Updated' }); assert.equal(s.surface.querySelector('article').textContent, 'Updated: Notes'); await s.stop();
});

test('existing Vault appears after startup; localized messages and theme changes preserve content', async () => {
  const s = await setup({ current: { id: 'existing', name: '<img src=x> Notes' }, beforeLoaded(surface) {
    assert.equal(surface.querySelector('.lm-workspace-header'), null); assert.equal(surface.querySelector('.lm-workspace-empty'), null);
  } });
  assert.equal(s.surface.querySelector('.ln-vault'), null); assert.ok(s.surface.querySelector('.lm-workspace-empty')); assert.equal(s.surface.querySelector('img'), null);
  assert.equal(s.surface.querySelector('h1'), null);
  s.tools.themes.register({ id: 'test.light', name: 'Light', properties: { appearance: 'light', colors: { background: '#ffffff', text: '#202020' } } }, s.ctx.signal);
  s.tools.themes.select('test.light'); assert.equal(s.surface.querySelector('.lm-workspace-empty').closest('.lm-root').style.backgroundColor, 'transparent');
  assert.equal(s.surface.querySelector('.lm-workspace-layout').closest('.lm-root').style.backgroundColor, 'rgb(255, 255, 255)');
  s.tools.localization.register('test.languages', { en: { title: 'Language' }, fr: { title: 'Langue' } }, s.ctx.signal); s.tools.localization.setLocale('fr'); await flush();
  assert.ok(s.surface.querySelector('.lm-workspace-empty')); assert.equal(s.surface.querySelector('.lm-workspace-header'), null);
  assert.equal(s.dom.window.localStorage.length, 0); await s.stop();
});

test('missing placeholder role can arrive later; denied Vault permission enters host recovery', async () => {
  const s = await setup({ noKit: true }); await s.open(); assert.equal(s.surface.querySelector('section'), null);
  s.tools.components.register({ id: 'lunaris.workspace-layout', mount(target, props) {
    const root = target.ownerDocument.createElement('div'); const main = root.appendChild(target.ownerDocument.createElement('div'));
    const rail = root.appendChild(target.ownerDocument.createElement('div')); const panel = root.appendChild(target.ownerDocument.createElement('div')); target.append(root);
    props.onTargets({ main, 'left-rail': rail, 'left-panel': panel });
    return { update() {}, dispose() { props.onTargets(null); root.remove(); } };
  } }, s.ctx.signal);
  s.tools.components.register({ id: 'lunaris.workspace-empty', mount(target, props) {
    const node = target.ownerDocument.createElement('section'); node.className = 'replacement-empty'; node.textContent = props.title; target.append(node);
    return { update(next) { node.textContent = next.title; }, dispose() { node.remove(); } };
  } }, s.ctx.signal);
  await flush(); assert.equal(s.surface.querySelector('.replacement-empty').textContent, 'No workspace plugins'); await s.stop();
  const denied = await setup({ denied: true }); assert.equal(denied.session.snapshot().phase, 'fallback'); await denied.stop();
});

test('replacing a layout role releases content mounted in its old borrowed targets', async () => {
  const s = await setup({ noKit: true }); panel(s, 'test.content'); await s.open();
  s.tools.workspace.register({ id: 'test.main', componentId: 'test.content' }, s.ctx.signal);
  let failUpdate = false;
  function registerLayout(owner) {
    s.tools.components.register({ id: 'lunaris.workspace-layout', mount(target, props) {
      const root = target.ownerDocument.createElement('div'); const regions = Object.fromEntries(['main', 'left-rail', 'left-panel'].map(id => [id, root.appendChild(target.ownerDocument.createElement('div'))]));
      target.append(root); props.onTargets(regions);
      return { update() { if (failUpdate) throw new Error('Layout update failed'); }, dispose() { props.onTargets(null); root.remove(); } };
    } }, owner.signal);
  }
  const first = s.ctx.scope.child(); registerLayout(first); await flush(); const old = s.surface.querySelector('article'); assert.ok(old);
  await first.dispose(); await flush(); assert.equal(old.isConnected, false); assert.equal(s.surface.querySelector('article'), null);
  registerLayout(s.ctx.scope.child()); await flush(); assert.ok(s.surface.querySelector('article')); assert.notEqual(s.surface.querySelector('article'), old);
  failUpdate = true; s.tools.navigation.open(); await flush(); assert.equal(s.surface.querySelector('article'), null);
  failUpdate = false; s.tools.workspace.update('test.main', { label: 'Recovered' }); await flush(); assert.match(s.surface.querySelector('article').textContent, /Recovered/); await s.stop();
});

test('side panel resizes with pointer and keyboard, keeps targets stable and restores its global preference', async () => {
  const preferences = new Map([['sidePanelWidth', 360]]); const s = await setup({ preferences });
  let viewport = 1200;
  s.dom.window.HTMLElement.prototype.getBoundingClientRect = () => new s.dom.window.DOMRect(0, 0, viewport, 720);
  panel(s, 'test.files'); const owner = s.ctx.scope.child();
  s.tools.workspace.register({ id: 'test.files', componentId: 'test.files', region: 'left-panel' }, owner.signal); await s.open();
  const layout = s.surface.querySelector('.lm-workspace-layout'); const target = s.surface.querySelector('.lm-workspace-panel'); const article = target.querySelector('article');
  const handle = layout.querySelector('[role=separator]'); assert.equal(handle.getAttribute('aria-label'), 'Resize side panel');
  assert.equal(layout.style.getPropertyValue('--workspace-panel-width'), '360px');
  handle.dispatchEvent(new s.dom.window.MouseEvent('pointerdown', { button: 0, clientX: 360, bubbles: true }));
  s.dom.window.document.dispatchEvent(new s.dom.window.MouseEvent('pointerup', { clientX: 420, bubbles: true })); await flush();
  assert.equal(preferences.get('sidePanelWidth'), 420); assert.equal(s.preferenceWrites.length, 1);
  handle.dispatchEvent(new s.dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })); await flush();
  handle.dispatchEvent(new s.dom.window.KeyboardEvent('keyup', { key: 'ArrowRight', bubbles: true })); await flush();
  assert.equal(preferences.get('sidePanelWidth'), 428); assert.equal(s.preferenceWrites.length, 2);
  assert.equal(s.surface.querySelector('.lm-workspace-panel'), target); assert.equal(target.querySelector('article'), article);
  handle.dispatchEvent(new s.dom.window.KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true })); await flush();
  assert.equal(layout.querySelector('.lm-workspace-panel-pane').style.flexBasis, '192px');
  // Key repeats update the view; persistence waits for key release.
  assert.equal(preferences.get('sidePanelWidth'), 428);
  await owner.dispose(); await flush(); assert.equal(layout.hasAttribute('data-panel'), false);
  s.tools.workspace.register({ id: 'test.files', componentId: 'test.files', region: 'left-panel' }, s.ctx.signal); await flush();
  assert.equal(layout.style.getPropertyValue('--workspace-panel-width'), '428px');
  viewport = 500; await s.open();
  assert.equal(s.surface.querySelector('.lm-workspace-panel-pane').style.flexBasis, '236px');
  assert.equal(s.surface.querySelector('.lm-workspace-layout').style.getPropertyValue('--workspace-panel-width'), '428px');
  assert.equal(preferences.get('sidePanelWidth'), 428); assert.equal(s.preferenceWrites.length, 2);
  viewport = 1200; await s.open(); assert.equal(s.surface.querySelector('.lm-workspace-panel-pane').style.flexBasis, '428px');
  await s.stop();
  const reopened = await setup({ preferences }); await reopened.open();
  assert.equal(reopened.surface.querySelector('.lm-workspace-layout').style.getPropertyValue('--workspace-panel-width'), '428px'); await reopened.stop();
});

test('failed width preference reads/writes retain an adjustable panel and report recoverable degradation', async () => {
  const s = await setup({ configReadFailure: true, configWriteFailure: true });
  s.dom.window.HTMLElement.prototype.getBoundingClientRect = () => new s.dom.window.DOMRect(0, 0, 1200, 720);
  panel(s, 'test.files'); s.tools.workspace.register({ id: 'test.files', componentId: 'test.files', region: 'left-panel' }, s.ctx.signal); await s.open();
  const handle = s.surface.querySelector('[role=separator]');
  handle.dispatchEvent(new s.dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })); await flush();
  handle.dispatchEvent(new s.dom.window.KeyboardEvent('keyup', { key: 'ArrowRight', bubbles: true })); await flush();
  assert.equal(s.surface.querySelector('.lm-workspace-layout').style.getPropertyValue('--workspace-panel-width'), '264px');
  assert.ok(s.logs.some(log => log[0] === 'warn' && log[2] === 'Cannot restore side panel width'));
  assert.ok(s.logs.some(log => log[0] === 'warn' && log[2] === 'Cannot save side panel width'));
  await s.open(); assert.equal(s.surface.querySelector('.lm-workspace-layout').style.getPropertyValue('--workspace-panel-width'), '264px'); await s.stop();
});

test('Workspace preserves native Tab traversal while open and after closing', async () => {
  const s = await setup(); await s.open();
  for (const shiftKey of [false, true]) {
    const event = new s.dom.window.KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true });
    s.dom.window.document.body.dispatchEvent(event); assert.equal(event.defaultPrevented, false);
  }
  await s.service.close(); await flush();
  const restored = new s.dom.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
  s.dom.window.document.body.dispatchEvent(restored); assert.equal(restored.defaultPrevented, false); await s.stop();
});

test('bottom region retains its target under main without suppressing the placeholder', async () => {
 const s = await setup(); panel(s); await s.open(); const owner = s.ctx.scope.child();
 assert.equal(s.tools.workspace.register({ id: 'test.status', componentId: 'test.panel', region: 'bottom' }, owner.signal).ok, true);
 await flush(); const bottom = s.surface.querySelector('.lm-workspace-bottom');
 assert.ok(bottom.querySelector('article')); assert.equal(bottom.hidden, false);
 assert.ok(bottom.parentElement.classList.contains('lm-workspace-main-pane')); assert.equal(bottom.previousElementSibling.tagName, 'MAIN');
 assert.ok(s.surface.querySelector('.lm-workspace-empty'));
 assert.equal(s.tools.workspace.register({ id: 'test.other', componentId: 'test.panel', region: 'bottom' }, s.ctx.signal).error.code, 'REGION_OCCUPIED');
 s.tools.workspace.update('test.status', { label: 'Updated' }); assert.equal(s.surface.querySelector('.lm-workspace-bottom'), bottom);
 assert.ok(bottom.textContent.includes('Updated')); await owner.dispose(); await flush(); assert.equal(bottom.hidden, true); await s.stop();
});

test('updating a region preserves unrelated views and opening navigation only updates the layout', async () => {
  const s = await setup();
  try {
    const main = panel(s, 'test.main-view');
    const bottom = panel(s, 'test.bottom-view');
    s.tools.workspace.register({ id: 'test.main', componentId: 'test.main-view', props: { label: 'Document' } }, s.ctx.signal);
    s.tools.workspace.register({ id: 'test.bottom', componentId: 'test.bottom-view', region: 'bottom', props: { label: 'Saved' } }, s.ctx.signal);
    await s.open();
    const mainUpdates = main.seen.length;
    const bottomUpdates = bottom.seen.length;
    for (let index = 0; index < 10; index++) s.tools.workspace.update('test.bottom', { label: `Status ${index}` });
    assert.equal(main.seen.length - mainUpdates, 0, 'status changes must not update the document view');
    assert.equal(bottom.seen.length - bottomUpdates, 10);
    s.tools.navigation.open();
    s.tools.navigation.close();
    await flush();
    assert.equal(main.seen.length - mainUpdates, 0, 'overlay changes must preserve document props');
    assert.equal(bottom.seen.length - bottomUpdates, 10, 'overlay changes must preserve bottom props');
  } finally { await s.stop(); }
});
