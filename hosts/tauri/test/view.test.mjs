import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { TestScheduler } from '@lunaris/test';
import { HostSession } from '@lunaris/tauri';
import { mountSystemView } from '../dist/view.js';
import { readFileSync } from 'node:fs';
import viteConfig from '../vite.config.ts';

test('the shell contains viewport overflow and hides scrollbar chrome without disabling content scrolling', () => {
  const dom = new JSDOM('<div id="system-root"><div class="diagnostics"></div></div><div id="application-root"><div class="application-surface"><div data-lunaris-slot="root" style="overflow:auto"></div></div></div>');
  const document = dom.window.document; const style = document.createElement('style');
  style.textContent = readFileSync(new URL('../assets/shell.css', import.meta.url), 'utf8'); document.head.append(style);
  for (const node of [document.documentElement, document.body, document.getElementById('application-root'), document.querySelector('.application-surface')]) {
    assert.equal(dom.window.getComputedStyle(node).overflow, 'hidden');
  }
  for (const node of [document.getElementById('system-root'), document.querySelector('.diagnostics'), document.querySelector('[data-lunaris-slot]')]) {
    const computed = dom.window.getComputedStyle(node);
    assert.equal(computed.overflow, 'auto', 'Recovery, diagnostics and plugin overflow must remain reachable.');
    assert.equal(computed.scrollbarWidth, 'none');
  }
  dom.window.close();
});

test('recovery button and focus styling cannot leak into product controls', () => {
  const dom = new JSDOM('<div id="system-root"><button>Recovery</button></div><div id="application-root"><button>Product</button></div>');
  const document = dom.window.document; const style = document.createElement('style');
  style.textContent = readFileSync(new URL('../assets/shell.css', import.meta.url), 'utf8'); document.head.append(style);
  const recovery = document.querySelector('#system-root button'); const product = document.querySelector('#application-root button');
  assert.equal(dom.window.getComputedStyle(recovery).borderTopColor, 'rgb(188, 188, 188)');
  assert.notEqual(dom.window.getComputedStyle(product).borderTopColor, 'rgb(188, 188, 188)');
  recovery.focus(); const recoveryFocus = dom.window.getComputedStyle(recovery).outline;
  assert.ok(recoveryFocus.includes('2px')); product.focus();
  assert.notEqual(dom.window.getComputedStyle(product).outline, recoveryFocus);
  dom.window.close();
});

