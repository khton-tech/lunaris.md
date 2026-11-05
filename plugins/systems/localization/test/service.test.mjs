import test from 'node:test';
import assert from 'node:assert/strict';
import { definePlugin } from '@lunaris/sdk';
import { createTestKernel } from '@lunaris/test';
import { Logger } from '@lunaris/logging';
import { Localization, LocaleChanged } from '@lunaris/localization';
import localization from '@lunaris/localization-manager';

const manifest = (id, tokens = []) => ({ manifestVersion: 1, id, version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './index.js', provides: [], requires: tokens.map(token => ({ kind: token.kind, id: token.id, range: '^1.0.0' })), permissions: [], optionalPermissions: [] });
const flush = () => new Promise(resolve => setImmediate(resolve));
async function setup() {
  const host = createTestKernel(); const logs = []; const changes = [];
  host.installMock(Logger, Object.fromEntries(['log', 'debug', 'info', 'warn', 'error'].map(level => [level, (...args) => { logs.push([level, ...args]); return true; }])));
  host.register(localization);
  let language; let context;
  host.register(definePlugin({ manifest: manifest('test.observer', [Localization, LocaleChanged]), activate(ctx) {
    context = ctx; language = ctx.use(Localization);
    ctx.events.on(LocaleChanged, change => changes.push(change));
  } }));
  await host.start('test.observer');
  return { host, language, context, logs, changes, async stop() { await host.stopAll(); host.assertNoResources(); assert.deepEqual(host.diagnostics(), []); } };
}

test('English-only startup; isolated namespaces, copied catalogs and literal parameter substitution', async () => {
  const s = await setup(); const { language, context } = s;
  assert.equal(language.locale(), 'en'); assert.deepEqual(language.locales(), ['en']);
  const catalog = { en: { open: 'Open {name}: {count}', empty: '', literal: '${name}' } };
  assert.equal(language.register('test.first', catalog, context.signal).ok, true);
  assert.equal(language.register('test.second', { en: { open: 'Other' } }, context.signal).ok, true);
  catalog.en.open = 'Mutated'; catalog.en.extra = 'Late';
  assert.equal(language.text('test.first', 'open', { name: '<b>$&{count}</b>', count: 0 }), 'Open <b>$&{count}</b>: 0');
  assert.equal(language.text('test.first', 'empty'), '');
  assert.equal(language.text('test.second', 'open'), 'Other');
  assert.equal(language.text('test.first', 'extra'), '[test.first:extra]');
  assert.equal(language.setLocale('fr').error.code, 'UNSUPPORTED_LOCALE');
  assert.equal(language.locale(), 'en');
  assert.ok(s.logs.some(([level, source, , detail]) => level === 'info' && source === localization.manifest.id && detail.code === 'LOCALIZATION_READY'));
  await s.stop();
});

test('missing keys and parameters have visible fallback and warn once without logging parameter values', async () => {
  const s = await setup(); const { language, context } = s;
  language.register('test.texts', { en: { greeting: 'Hello {name}, {count}' } }, context.signal);
  for (let i = 0; i < 5; i++) {
    assert.equal(language.text('test.texts', 'absent'), '[test.texts:absent]');
    assert.equal(language.text('test.texts', 'greeting', { name: 'private-value' }), 'Hello private-value, {count}');
  }
  const warnings = s.logs.filter(([level]) => level === 'warn');
  assert.equal(warnings.length, 2); assert.ok(!JSON.stringify(warnings).includes('private-value'));
  assert.equal(language.text('test.texts', 'greeting', { get name() { throw new Error('Getter'); }, count: Infinity }), 'Hello {name}, {count}');
  assert.equal(language.text('test.texts', '__proto__'), '[invalid-message]');
  await s.stop();
});

