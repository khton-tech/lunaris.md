import test from 'node:test';
import assert from 'node:assert/strict';
import { setupWorkspace as setup, panel, flush } from '../../../../tools/test/workspace.mjs';

test('selector hands off to an empty workspace and closing returns to the selector', async () => {
  const s = await setup(); assert.ok(s.surface.querySelector('.ln-vault')); assert.equal(s.surface.querySelector('.lm-workspace-empty'), null);
  s.surface.querySelector('.ln-vault-recents button').click(); await flush();
  assert.equal(s.surface.querySelector('.ln-vault'), null); assert.equal(s.surface.querySelector('[data-lunaris-slot="lunaris.vault-selector.screen"]'), null);
  assert.equal(s.surface.querySelector('h1').textContent, 'Notes');
  assert.equal(s.surface.querySelector('.lm-workspace-empty h2').textContent, 'No workspace plugins');
  assert.equal(s.surface.querySelectorAll('.lm-workspace-empty').length, 1);
  s.surface.querySelector('.lm-workspace-header button').click(); await flush();
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
  const root = s.surface.querySelector('[data-lunaris-slot="lunaris.workspace.screen"]'); assert.ok(root.firstElementChild.querySelector('header'));
  assert.equal(api.register({ id: 'test.first', componentId: 'test.panel' }, s.ctx.signal).error.code, 'ALREADY_REGISTERED');
  assert.equal(api.update('test.missing', {}).error.code, 'NOT_FOUND'); assert.equal(api.update('test.first', { workspace: {} }).error.code, 'INVALID_ARGUMENT');
  api.update('test.first', { label: 'Updated' }); assert.equal(s.surface.querySelector('article').textContent, 'Updated: Notes'); await s.stop();
});

test('existing Vault appears after startup; localized messages and theme changes preserve content', async () => {
  const s = await setup({ current: { id: 'existing', name: '<img src=x> Notes' }, beforeLoaded(surface) {
    assert.equal(surface.querySelector('.lm-workspace-header'), null); assert.equal(surface.querySelector('.lm-workspace-empty'), null);
  } });
  assert.equal(s.surface.querySelector('.ln-vault'), null); assert.ok(s.surface.querySelector('.lm-workspace-empty')); assert.equal(s.surface.querySelector('img'), null);
  assert.equal(s.surface.querySelector('h1').textContent, '<img src=x> Notes');
  s.tools.themes.register({ id: 'test.light', name: 'Light', properties: { appearance: 'light', colors: { background: '#ffffff', text: '#202020' } } }, s.ctx.signal);
  s.tools.themes.select('test.light'); assert.equal(s.surface.querySelector('.lm-workspace-empty').style.backgroundColor, 'rgb(255, 255, 255)');
  s.tools.localization.register('test.languages', { en: { title: 'Language' }, fr: { title: 'Langue' } }, s.ctx.signal); s.tools.localization.setLocale('fr'); await flush();
  assert.ok(s.surface.querySelector('.lm-workspace-empty')); assert.equal(s.surface.querySelector('button').textContent, 'Close vault');
  assert.equal(s.dom.window.localStorage.length, 0); await s.stop();
});

test('close is single-flight, failures retain the workspace and allow retry', async () => {
  const deferred = Promise.withResolvers(); const options = { beforeClose: () => deferred.promise, closeFailure: 'BUSY' };
  const s = await setup(options); await s.open(); const button = s.surface.querySelector('.lm-workspace-header button'); button.click(); button.click();
  assert.equal(options.closeCalls, 1); assert.equal(button.disabled, true); deferred.resolve(); await flush();
  assert.match(s.surface.querySelector('[role=alert]').textContent, /Could not close/); assert.equal(button.disabled, false);
  options.closeFailure = null; button.click(); await flush(); assert.ok(s.surface.querySelector('.ln-vault')); await s.stop();
});

test('shutdown during close ignores late results and releases owned screens', async () => {
  const deferred = Promise.withResolvers(); const s = await setup({ beforeClose: () => deferred.promise }); await s.open();
  s.surface.querySelector('.lm-workspace-header button').click(); await s.session.stop(); deferred.resolve(); await flush();
  assert.equal(s.surface.childElementCount, 0); s.dom.window.close();
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
  failUpdate = true; s.tools.workspace.update('test.main', { label: 'Failed' }); await flush(); assert.equal(s.surface.querySelector('article'), null);
  failUpdate = false; s.tools.workspace.update('test.main', { label: 'Recovered' }); await flush(); assert.match(s.surface.querySelector('article').textContent, /Recovered/); await s.stop();
});
