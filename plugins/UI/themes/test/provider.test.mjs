import test from 'node:test';
import assert from 'node:assert/strict';
import { definePlugin } from '@lunaris/sdk';
import { createTestKernel } from '@lunaris/test';
import { Logger } from '@lunaris/logging';
import { Themes, ThemeChanged } from '@lunaris/themes';
import provider from '@lunaris/theme-provider';

const manifest = (id, tokens = []) => ({ manifestVersion: 1, id, version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './index.js', provides: [],
  requires: tokens.map(token => ({ kind: token.kind, id: token.id, range: '^1.0.0' })), permissions: [], optionalPermissions: [] });
const flush = () => new Promise(resolve => setImmediate(resolve));
const description = (id = 'test.engine.theme') => ({ id, name: 'Engine-supplied fixture', properties: {
  geometry: { padding: { value: 0.5, unit: 'rem' } }, colors: { text: '#fff' }, typography: { families: ['system-ui', 'sans-serif'] },
  extension: { enabled: true, optional: null },
} });
async function setup() {
  const host = createTestKernel(); const logs = []; const changes = []; let themes; let ctx;
  host.installMock(Logger, Object.fromEntries(['log', 'debug', 'info', 'warn', 'error'].map(name => [name, (...args) => { logs.push([name, ...args]); return true; }])));
  host.register(provider);
  host.register(definePlugin({ manifest: manifest('test.observer', [Themes, ThemeChanged]), activate(context) {
    ctx = context; themes = ctx.use(Themes); ctx.events.on(ThemeChanged, change => changes.push(change));
  } }));
  await host.start('test.observer');
  return { host, logs, changes, get themes() { return themes; }, get ctx() { return ctx; }, async stop() {
    await host.stopAll(); await flush(); host.assertNoResources(); assert.deepEqual(host.diagnostics(), []);
  } };
}

test('startup has no built-in theme; arbitrary engine data is copied and deeply immutable', async () => {
  const s = await setup(); assert.equal(s.themes.current(), null); assert.deepEqual(s.themes.list(), []);
  const theme = description(); const expected = structuredClone(theme);
  assert.equal(s.themes.register(theme, s.ctx.signal).ok, true);
  theme.properties.colors.text = 'mutated'; theme.properties.typography.families.push('mutated');
  assert.equal(s.themes.current(), null); assert.deepEqual(s.themes.get(theme.id), expected);
  const stored = s.themes.get(theme.id);
  assert.ok(Object.isFrozen(stored)); assert.ok(Object.isFrozen(stored.properties.colors)); assert.ok(Object.isFrozen(stored.properties.typography.families));
  assert.throws(() => { stored.properties.colors.text = 'mutated'; }, TypeError);
  assert.equal(s.themes.register(description('test.another.theme'), s.ctx.signal).ok, true);
  assert.deepEqual(s.themes.list().map(theme => theme.id), ['test.another.theme', 'test.engine.theme']);
  assert.ok(Object.isFrozen(s.themes.list()));
  assert.ok(s.logs.some(([level, source, , details]) => level === 'info' && source === provider.manifest.id && details.code === 'THEMES_READY'));
  assert.ok(!JSON.stringify(s.logs).includes('#fff'));
  await s.stop();
});

test('selection, active description replacement and explicit clearing publish committed changes', async () => {
  const s = await setup(); const theme = description(); s.themes.register(theme, s.ctx.signal);
  assert.equal(s.themes.select(theme.id).ok, true); assert.equal(s.themes.current().id, theme.id);
  s.themes.select(theme.id);
  const previous = s.themes.current(); const updated = { ...theme, properties: { geometry: { density: 'compact' }, newDomain: [1, false, null] } };
  assert.equal(s.themes.update(updated).ok, true);
  updated.properties.newDomain.push(2);
  assert.equal(s.themes.current().properties.colors, undefined); assert.equal(previous.properties.colors.text, '#fff');
  assert.deepEqual(s.themes.current().properties.newDomain, [1, false, null]);
  s.themes.select(null); s.themes.select(null); assert.equal(s.themes.current(), null);
  await flush();
  assert.deepEqual(s.changes.map(change => change.kind), ['registered', 'selected', 'updated', 'selected']);
  assert.deepEqual(s.changes.at(-1), { kind: 'selected', themeId: null, previous: theme.id, current: null });
  assert.ok(s.changes.every(Object.isFrozen)); await s.stop();
});

test('invalid descriptions are rejected without executing accessors or changing the live theme', async () => {
  const s = await setup(); const theme = description(); s.themes.register(theme, s.ctx.signal); s.themes.select(theme.id);
  const cyclic = {}; cyclic.self = cyclic;
  let deep = {}; for (let i = 0; i < 34; i++) deep = { next: deep };
  const invalid = [null, {}, { ...theme, id: 'bad/name' }, { ...theme, name: ' ' }, { ...theme, properties: [] }, { ...theme, extra: true },
    { ...theme, get name() { throw Error('Getter'); } }, ...[undefined, NaN, Infinity, 1n, () => {}, new Date(), cyclic, deep,
      { get value() { throw Error('Getter'); } }, new Array(2), JSON.parse('{"__proto__":1}'), { [Symbol('key')]: 1 },
      Array(10001).fill(0)].map(value => ({ ...theme, properties: { invalid: value } }))];
  for (const input of invalid) assert.equal(s.themes.update(input).error.code, 'INVALID_ARGUMENT');
  assert.equal(s.themes.current().properties.colors.text, '#fff');
  await flush(); assert.deepEqual(s.changes.map(change => change.kind), ['registered', 'selected']); await s.stop();
});

