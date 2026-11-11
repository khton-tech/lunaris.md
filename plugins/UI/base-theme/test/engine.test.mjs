import test from 'node:test';
import assert from 'node:assert/strict';
import { definePlugin } from '@lunaris/sdk';
import { createTestKernel } from '@lunaris/test';
import { Logger } from '@lunaris/logging';
import { Themes } from '@lunaris/themes';
import provider from '@lunaris/theme-provider';
import engine from '@lunaris/base-theme-engine';

const presetId = 'lunaris.base-theme-engine.monochrome';
async function setup() {
  const host = createTestKernel(); const logs = []; let themes; let ctx;
  host.installMock(Logger, Object.fromEntries(['log', 'debug', 'info', 'warn', 'error'].map(level => [level, (...args) => { logs.push([level, ...args]); return true; }])));
  host.register(provider); host.register(engine);
  host.register(definePlugin({ manifest: { manifestVersion: 1, id: 'test.observer', version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './index.js', provides: [],
    requires: [{ kind: 'api', id: Themes.id, range: '^1.0.0' }], permissions: [], optionalPermissions: [] }, activate(context) { ctx = context; themes = ctx.use(Themes); } }));
  await host.start('test.observer');
  return { host, logs, get themes() { return themes; }, get ctx() { return ctx; }, async stop() {
    await host.stopAll(); host.assertNoResources(); assert.deepEqual(host.diagnostics(), []);
  } };
}

test('engine supplies the immutable Monochrome preset without selecting it', async () => {
  const s = await setup(); assert.deepEqual(s.themes.list(), []);
  await s.host.start(engine.manifest.id);
  const theme = s.themes.get(presetId);
  assert.equal(theme.name, 'Monochrome'); assert.equal(s.themes.list().length, 13);
  assert.equal(theme.properties.appearance, 'dark');
  assert.equal(theme.properties.schema, 'lunaris.base-theme'); assert.equal(theme.properties.schemaVersion, 1);
  assert.ok(Object.isFrozen(theme.properties.colors)); assert.ok(Object.isFrozen(theme.properties.typography.fontFamily));
  assert.equal(theme.properties.colors.sub, '#4C4C4C');
  assert.equal(theme.properties.colors.caret, '#F5F5F5');
  assert.equal(theme.properties.colors.error, '#AC8C8C');
  assert.equal(theme.properties.colors.extraError, '#C49EA0');
  assert.equal(theme.properties.colors.colorfulError, '#ACA98A');
  assert.equal(theme.properties.colors.colorfulExtraError, '#C4C19E');
  assert.equal(s.themes.current(), null);
  assert.ok(s.logs.some(([level, source, , details]) => level === 'info' && source === engine.manifest.id && details.code === 'BASE_THEMES_READY'));
  await s.stop();
});

