import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { TestScheduler } from '@lunaris/test';
import { HostSession } from '@lunaris/tauri';
import { mountSystemView } from '../dist/view.js';

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

test('system control opens inspection and returns to a working application', async () => {
  const { dom, root, app, session, view } = setup({ plugins: [], entrypoints: [], view: { mount() { return { dispose() {} }; } } });
  await session.start(); const system = root.querySelector('header button');
  system.click(); assert.equal(app.hidden, true); system.click(); assert.equal(app.hidden, false);
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