test('duplicates, absent IDs and invalid owners preserve the registry and selection', async () => {
  const s = await setup(); const theme = description(); s.themes.register(theme, s.ctx.signal); s.themes.select(theme.id);
  assert.equal(s.themes.register(theme, s.ctx.signal).error.code, 'ALREADY_REGISTERED');
  assert.equal(s.themes.select('test.absent').error.code, 'NOT_FOUND');
  assert.equal(s.themes.select(undefined).error.code, 'INVALID_ARGUMENT');
  assert.equal(s.themes.update(description('test.absent')).error.code, 'NOT_FOUND');
  assert.equal(s.themes.register(description('test.other'), null).error.code, 'INVALID_ARGUMENT');
  const owner = s.ctx.scope.child(); await owner.dispose();
  assert.equal(s.themes.register(description('test.other'), owner.signal).error.code, 'INVALID_ARGUMENT');
  assert.equal(s.themes.current().id, theme.id); assert.equal(s.themes.list().length, 1); await s.stop();
});

test('engine owner release invalidates the active theme and notifies still-live consumers', async () => {
  const s = await setup(); const owner = s.ctx.scope.child(); const theme = description();
  s.themes.register(theme, owner.signal); s.themes.select(theme.id); await flush();
  await owner.dispose(); assert.equal(s.themes.current(), null); assert.equal(s.themes.get(theme.id), undefined);
  await flush(); assert.deepEqual(s.changes.at(-1), { kind: 'removed', themeId: theme.id, previous: theme.id, current: null });
  assert.equal(s.themes.register(theme, s.ctx.signal).ok, true); assert.equal(s.themes.current(), null); await s.stop();
});

test('updating a description retains its original owner; removing an inactive theme preserves selection', async () => {
  const s = await setup(); const owner = s.ctx.scope.child(); const theme = description();
  s.themes.register(theme, owner.signal); s.themes.register(description('test.other'), s.ctx.signal); s.themes.select('test.other');
  s.themes.update({ ...theme, name: 'Updated' }); await owner.dispose();
  assert.equal(s.themes.get(theme.id), undefined); assert.equal(s.themes.current().id, 'test.other'); await s.stop();
});

test('real engine restart releases its themes and closed engine handles cannot be reused', async () => {
  const s = await setup(); let retained; let generation = 0;
  s.host.register(definePlugin({ manifest: manifest('test.engine', [Themes]), activate(ctx) {
    retained = ctx.use(Themes); retained.register({ ...description(), name: `Generation ${++generation}` }, ctx.signal);
  } }));
  await s.host.start('test.engine'); s.themes.select('test.engine.theme');
  await s.host.stop('test.engine'); await flush();
  assert.equal(s.themes.current(), null); assert.equal(s.themes.get('test.engine.theme'), undefined);
  assert.throws(() => retained.current()); await s.host.start('test.engine');
  assert.equal(s.themes.get('test.engine.theme').name, 'Generation 2'); await s.stop();
});

test('provider shutdown releases external owner listeners and never publishes after scope closure', async () => {
  const s = await setup(); const owner = new AbortController(); const original = owner.signal.removeEventListener.bind(owner.signal); let detached = 0;
  owner.signal.removeEventListener = (...args) => { detached++; return original(...args); };
  s.themes.register(description(), owner.signal); s.themes.select('test.engine.theme'); await flush();
  const retained = s.themes;
  await s.stop(); const logCount = s.logs.length; const changeCount = s.changes.length;
  assert.equal(detached, 1); owner.abort(); await flush();
  assert.equal(s.logs.length, logCount); assert.equal(s.changes.length, changeCount); assert.throws(() => retained.current());
  await s.host.start('test.observer');
  assert.equal(s.themes.current(), null); assert.deepEqual(s.themes.list(), []);
  await s.stop();
});

test('pending notifications cannot log through stopped dependencies or survive provider shutdown', async () => {
  const s = await setup(); let release; let entered;
  const waiting = new Promise(resolve => { entered = resolve; });
  const blocked = new Promise(resolve => { release = resolve; });
  s.host.register(definePlugin({ manifest: manifest('test.delayed-consumer', [ThemeChanged]), activate(ctx) {
    ctx.events.on(ThemeChanged, async () => { entered(); await blocked; });
  } }));
  await s.host.start('test.delayed-consumer');
  s.themes.register(description(), s.ctx.signal); await waiting;
  await s.host.stopAll(); const logCount = s.logs.length; release(); await flush();
  assert.equal(s.logs.length, logCount); s.host.assertNoResources(); assert.deepEqual(s.host.diagnostics(), []);
});

test('failed engine activation rolls back ownership and leaves the provider usable', async () => {
  const s = await setup();
  s.host.register(definePlugin({ manifest: manifest('test.failed-engine', [Themes]), activate(ctx) {
    ctx.use(Themes).register(description(), ctx.signal); throw Error('Test activation failure');
  } }));
  await assert.rejects(s.host.start('test.failed-engine')); await flush();
  assert.equal(s.themes.get('test.engine.theme'), undefined);
  assert.equal(s.themes.register(description(), s.ctx.signal).ok, true);
  await s.host.stopAll(); s.host.assertNoResources();
  assert.ok(!s.host.diagnostics().some(item => ['CLEANUP_FAILED', 'API_CALL_FAILED'].includes(item.code)));
});
