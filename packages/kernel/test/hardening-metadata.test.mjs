import test from 'node:test';
import assert from 'node:assert/strict';
import { defineApi, defineEvent, defineHook } from '@lunaris/sdk';
import { host, plugin, deferred } from './helpers.mjs';

for (const kind of ['api', 'event', 'hook']) {
  test(`${kind}: concurrent staged metadata is checked atomically at commit and released`, async () => {
    const { kernel } = host(); const entered = [deferred(), deferred()], finish = [deferred(), deferred()];
    const factory = kind === 'api' ? defineApi : kind === 'event' ? defineEvent : defineHook;
    const tokens = [0, 1].map(i => factory({ id: 'hardening.contract', version: '1.0.0', consumePermission: `hardening.read-${i}` }));
    for (const i of [0, 1]) {
      const id = `hardening.participant-${i}`;
      const provided = { kind, id: tokens[i].id, version: tokens[i].version };
      if (kind !== 'api') {
        const owner = `hardening.owner-${i}`;
        kernel.register(plugin(owner, () => {}, { provides: [provided] }));
      }
      kernel.register(plugin(id, async ctx => {
        if (kind === 'api') ctx.provide(tokens[i], {});
        else if (kind === 'event') ctx.events.on(tokens[i], () => {});
        else ctx.hooks.register(tokens[i], value => value);
        entered[i].resolve(); await finish[i].promise;
      }, { provides: kind === 'api' ? [provided] : [],
        requires: kind === 'api' ? [] : [{ kind, id: tokens[i].id, range: '^1.0.0' }],
        permissions: [`hardening.read-${i}`] }));
      kernel.grant(id, `hardening.read-${i}`);
      if (kind !== 'api') kernel.selectProvider(id, kind, tokens[i].id, `hardening.owner-${i}`);
    }
    const one = kernel.start('hardening.participant-0'), two = kernel.start('hardening.participant-1');
    const rejected = assert.rejects(two, error => error.code === 'ACTIVATION_FAILED' && error.cause.code === 'CONTRACT_METADATA_CONFLICT');
    await Promise.all(entered.map(e => e.promise)); finish[0].resolve(); await one;
    finish[1].resolve(); await rejected;
    await kernel.stop('hardening.participant-0');
    // Last committed owner leaves: formerly conflicting metadata can now commit.
    await kernel.start('hardening.participant-1'); await kernel.stopAll();
    assert.ok(kernel.inspect().plugins.every(p => p.ownedResources === 0));
  });
}

test('new metadata on an active participant is checked and shared calls still revoke dynamically', async () => {
  const { kernel } = host(); let provider, consumer, handle;
  const token = defineApi({ id: 'hardening.contract', version: '1.0.0', consumePermission: 'hardening.read' });
  kernel.register(plugin('hardening.provider', ctx => { provider = ctx; ctx.provide(token, { ping() { return 1; } }); },
    { provides: [{ kind: 'api', id: token.id, version: token.version }] }));
  for (let i = 0; i < 20; i++) {
    const id = `hardening.consumer-${i}`;
    kernel.register(plugin(id, ctx => { consumer = ctx; handle = ctx.use(token); },
      { requires: [{ kind: 'api', id: token.id, range: '^1.0.0' }], permissions: ['hardening.read'] }));
    kernel.grant(id, 'hardening.read'); await kernel.start(id);
  }
  assert.equal(handle.ping(), 1);
  assert.throws(() => consumer.use(defineApi({ id: token.id, version: token.version })), { code: 'CONTRACT_METADATA_CONFLICT' });
  kernel.revoke('hardening.consumer-19', 'hardening.read');
  assert.throws(() => handle.ping(), { code: 'PERMISSION_DENIED' });
  kernel.grant('hardening.consumer-19', 'hardening.read'); assert.equal(handle.ping(), 1);
  await provider.scope.dispose(); assert.throws(() => handle.ping()); await kernel.stopAll();
});
