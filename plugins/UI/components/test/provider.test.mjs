import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { definePlugin } from '@lunaris/sdk';
import { createTestKernel } from '@lunaris/test';
import { Logger } from '@lunaris/logging';
import { Components, ComponentsChanged } from '@lunaris/components';
import provider from '@lunaris/component-provider';

const manifest = (id, tokens = [], permissions = ['ui.dom']) => ({ manifestVersion: 1, id, version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './index.js', provides: [],
  requires: tokens.map(token => ({ kind: token.kind, id: token.id, range: '^1.0.0' })), permissions, optionalPermissions: [] });
const flush = () => new Promise(resolve => setImmediate(resolve));

/** Minimal fixture component: renders a labelled element and records its lifecycle. */
function label(id = 'test.label', events = []) {
  return { id, mount(target, props, signal) {
    const node = target.ownerDocument.createElement('span');
    node.textContent = String(props.text ?? ''); target.append(node); events.push(['mount', props.text]);
    signal.addEventListener('abort', () => events.push(['abort']), { once: true });
    return { update(next) { node.textContent = String(next.text ?? ''); events.push(['update', next.text]); }, dispose() { node.remove(); events.push(['dispose']); } };
  } };
}

async function setup() {
  const dom = new JSDOM('<div id="target"></div>'); const target = dom.window.document.getElementById('target');
  const host = createTestKernel(); const logs = []; const changes = []; let components; let ctx;
  host.installMock(Logger, Object.fromEntries(['log', 'debug', 'info', 'warn', 'error'].map(name => [name, (...args) => { logs.push([name, ...args]); return true; }])));
  host.register(provider); host.grant(provider.manifest.id, 'ui.dom');
  host.register(definePlugin({ manifest: manifest('test.consumer', [Components, ComponentsChanged]), activate(context) {
    ctx = context; components = ctx.use(Components); ctx.events.on(ComponentsChanged, change => changes.push(change));
  } }));
  host.grant('test.consumer', 'ui.dom');
  await host.start('test.consumer');
  return { host, dom, target, logs, changes, get components() { return components; }, get ctx() { return ctx; }, async stop() {
    await host.stopAll(); await flush(); host.assertNoResources(); assert.deepEqual(host.diagnostics(), []); dom.window.close();
  } };
}

test('startup is empty; registered components render, update and release through the provider', async () => {
  const s = await setup(); const events = [];
  assert.deepEqual(s.components.list(), []);
  assert.equal(s.components.register(label('test.label', events), s.ctx.signal).ok, true);
  assert.equal(s.components.has('test.label'), true); assert.deepEqual(s.components.list(), ['test.label']); assert.ok(Object.isFrozen(s.components.list()));
  const props = { text: 'One' };
  const mounted = s.components.mount('test.label', s.target, props, s.ctx.signal);
  assert.equal(mounted.ok, true); assert.equal(mounted.value.componentId, 'test.label'); assert.ok(Object.isFrozen(mounted.value));
  props.text = 'mutated'; assert.equal(s.target.textContent, 'One');
  assert.equal(mounted.value.update({ text: 'Two' }).ok, true); assert.equal(s.target.textContent, 'Two');
  mounted.value.dispose(); mounted.value.dispose();
  assert.equal(s.target.textContent, ''); assert.equal(mounted.value.update({ text: 'Three' }).error.code, 'NOT_FOUND');
  assert.deepEqual(events, [['mount', 'One'], ['update', 'Two'], ['abort'], ['dispose']]);
  await flush(); assert.deepEqual(s.changes, [{ kind: 'registered', componentId: 'test.label' }]);
  assert.ok(s.logs.some(([level, source, , details]) => level === 'info' && source === provider.manifest.id && details?.code === 'COMPONENTS_READY'));
  await s.stop();
});