function luminance(hex) {
  assert.match(hex, /^#[0-9A-F]{6}$/);
  const [r, g, b] = hex.slice(1).match(/../g).map(value => parseInt(value, 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
}
test('XP preset uses the compatible light schema and can be selected independently', async () => {
  const s = await setup(); await s.host.start(engine.manifest.id);
  const xp = s.themes.get('lunaris.base-theme-engine.windows-xp');
  assert.equal(xp.properties.schema, 'lunaris.base-theme');
  assert.equal(xp.properties.schemaVersion, 1);
  assert.equal(xp.properties.appearance, 'light');
  assert.equal(xp.properties.typography.fontFamily[0], 'Tahoma');
  assert.equal(s.themes.select(xp.id).ok, true);
  assert.equal(s.themes.current(), xp);
  await s.host.stop(engine.manifest.id);
  assert.equal(s.themes.current(), null);
  assert.deepEqual(s.themes.list(), []);
  await s.stop();
});

test('Luna Dark retains XP chrome and typography with independent dark surfaces', async () => {
  const s = await setup(); await s.host.start(engine.manifest.id);
  const light = s.themes.get('lunaris.base-theme-engine.windows-xp');
  const dark = s.themes.get('lunaris.base-theme-engine.windows-xp-dark');
  assert.equal(dark.name, 'Windows XP Luna Dark');
  assert.equal(dark.properties.appearance, 'dark');
  assert.deepEqual(dark.properties.typography, light.properties.typography);
  assert.deepEqual(dark.properties.geometry, light.properties.geometry);
  assert.equal(dark.properties.components.windowChrome.enabled, true);
  assert.notEqual(dark.properties.colors.panel, light.properties.colors.panel);
  assert.notEqual(dark.properties.components.controls.buttonBackground, light.properties.components.controls.buttonBackground);
  assert.equal(s.themes.select(dark.id).ok, true);
  assert.equal(s.themes.current(), dark);
  await s.stop();
});
test('community presets use the shared schema and include a dark Sakura palette', async () => {
  const s = await setup(); await s.host.start(engine.manifest.id);
  const expected = ['Catppuccin Mocha', 'Dracula', 'Nord', 'Tokyo Night', 'Rosé Pine', 'Gruvbox Dark', 'Everforest Dark', 'Sakura Night'];
  const additions = s.themes.list().filter(theme => expected.includes(theme.name));
  assert.deepEqual(additions.map(theme => theme.name).sort(), [...expected].sort());
  for (const theme of additions) {
    assert.equal(theme.properties.schema, 'lunaris.base-theme');
    assert.equal(theme.properties.schemaVersion, 1);
    assert.equal(theme.properties.appearance, 'dark');
  }
  const sakura = additions.find(theme => theme.name === 'Sakura Night');
  assert.equal(sakura.properties.colors.accent, '#E89AB8');
  assert.equal(sakura.properties.colors.background, '#211A22');
  await s.stop();
});
const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);
test('Lunaris and community separators are subdued against workspace surfaces', async () => {
  const s = await setup(); await s.host.start(engine.manifest.id);
  for (const theme of s.themes.list()) {
    if (theme.id === presetId || theme.properties.components.windowChrome?.enabled) continue;
    const colors = theme.properties.colors;
    for (const surface of ['background', 'panel', 'content']) {
      assert.ok(contrast(colors.separator, colors[surface]) < 2, `${theme.name}: separator/${surface}`);
    }
  }
  await s.stop();
});

test('text and meaningful controls meet contrast thresholds across their intended states', async () => {
  const s = await setup(); await s.host.start(engine.manifest.id);
  for (const theme of s.themes.list()) {
    const colors = theme.properties.colors;
    for (const surface of ['background', 'panel', 'content', 'hover', 'selection']) {
      for (const text of ['text', 'textSecondary']) assert.ok(contrast(colors[text], colors[surface]) >= 4.5, `${theme.name}: ${text}/${surface}`);
      for (const role of ['controlBorder', 'focus']) assert.ok(contrast(colors[role], colors[surface]) >= 3, `${theme.name}: ${role}/${surface}`);
    }
    for (const surface of ['accent', 'accentHover']) assert.ok(contrast(colors.onAccent, colors[surface]) >= 4.5, `${theme.name}: onAccent/${surface}`);
    for (const surface of ['background', 'content']) assert.ok(contrast(colors.link ?? colors.accent, colors[surface]) >= 4.5, `${theme.name}: link/${surface}`);
  }
  await s.stop();
});

test('registration and restart preserve an existing selection and remove only engine-owned descriptions', async () => {
  const s = await setup(); const foreign = { id: 'test.other.theme', name: 'Other engine', properties: {} };
  s.themes.register(foreign, s.ctx.signal); s.themes.select(foreign.id);
  await s.host.start(engine.manifest.id); assert.equal(s.themes.current().id, foreign.id);
  s.themes.select(presetId); await s.host.stop(engine.manifest.id);
  assert.equal(s.themes.current(), null); assert.deepEqual(s.themes.list().map(theme => theme.id), [foreign.id]);
  await s.host.start(engine.manifest.id); assert.equal(s.themes.list().length, 14); assert.equal(s.themes.current(), null);
  s.themes.select(presetId); assert.equal(s.themes.current().name, 'Monochrome');
  await s.stop();
});

test('a registration collision preserves another owner; retry succeeds', async () => {
  const s = await setup(); const owner = s.ctx.scope.child();
  s.themes.register({ id: presetId, name: 'Existing owner', properties: {} }, owner.signal); s.themes.select(presetId);
  await assert.rejects(s.host.start(engine.manifest.id));
  assert.equal(s.themes.get(presetId).name, 'Existing owner'); assert.equal(s.themes.current().id, presetId);
  assert.ok(s.logs.some(([level, source, , details]) => level === 'error' && source === engine.manifest.id && details.error.cause.code === 'ALREADY_REGISTERED'));
  await owner.dispose(); await s.host.start(engine.manifest.id); assert.equal(s.themes.list().length, 13);
  await s.host.stopAll(); s.host.assertNoResources();
  assert.ok(!s.host.diagnostics().some(item => ['CLEANUP_FAILED', 'API_CALL_FAILED'].includes(item.code)));
});

test('provider shutdown stops its dependent engine; a new provider generation gets fresh registrations', async () => {
  const s = await setup(); await s.host.start(engine.manifest.id); const stale = s.themes;
  await s.host.stop(provider.manifest.id); s.host.assertState(engine.manifest.id, 'stopped');
  assert.throws(() => stale.list());
  await s.host.start(engine.manifest.id); await s.host.start('test.observer');
  assert.equal(s.themes.list().length, 13); assert.equal(s.themes.current(), null); await s.stop();
});