test('first HTML paint contains the runner artwork and hides recovery before JavaScript', () => {
  const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const transformed = viteConfig.plugins[0].transformIndexHtml(source);
  const dom = new JSDOM(transformed); const document = dom.window.document;
  assert.equal(document.getElementById('system-root').hidden, true);
  assert.equal(document.getElementById('application-root').hidden, true);
  assert.equal(document.getElementById('startup-root').hidden, false);
  assert.equal(document.querySelector('#startup-root pre').textContent, readFileSync(new URL('../../../resources/ascii_art.txt', import.meta.url), 'utf8').replaceAll('\r\n', '\n'));
  assert.equal(document.querySelector('#startup-root [role=status]').textContent, 'Loading application');
  const native = JSON.parse(readFileSync(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'));
  assert.equal(native.app.windows[0].backgroundColor, '#0F0F0F');
  const style = document.createElement('style'); style.textContent = readFileSync(new URL('../assets/shell.css', import.meta.url), 'utf8'); document.head.append(style);
  assert.equal(dom.window.getComputedStyle(document.documentElement).backgroundColor, 'rgb(15, 15, 15)');
  assert.equal(dom.window.getComputedStyle(document.getElementById('startup-root')).backgroundColor, 'rgb(15, 15, 15)');
  dom.window.close();
});

test('product startup never exposes recovery during delayed composition, activation or retry; real errors still reveal it', async () => {
  const dom = new JSDOM('<div id="boot">Logo</div><div id="system" hidden></div><div id="app" hidden></div>');
  const document = dom.window.document; const root = document.getElementById('system'); const app = document.getElementById('app'); const boot = document.getElementById('boot');
  let release; let entered; let calls = 0;
  const session = new HostSession({ scheduler: new TestScheduler(), load: async () => {
    calls++; entered?.(); await new Promise(resolve => { release = resolve; });
    return { plugins: [], entrypoints: [], view: { duringStartup: true, mount() { return { dispose() {} }; } } };
  } });
  const view = mountSystemView(root, app, session, { startup: boot });
  assert.equal(boot.hidden, false); assert.equal(root.hidden, true);
  const exposure = [];
  const subscription = session.subscribe(snapshot => { if (snapshot.phase === 'idle' || snapshot.phase === 'starting') exposure.push(root.hidden); });
  const loading = new Promise(resolve => { entered = resolve; }); const starting = session.start(); await loading;
  assert.equal(calls, 1); assert.equal(root.hidden, true); assert.equal(boot.hidden, false); assert.equal(app.hidden, true);
  release(); await starting;
  assert.equal(app.hidden, false); assert.equal(boot.hidden, true); assert.equal(root.hidden, true);
  await session.reportFault('startup', 'TEST_FAILURE');
  assert.equal(root.hidden, false); assert.equal(boot.hidden, true); assert.equal(app.hidden, true);
  const reloading = new Promise(resolve => { entered = resolve; }); const retry = session.start(); await reloading;
  assert.equal(root.hidden, true); assert.equal(boot.hidden, false); release(); await retry;
  assert.ok(exposure.length > 0 && exposure.every(Boolean));
  await session.stop(); assert.equal(root.hidden, true); assert.equal(boot.hidden, true);
  subscription.dispose(); view.dispose(); dom.window.close();
});

function setup(definition = { plugins: [], entrypoints: [] }) {
  const dom = new JSDOM('<html lang="ru"><body><div id="system"></div><div id="app"></div></body></html>');
  const document = dom.window.document;
  const root = document.getElementById('system'); const app = document.getElementById('app');
  const session = new HostSession({ scheduler: new TestScheduler(), load: async () => definition });
  const view = mountSystemView(root, app, session);
  return { dom, document, root, app, session, view };
}

test('system view stays English under a Russian document and exposes no language selector', async () => {
  const { dom, root, session, view } = setup(); await session.start();
  assert.equal(root.lang, 'en'); assert.match(root.textContent, /The kernel is running/);
  assert.match(root.textContent, /0\.1\.0/); assert.equal(root.querySelector('select'), null);
  await session.stop(); view.dispose(); dom.window.close();
});

test('mounted application is hidden immediately on failure and diagnostic text cannot inject HTML', async () => {
  const { dom, root, app, session, view } = setup({ plugins: [], entrypoints: [], view: { mount() { return { dispose() {} }; } } });
  await session.start(); assert.equal(app.hidden, false); assert.equal(root.querySelector('main').hidden, true);
  await session.reportFault('view', '<img src=x onerror=alert(1)>');
  assert.equal(app.hidden, true); assert.equal(root.querySelector('main').hidden, false);
  assert.match(root.textContent, /<img src=x/); assert.equal(root.querySelector('img'), null);
  assert.equal(root.querySelector('h1').getAttribute('role'), 'alert');
  await session.stop(); view.dispose(); dom.window.close();
});

test('product view has no host header or reserved shell area; failures reveal recovery automatically', async () => {
  const { dom, root, app, session, view } = setup({ plugins: [], entrypoints: [], view: { mount() { return { dispose() {} }; } } });
  await session.start();
  assert.equal(root.querySelector('header'), null); assert.equal(root.hidden, true); assert.equal(app.hidden, false);
  await session.reportFault('runtime', 'TEST_FAILURE');
  assert.equal(root.hidden, false); assert.equal(app.hidden, true);
  await session.start(); assert.equal(root.hidden, true); assert.equal(app.hidden, false);
  await session.stop(); view.dispose(); dom.window.close();
});

test('healthy status hides retry and keeps optional diagnostics collapsed', async () => {
  const { dom, root, session, view } = setup();
  await session.start();
  assert.equal(root.querySelector('.status-row button').hidden, true);
  assert.equal(root.querySelector('.plugin-help').hidden, true);
  const diagnostics = root.querySelector('.diagnostic-section');
  assert.equal(diagnostics.open, false);
  assert.match(diagnostics.querySelector('summary').textContent, /Diagnostics \(0\)/);
  await session.stop();
  assert.equal(root.querySelector('.status-row button').hidden, false);
  view.dispose(); dom.window.close();
});

test('new faults reveal diagnostics and retry without reopening dismissed details on refresh', async () => {
  const { dom, root, session, view } = setup();
  await session.start();
  await session.reportFault('runtime', 'TEST_FAILURE');
  const diagnostics = root.querySelector('.diagnostic-section');
  assert.equal(diagnostics.open, true);
  assert.match(diagnostics.textContent, /TEST_FAILURE/);
  assert.equal(root.querySelector('.status-row button').hidden, false);
  assert.equal(root.querySelector('.detail').hidden, false);
  diagnostics.open = false;
  session.refresh();
  assert.equal(diagnostics.open, false);
  await session.stop(); view.dispose(); dom.window.close();
});