test('props are passed as a shallow frozen copy and may contain callbacks', async () => {
  const s = await setup(); let received;
  s.components.register({ id: 'test.button', mount(target, props) { received = props; return { update() {}, dispose() {} }; } }, s.ctx.signal);
  const onPress = () => {}; const nested = { a: 1 };
  s.components.mount('test.button', s.target, { onPress, nested }, s.ctx.signal);
  assert.ok(Object.isFrozen(received)); assert.equal(received.onPress, onPress); assert.equal(received.nested, nested);
  await s.stop();
});

test('invalid input, duplicates and absent IDs are rejected without side effects', async () => {
  const s = await setup(); const events = [];
  s.components.register(label('test.label', events), s.ctx.signal);
  assert.equal(s.components.register(label('test.label'), s.ctx.signal).error.code, 'ALREADY_REGISTERED');
  for (const input of [null, {}, { id: 'bad/name', mount() {} }, { id: 'test.x' }, { id: 'test.x', mount() {}, extra: 1 },
    { id: 'test.x', get mount() { throw Error('Getter'); } }]) {
    assert.equal(s.components.register(input, s.ctx.signal).error.code, 'INVALID_ARGUMENT');
  }
  assert.equal(s.components.register(label('test.other'), null).error.code, 'INVALID_ARGUMENT');
  const closed = s.ctx.scope.child(); await closed.dispose();
  assert.equal(s.components.register(label('test.other'), closed.signal).error.code, 'INVALID_ARGUMENT');
  assert.equal(s.components.mount('test.absent', s.target, {}, s.ctx.signal).error.code, 'NOT_FOUND');
  assert.equal(s.components.mount('test.label', {}, {}, s.ctx.signal).error.code, 'INVALID_ARGUMENT');
  assert.equal(s.components.mount('test.label', s.target, [], s.ctx.signal).error.code, 'INVALID_ARGUMENT');
  assert.equal(s.components.mount('test.label', s.target, { get text() { throw Error('Getter'); } }, s.ctx.signal).error.code, 'INVALID_ARGUMENT');
  assert.equal(s.components.mount('test.label', s.target, {}, closed.signal).error.code, 'INVALID_ARGUMENT');
  assert.deepEqual(s.components.list(), ['test.label']); assert.deepEqual(events, []); assert.equal(s.target.childElementCount, 0);
  await s.stop();
});

test('render failures roll back and are reported; update failures keep the instance', async () => {
  const s = await setup(); let aborted = false;
  s.components.register({ id: 'test.broken', mount(target, props, signal) {
    const node = target.ownerDocument.createElement('i'); target.append(node);
    signal.addEventListener('abort', () => { aborted = true; node.remove(); }, { once: true });
    throw Error('Render failure');
  } }, s.ctx.signal);
  s.components.register({ id: 'test.invalid', mount() { return {}; } }, s.ctx.signal);
  s.components.register({ id: 'test.flaky', mount() { return { update() { throw Error('Update failure'); }, dispose() {} }; } }, s.ctx.signal);
  assert.equal(s.components.mount('test.broken', s.target, {}, s.ctx.signal).error.code, 'RENDER_FAILED');
  assert.equal(aborted, true); assert.equal(s.target.childElementCount, 0);
  assert.equal(s.components.mount('test.invalid', s.target, {}, s.ctx.signal).error.code, 'RENDER_FAILED');
  const flaky = s.components.mount('test.flaky', s.target, {}, s.ctx.signal);
  assert.equal(flaky.value.update({}).error.code, 'RENDER_FAILED');
  const errors = s.logs.filter(([level, , , details]) => level === 'error' && details?.code === 'RENDER_FAILED');
  assert.equal(errors.length, 3); assert.ok(errors.every(([, , , details]) => details.error instanceof Error));
  assert.equal(s.components.has('test.broken'), true);
  await s.stop();
});