test('future locale catalogs use English fallback and emit changes only after a real switch', async () => {
  const s = await setup(); const { language, context } = s;
  language.register('test.texts', { en: { open: 'Open', close: 'Close' }, fr: { open: 'Ouvrir' } }, context.signal);
  assert.deepEqual(language.locales(), ['en', 'fr']);
  assert.equal(language.setLocale('FR').ok, true); assert.equal(language.locale(), 'fr');
  assert.equal(language.text('test.texts', 'open'), 'Ouvrir');
  assert.equal(language.text('test.texts', 'close'), 'Close');
  assert.equal(language.setLocale('fr').ok, true);
  await flush(); assert.deepEqual(s.changes, [{ previous: 'en', current: 'fr' }]);
  assert.equal(language.setLocale('bad_locale').error.code, 'UNSUPPORTED_LOCALE');
  assert.equal(language.locale(), 'fr');
  await s.stop();
});

test('malformed catalogs are rejected atomically and duplicate registrations preserve existing texts', async () => {
  const s = await setup(); const { language, context } = s;
  const invalid = [null, [], {}, { en: {} }, { en: { key: 2 } }, { fr: { key: 'French' } },
    { en: { key: 'English' }, fr: { other: 'Unknown key' } }, { en: { key: 'English' }, EN: { key: 'Duplicate' } },
    { en: { get key() { throw new Error('Getter'); } } }, { en: JSON.parse('{"__proto__":"bad"}') },
    { en: { key: 'English' }, bad_locale: { key: 'Invalid' } }];
  for (const catalogs of invalid) assert.equal(language.register('test.invalid', catalogs, context.signal).error.code, 'INVALID_ARGUMENT');
  assert.equal(language.register('bad/id', { en: { key: 'Valid' } }, context.signal).error.code, 'INVALID_ARGUMENT');
  assert.equal(language.register('test.texts', { en: { key: 'Valid' } }, context.signal).ok, true);
  assert.equal(language.register('test.texts', { en: { key: 'Replaced' } }, context.signal).error.code, 'ALREADY_REGISTERED');
  assert.equal(language.text('test.texts', 'key'), 'Valid');
  await s.stop();
});

test('owner cancellation releases namespaces and supports restart without changing the selected locale', async () => {
  const s = await setup(); const { language, context } = s;
  const scope = context.scope.child();
  language.register('test.texts', { en: { key: 'English' }, fr: { key: 'French' } }, scope.signal);
  language.setLocale('fr'); await scope.dispose();
  assert.equal(language.locale(), 'fr'); assert.deepEqual(language.locales(), ['en']);
  assert.equal(language.text('test.texts', 'key'), '[test.texts:key]');
  assert.equal(language.register('test.texts', { en: { key: 'Late' } }, scope.signal).error.code, 'INVALID_ARGUMENT');
  assert.equal(language.register('test.texts', { en: { key: 'Restarted' } }, context.signal).ok, true);
  assert.equal(language.text('test.texts', 'key'), 'Restarted');
  await flush(); assert.deepEqual(s.changes, [{ previous: 'en', current: 'fr' }]);
  await s.stop();
});

test('stopping and restarting a real SDK consumer releases its catalog; closed handles cannot be used', async () => {
  const s = await setup(); let generation = 0; let retained;
  s.host.register(definePlugin({ manifest: manifest('test.product', [Localization]), activate(ctx) {
    retained = ctx.use(Localization);
    assert.equal(retained.register(ctx.pluginId, { en: { title: `Title ${++generation}` } }, ctx.signal).ok, true);
  } }));
  await s.host.start('test.product'); assert.equal(s.language.text('test.product', 'title'), 'Title 1');
  await s.host.stop('test.product');
  assert.throws(() => retained.text('test.product', 'title'));
  assert.equal(s.language.text('test.product', 'title'), '[test.product:title]');
  await s.host.start('test.product'); assert.equal(s.language.text('test.product', 'title'), 'Title 2');
  const old = s.language;
  await s.stop(); assert.throws(() => old.locale());
});
