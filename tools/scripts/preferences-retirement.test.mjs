import test from 'node:test';
import assert from 'node:assert/strict';
import { LunarisError } from '@lunaris/sdk';
import { createPreferences as editor } from '../../plugins/UI/text-editor/dist/src/preferences.js';
import { createPreferences as explorer } from '../../plugins/UI/file-explorer/dist/src/preferences.js';

for (const [name, create] of [['editor', editor], ['explorer', explorer]]) {
  for (const code of ['PROVIDER_UNAVAILABLE', 'PERMISSION_DENIED']) {
    test(name + ' pending preferences distinguish provider retirement from ' + code, async () => {
      const pending = Promise.withResolvers();
      const error = new LunarisError(code, 'Vault endpoint unavailable');
      let retired = false;
      let changes = 0;
      const logs = [];
      const ok = () => ({ ok: true, value: null });
      const services = {
        'lunaris.vault': { current() { if (retired) throw error; return { id: 'vault' }; } },
        'lunaris.config': { read: () => pending.promise },
        'lunaris.settings': Object.fromEntries(['registerCategory', 'registerGroup', 'registerItem', 'updateCategory', 'updateGroup', 'updateItem'].map(key => [key, ok])),
        'lunaris.localization': { register: ok, text: (_, key) => key },
        'lunaris.themes': { current: () => null },
        'lunaris.logger': Object.fromEntries(['debug', 'info', 'warn', 'error'].map(level => [level, (...args) => { logs.push([level, ...args]); return true; }])),
      };
      const ctx = { pluginId: 'test.' + name, signal: new AbortController().signal,
        use: token => { assert.ok(services[token.id], token.id); return services[token.id]; }, events: { on() {} } };
      const preferences = create(ctx, () => { changes++; });
      const before = changes;
      retired = true;
      pending.resolve({ ok: true, value: {} });
      if (code === 'PROVIDER_UNAVAILABLE') await preferences.ready();
      else await assert.rejects(preferences.ready(), caught => caught === error);
      assert.equal(ctx.signal.aborted, false, 'consumer scope remains open');
      assert.equal(changes, before, 'late read must not publish');
      assert.equal(logs.filter(entry => entry[0] === 'error').length, code === 'PROVIDER_UNAVAILABLE' ? 0 : 1);
    });
  }
}
