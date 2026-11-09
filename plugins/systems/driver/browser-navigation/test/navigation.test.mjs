import test from 'node:test';
import assert from 'node:assert/strict';
import { createBrowserNavigation } from '@lunaris/browser-navigation';
import { DocumentProtection } from '@lunaris/active-document';
import { ApplicationReload } from '@lunaris/remote';
import { testHost, consumer } from '../../../../../tools/testing/remote.mjs';
test('browser unload warns only for unprotected edits and releases the native listener', async () => {
  const host = testHost({ 'lunaris.browser-navigation': ['application.native', 'vault.access'], 'test.consumer': ['application.reload'] }); let dirty = true; let api; let reloaded = false; const listeners = new Map();
  host.installMock(DocumentProtection, { hasUnprotectedChanges: () => dirty });
  const view = { addEventListener: (name, handler) => listeners.set(name, handler), removeEventListener: name => listeners.delete(name), location: { reload: () => { reloaded = true; } } };
  host.register(createBrowserNavigation(view)); host.register(consumer([ApplicationReload], ctx => { api = ctx.use(ApplicationReload); }, ['application.reload']));
  await host.start('test.consumer'); let prevented = false;
  listeners.get('beforeunload')({ preventDefault() { prevented = true; } }); assert.equal(prevented, true);
  dirty = false; prevented = false; listeners.get('beforeunload')({ preventDefault() { prevented = true; } }); assert.equal(prevented, false);
  api.reload(); assert.equal(reloaded, true); await host.stopAll(); host.assertNoResources(); assert.equal(listeners.size, 0);
});
