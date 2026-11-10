import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { bindWindowClose } from '../dist/desktop.js';

test('native close awaits resource cleanup; repeated requests cannot destroy the window early', async () => {
  const finished = Promise.withResolvers(); let handler; let stops = 0; let removed = false;
  const unlisten = await bindWindowClose({ requestClose() { stops++; return finished.promise; } }, {
    async onCloseRequested(callback) { handler = callback; return () => { removed = true; }; },
  });
  const first = handler({ preventDefault() { assert.fail('first close should complete after cleanup'); } });
  let prevented = false;
  await handler({ preventDefault() { prevented = true; } });
  assert.equal(stops, 1); assert.equal(prevented, true);
  finished.resolve(true); await first; unlisten(); assert.ok(removed);
});

test('Windows WebView leaves HTML5 drag/drop to the SDK component renderer', () => {
  const config = JSON.parse(readFileSync(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'));
  assert.equal(config.app.windows.find(window => window.label === 'main').dragDropEnabled, false);
});

test('release CSP permits runtime product styles while keeping scripts and embedded content restricted', () => {
  const { app: { security } } = JSON.parse(readFileSync(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'));
  const directives = policy => new Map(policy.split(';').map(part => {
    const [name, ...values] = part.trim().split(/\s+/); return [name, values];
  }));
  const release = directives(security.csp); const development = directives(security.devCsp);
  assert.deepEqual(release.get('style-src'), development.get('style-src'));
  assert.ok(release.get('style-src').includes("'unsafe-inline'"));
  assert.deepEqual(release.get('script-src'), ["'self'", "'wasm-unsafe-eval'"]);
  assert.equal(release.get('script-src').includes("'unsafe-eval'"), false);
  assert.deepEqual(release.get('default-src'), ["'self'"]);
  assert.deepEqual(release.get('object-src'), ["'none'"]);
  assert.deepEqual(release.get('frame-src'), ["'none'"]);
});

test('failed save keeps the window open and allows a later close request', async () => {
  let handler; let allowed = false; let prevented = 0; let calls = 0;
  await bindWindowClose({ async requestClose() { calls++; return allowed; } }, {
    async onCloseRequested(callback) { handler = callback; return () => {}; },
  });
  const event = { preventDefault() { prevented++; } };
  await handler(event); assert.equal(prevented, 1);
  allowed = true; await handler(event); assert.equal(calls, 2); assert.equal(prevented, 1);
});
