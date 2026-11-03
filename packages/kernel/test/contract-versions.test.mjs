import test from 'node:test';
import assert from 'node:assert/strict';
import { defineApi, defineEvent, defineHook } from '@lunaris/sdk';
import { host, plugin } from './helpers.mjs';

const versions = [
  ['1.0.0', '1.2.0', false],
  ['1.2.0', '1.0.0', true],
  ['1.0.9', '1.0.10', false],
  ['2.0.0', '1.0.0', false],
  ['0.2.1', '0.2.0', true],
  ['0.3.0', '0.2.0', false],
  ['0.0.2', '0.0.1', false],
  ['0.0.1+provider', '0.0.1+consumer', true],
  ['1.2.0-beta.2', '1.2.0-beta.1', true],
  ['1.2.0-beta.1', '1.2.0-beta.2', false],
  ['1.2.0', '1.2.0-beta.1', true],
  ['1.3.0-beta.1', '1.2.0', false],
];

for (const kind of ['api', 'event', 'hook']) {
  for (const [providerVersion, consumerVersion, allowed] of versions) {
    test(`${kind}: provider ${providerVersion}, token ${consumerVersion} is ${allowed ? 'compatible' : 'rejected'}`, async () => {
      const { kernel } = host();
      const factory = kind === 'api' ? defineApi : kind === 'event' ? defineEvent : defineHook;
      const providerToken = factory({ id: 'versions.contract', version: providerVersion });
      const consumerToken = factory({ id: 'versions.contract', version: consumerVersion });
      let provider, consumer, calls = 0;
      kernel.register(plugin('versions.provider', ctx => {
        provider = ctx;
        if (kind === 'api') ctx.provide(providerToken, { value() { return 42; } });
      }, { provides: [{ kind, id: providerToken.id, version: providerVersion }] }));
      kernel.register(plugin('versions.consumer', ctx => { consumer = ctx; }, {
        // Both versions satisfy the manifest; the token still establishes a minimum.
        requires: [{ kind, id: providerToken.id, range: `${providerVersion} || ${consumerVersion}` }],
      }));
      await kernel.start('versions.consumer');
      const acquire = () => kind === 'api' ? consumer.use(consumerToken) :
        kind === 'event' ? consumer.events.on(consumerToken, () => { calls++; }) :
          consumer.hooks.register(consumerToken, value => { calls++; return value + 1; });
      try {
        if (!allowed) {
          assert.throws(acquire, { code: 'CONTRACT_METADATA_CONFLICT' });
        } else {
          const handle = acquire();
          if (kind === 'api') assert.equal(handle.value(), 42);
          else if (kind === 'event') await provider.events.emit(providerToken, 1);
          else assert.equal(await provider.hooks.run(providerToken, 1), 2);
          if (kind !== 'api') assert.equal(calls, 1);
        }
      } finally {
        await kernel.stopAll();
      }
    });
  }
}
