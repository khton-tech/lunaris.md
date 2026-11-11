import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { TestScheduler } from '@lunaris/test';
import { HostSession } from '@lunaris/application-host/session';
import { mountSystemView } from '@lunaris/application-host/view';

test('early loading surface receives preparation progress immediately without polling or product visibility', async () => {
  const dom = new JSDOM('<div id="system"></div><div id="app"></div><div id="boot"><pre>ART</pre><p role="status">Loading system</p></div>');
  const document = dom.window.document; const boot = document.getElementById('boot'); const status = boot.querySelector('p');
  let preparation; const seen = [];
  const session = new HostSession({ scheduler: new TestScheduler(), async load() {
    return { plugins: [], entrypoints: [], startup: { update() { return true; }, preparationSnapshot: () => preparation,
      async prepare(_signal, progress) {
        for (const phase of ['settings', 'document', 'content', 'presentation']) {
          preparation = { epoch: 1, vaultId: null, state: 'preparing', phase }; progress();
          seen.push(status.textContent);
          assert.equal(document.getElementById('app').hidden, true); assert.equal(boot.hidden, false);
        }
      } }, view: { mount() { return { dispose() {} }; } } };
  } });
  const view = mountSystemView(document.getElementById('system'), document.getElementById('app'), session, { startup: boot, locale: 'ru' });
  assert.equal(status.textContent, 'Подготовка системы');
  await session.start();
  assert.deepEqual(seen, ['Восстановление настроек', 'Восстановление активного документа', 'Загрузка содержимого', 'Подготовка рабочего пространства']);
  assert.equal(boot.querySelector('pre').textContent, 'ART'); assert.equal(status.getAttribute('aria-atomic'), 'true');
  assert.equal(boot.hidden, true); await session.stop(); view.dispose(); dom.window.close();
});