test('instance owner cancellation releases only that instance', async () => {
  const s = await setup(); const events = []; s.components.register(label('test.label', events), s.ctx.signal);
  const first = s.ctx.scope.child();
  s.components.mount('test.label', s.target, { text: 'A' }, first.signal);
  const second = s.components.mount('test.label', s.target, { text: 'B' }, s.ctx.signal);
  await first.dispose();
  assert.equal(s.target.textContent, 'B'); assert.equal(second.value.update({ text: 'C' }).ok, true);
  await s.stop();
});

test('component set removal disposes its live instances and notifies consumers', async () => {
  const s = await setup(); const events = []; const set = s.ctx.scope.child();
  s.components.register(label('test.label', events), set.signal);
  const mounted = s.components.mount('test.label', s.target, { text: 'A' }, s.ctx.signal);
  await set.dispose(); await flush();
  assert.equal(s.components.has('test.label'), false); assert.equal(s.target.textContent, '');
  assert.equal(mounted.value.update({ text: 'B' }).error.code, 'NOT_FOUND');
  assert.deepEqual(s.changes.at(-1), { kind: 'removed', componentId: 'test.label' });
  assert.equal(s.components.register(label('test.label'), s.ctx.signal).ok, true, 'ID is reusable after removal');
  await s.stop();
});

test('a real component set plugin registers through the SDK; restart re-registers fresh implementations', async () => {
  const s = await setup(); let generation = 0;
  s.host.register(definePlugin({ manifest: manifest('test.kit', [Components]), activate(ctx) {
    const current = ++generation;
    ctx.use(Components).register({ id: 'test.badge', mount(target) {
      const node = target.ownerDocument.createElement('b'); node.textContent = `Kit ${current}`; target.append(node);
      return { update() {}, dispose() { node.remove(); } };
    } }, ctx.signal);
  } }));
  s.host.grant('test.kit', 'ui.dom');
  await s.host.start('test.kit');
  s.components.mount('test.badge', s.target, {}, s.ctx.signal); assert.equal(s.target.textContent, 'Kit 1');
  await s.host.stop('test.kit'); await flush();
  assert.equal(s.components.has('test.badge'), false); assert.equal(s.target.textContent, '');
  await s.host.start('test.kit');
  s.components.mount('test.badge', s.target, {}, s.ctx.signal); assert.equal(s.target.textContent, 'Kit 2');
  await s.stop();
});

test('consumers without ui.dom cannot acquire the registry', async () => {
  const host = createTestKernel();
  host.installMock(Logger, Object.fromEntries(['log', 'debug', 'info', 'warn', 'error'].map(name => [name, () => true])));
  host.register(provider); host.grant(provider.manifest.id, 'ui.dom');
  host.register(definePlugin({ manifest: manifest('test.denied', [Components]), activate(ctx) {
    assert.throws(() => ctx.use(Components), { code: 'PERMISSION_DENIED' }); throw Error('Expected');
  } }));
  await assert.rejects(host.start('test.denied'));
  await host.stopAll(); host.assertNoResources();
});

test('provider shutdown disposes all instances, detaches owners and publishes nothing afterwards', async () => {
  const s = await setup(); const events = []; const owner = new AbortController();
  const original = owner.signal.removeEventListener.bind(owner.signal); let detached = 0;
  owner.signal.removeEventListener = (...args) => { detached++; return original(...args); };
  s.components.register(label('test.label', events), owner.signal);
  const mounted = s.components.mount('test.label', s.target, { text: 'A' }, owner.signal);
  await flush(); const retained = s.components;
  await s.host.stopAll(); await flush();
  assert.equal(s.target.textContent, ''); assert.ok(events.some(([kind]) => kind === 'dispose'));
  assert.equal(detached, 2);
  const logCount = s.logs.length; const changeCount = s.changes.length;
  owner.abort(); mounted.value.dispose(); assert.equal(mounted.value.update({}).error.code, 'NOT_FOUND'); await flush();
  assert.equal(s.logs.length, logCount); assert.equal(s.changes.length, changeCount);
  assert.throws(() => retained.list());
  s.host.assertNoResources(); assert.deepEqual(s.host.diagnostics(), []);
  s.dom.window.close();
});
