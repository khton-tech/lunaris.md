import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { mountSystemView } from '@lunaris/application-host/view';

test('healthy polling does not serialize snapshots or rebuild hidden recovery UI', () => {
  const dom = new JSDOM('<div id="system"></div><div id="app"></div>');
  let notify; let serialized = 0;
  const session = { subscribe(listener) { notify = listener; return { dispose() {} }; } };
  const root = dom.window.document.getElementById('system'); const app = dom.window.document.getElementById('app');
  const view = mountSystemView(root, app, session);
  const snapshot = { phase: 'running', applicationVisible: true, kernel: { plugins: [], diagnostics: [] }, disabled: [], incidents: [],
    toJSON() { serialized++; return { phase: this.phase }; } };
  for (let i = 0; i < 20; i++) notify(snapshot);
  assert.equal(serialized, 0); assert.equal(root.querySelector('.metrics').childElementCount, 0);
  assert.equal(app.hidden, false); assert.equal(root.hidden, true);
  notify({ ...snapshot, phase: 'fallback', applicationVisible: false });
  assert.equal(serialized, 1); assert.equal(root.hidden, false); assert.equal(app.hidden, true);
  assert.equal(root.querySelector('.metrics').childElementCount, 4);
  view.dispose(); dom.window.close();
});

test('safe recovery remains reachable with the product shell replaced', () => {
  const dom = new JSDOM('<div id="system"></div><div id="app"><input></div></div>');
  const { document, KeyboardEvent } = dom.window;
  let notify; let restarts = 0;
  const session = {
    subscribe(listener) { notify = listener; return { dispose() {} }; },
    async startSafeMode() { restarts++; },
  };
  const view = mountSystemView(document.getElementById('system'), document.getElementById('app'), session);
  const input = document.querySelector('input');
  const status = { phase: 'running', applicationVisible: true, pluginRuntimeAvailable: true };
  const press = data => input.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'F8', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true, ...data,
  }));
  notify({ ...status, busy: true });
  assert.equal(press(), true);
  notify(status);
  assert.equal(press({ repeat: true }), true);
  assert.equal(press(), false);
  assert.equal(restarts, 1);
  view.dispose();
  assert.equal(press(), true);
  assert.equal(restarts, 1);
  dom.window.close();
});
