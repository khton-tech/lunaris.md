import test from 'node:test';
import assert from 'node:assert/strict';
import { createInterfaceSettings } from '@lunaris/interface-settings';
import { setupWorkspace, flush } from '../../../../tools/test/workspace.mjs';

const base = 'lunaris.base-theme-engine.monochrome';
const ok = value => ({ ok: true, value });
const failure = { ok: false, error: { code: 'IO_ERROR', message: 'Storage failed' } };
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
async function setup(options = {}) {
  const plugin = createInterfaceSettings({ defaultThemeId: base });
  const reads = []; const writes = []; const values = options.values ?? new Map();
  const s = await setupWorkspace({ settings: true, plugins: [plugin], entrypoints: [plugin.manifest.id],
    grants: { [plugin.manifest.id]: ['ui.dom', 'vault.access', 'config.access'] },
    onActivate(tools, ctx) {
      tools.localization.register('test.languages', { en: { label: 'English' }, fr: { label: 'Français' } }, ctx.signal);
      const original = tools.themes.get(base);
      tools.fixtureThemeOwner = ctx.scope.child();
      tools.themes.register({ ...original, id: 'test.alternate', name: 'Alternate' }, tools.fixtureThemeOwner.signal);
      tools.themes.register({ id: 'test.incompatible', name: 'Incompatible', properties: {} }, ctx.signal);
    }, config: {
      async read(id, target) { reads.push({ id, target }); return options.read ? options.read(id, target) : ok(values.get(target.vaultId) ?? {}); },
      async set(id, key, value, target) {
        writes.push({ id, key, value, target });
        const result = options.write ? await options.write(id, key, value, target) : ok(null);
        if (result.ok) values.set(target.vaultId, { ...values.get(target.vaultId), [key]: value });
        return result;
      },
    } });
  assert.equal(s.session.snapshot().phase, 'running', JSON.stringify(s.session.snapshot().incidents));
  return { ...s, reads, writes, values };
}
async function show(s) {
  s.tools.sidebar.select('lunaris.settings.navigation'); await flush();
  const button = [...s.surface.querySelectorAll('.lm-settings-category')].find(node => node.textContent === 'General');
  assert.ok(button); button.click(); await flush();
}
const select = (s, index) => s.surface.querySelectorAll('.lm-settings-choices select')[index];
async function change(s, index, value) {
  const node = select(s, index); node.value = value; node.dispatchEvent(new s.dom.window.Event('change', { bubbles: true })); await flush();
}

test('composed controls apply and persist explicit Vault preferences, preserve inputs and inherit surfaces', async () => {
  const s = await setup(); await s.open(); await show(s);
  assert.deepEqual(s.reads, [{ id: 'lunaris.interface-settings', target: { scope: 'vault', vaultId: 'vault-1' } }]);
  const language = select(s, 0); const theme = select(s, 1);
  assert.deepEqual([...theme.options].map(item => item.value), [base, 'test.alternate']);
  await change(s, 0, 'fr'); assert.equal(s.tools.localization.locale(), 'fr');
  assert.equal(select(s, 0), language); assert.equal(select(s, 1), theme);
  await change(s, 1, 'test.alternate'); assert.equal(s.tools.themes.current().id, 'test.alternate');
  assert.deepEqual(s.writes.map(item => item.target), [{ scope: 'vault', vaultId: 'vault-1' }, { scope: 'vault', vaultId: 'vault-1' }]);
  assert.equal(s.surface.querySelector('.lm-settings-choices').closest('.lm-root').style.backgroundColor, 'transparent');
  s.tools.screens.select(null); await flush(); await show(s); assert.equal(select(s, 0), language);
  await s.stop();
});

test('restoration happens without opening Settings and Vault defaults never inherit previous choices', async () => {
  const s = await setup({ values: new Map([['vault-1', { locale: 'fr', theme: 'test.alternate' }], ['vault-3', { locale: 'fr', theme: 'test.alternate' }]]) });
  await s.open(); assert.equal(s.tools.localization.locale(), 'fr'); assert.equal(s.tools.themes.current().id, 'test.alternate');
  await s.open(); assert.equal(s.tools.localization.locale(), 'en'); assert.equal(s.tools.themes.current().id, base);
  await s.service.close(); await flush(); assert.equal(s.tools.localization.locale(), 'en'); assert.equal(s.tools.themes.current().id, base);
  await s.open(); assert.equal(s.tools.localization.locale(), 'fr'); assert.equal(s.tools.themes.current().id, 'test.alternate');
  assert.equal(s.writes.length, 0); await s.stop();
});

test('save failure rolls back immediate behavior and leaves the form usable for retry', async () => {
  let fail = true; const s = await setup({ write: async () => fail ? failure : ok(null) });
  await s.open(); await show(s); await change(s, 0, 'fr');
  assert.equal(s.tools.localization.locale(), 'en'); assert.equal(select(s, 0).value, 'en');
  assert.match(s.surface.querySelector('[role=alert]').textContent, /Cannot save/);
  fail = false; await change(s, 0, 'fr'); assert.equal(s.tools.localization.locale(), 'fr');
  assert.equal(s.surface.querySelector('[role=alert]'), null); await s.stop();
});

