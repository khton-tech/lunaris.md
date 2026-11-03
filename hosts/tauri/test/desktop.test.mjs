import test from 'node:test';
import assert from 'node:assert/strict';
import { bindWindowClose } from '../dist/desktop.js';

test('native close awaits resource cleanup; repeated requests cannot destroy the window early', async () => {
  const finished = Promise.withResolvers(); let handler; let stops = 0; let removed = false;
  const unlisten = await bindWindowClose({ stop() { stops++; return finished.promise; } }, {
    async onCloseRequested(callback) { handler = callback; return () => { removed = true; }; },
  });
  const first = handler({ preventDefault() { assert.fail('first close should complete after cleanup'); } });
  let prevented = false;
  await handler({ preventDefault() { prevented = true; } });
  assert.equal(stops, 1); assert.equal(prevented, true);
  finished.resolve(); await first; unlisten(); assert.ok(removed);
});