test('failed reads support retry; unavailable or malformed saved choices preserve storage', async () => {
  let fail = true; const s = await setup({ read: async () => fail ? failure : ok({ locale: 'xx', theme: 42 }) });
  await s.open(); await show(s); assert.match(s.surface.querySelector('[role=alert]').textContent, /Cannot read/);
  fail = false; [...s.surface.querySelectorAll('.lm-settings-choices button')].find(node => node.textContent === 'Retry').click(); await flush();
  assert.match(s.surface.querySelector('[role=alert]').textContent, /unavailable/);
  assert.equal(select(s, 0).value, 'en'); assert.equal(select(s, 1).value, base); assert.equal(s.writes.length, 0); await s.stop();
});

test('late reads and accepted writes cannot change a replacement Vault', async () => {
  const read = deferred(); const write = deferred(); let pendingRead = true;
  const s = await setup({ read: (_, target) => target.vaultId === 'vault-1' && pendingRead ? read.promise : Promise.resolve(ok({})), write: () => write.promise });
  await s.open(); await s.open();
  read.resolve(ok({ locale: 'fr', theme: 'test.alternate' })); await flush();
  assert.equal(s.tools.localization.locale(), 'en'); assert.equal(s.tools.themes.current().id, base);
  pendingRead = false; await show(s); await change(s, 0, 'fr'); assert.equal(s.tools.localization.locale(), 'fr');
  assert.equal(select(s, 0).disabled, true);
  await s.open(); write.resolve(failure); await flush();
  assert.equal(s.tools.localization.locale(), 'en'); assert.equal(s.tools.themes.current().id, base);
  assert.equal(s.writes[0].target.vaultId, 'vault-2'); await s.stop();
});

test('callbacks from released sections are inert; replacing a theme updates choices', async () => {
  const s = await setup(); await s.open(); await show(s);
  const target = s.dom.window.document.createElement('div'); const owner = s.ctx.scope.child();
  const section = s.tools.settings.snapshot().sections[0];
  // A separate host-role mount uses the real Mantine renderer, then its released native node is inert.
  const mounted = s.tools.components.mount(section.componentId, target, { ...section.props, workspace: { vaultId: 'vault-1', vaultName: 'Notes' } }, owner.signal);
  assert.equal(mounted.ok, true); const node = target.querySelector('select');
  await owner.dispose(); node.value = 'fr'; node.dispatchEvent(new s.dom.window.Event('change', { bubbles: true })); await flush();
  assert.equal(s.writes.length, 0);
  const original = s.tools.themes.get('test.alternate'); s.tools.themes.update({ ...original, name: 'Renamed' }); await flush();
  assert.ok([...select(s, 1).options].some(option => option.textContent === 'Renamed'));
  await s.stop();
});

test('saved preferences survive controller restart and unavailable themes recover without rewriting values', async () => {
  const values = new Map(); let s = await setup({ values }); await s.open(); await show(s);
  await change(s, 0, 'fr'); await change(s, 1, 'test.alternate'); await s.stop();
  s = await setup({ values }); await s.open(); assert.equal(s.tools.localization.locale(), 'fr');
  assert.equal(s.tools.themes.current().id, 'test.alternate'); await show(s);
  await s.tools.fixtureThemeOwner.dispose(); await flush();
  assert.equal(s.tools.themes.current().id, base); assert.match(s.surface.querySelector('[role=alert]').textContent, /unavailable/);
  assert.equal(values.get('vault-1').theme, 'test.alternate'); assert.equal(s.writes.length, 0);
  s.tools.themes.register({ ...s.tools.themes.get(base), id: 'test.alternate', name: 'Returned' }, s.ctx.signal); await flush();
  assert.equal(s.tools.themes.current().id, 'test.alternate'); assert.equal(s.surface.querySelector('[role=alert]'), null); await s.stop();
});

test('closing a section preserves an accepted write and prevents further edits from its old view', async () => {
  const pending = deferred(); const s = await setup({ write: () => pending.promise });
  await s.open(); await show(s); const old = select(s, 0); await change(s, 0, 'fr');
  s.tools.settings.registerCategory({ id: 'test.empty', title: 'Other' }, s.ctx.signal); await flush();
  [...s.surface.querySelectorAll('.lm-settings-category')].find(node => node.textContent === 'Other').click(); await flush();
  assert.equal(old.isConnected, false); pending.resolve(ok(null)); await flush();
  assert.equal(s.values.get('vault-1').locale, 'fr'); assert.equal(s.tools.localization.locale(), 'fr');
  old.value = 'en'; old.dispatchEvent(new s.dom.window.Event('change', { bubbles: true })); await flush();
  assert.equal(s.writes.length, 1); await show(s); assert.equal(select(s, 0).value, 'fr'); await s.stop();
});
