import test from 'node:test';
import assert from 'node:assert/strict';
import { defineApi } from '@lunaris/sdk';
import { host, plugin } from './helpers.mjs';

for (const loss of ['consume', 'provide', 'dispose', 'consumer-stop', 'provider-stop', 'consumer-restart', 'provider-restart']) {
  test(`consumer validator retains only a guarded frozen API after ${loss}`, async () => {
    const { kernel } = host();
    const metadata = { id: 'review.api', version: '1.0.0', providePermission: 'review.write', consumePermission: 'review.read' };
    const api = defineApi(metadata);
    let retained, registration, implementation;
    const token = defineApi({ ...metadata, validate(value) { retained = value; return true; } });
    kernel.register(plugin('review.provider', ctx => {
      implementation = { read() { return this === implementation; }, async later() { return this === implementation; } };
      registration = ctx.provide(api, implementation);
    }, { provides: [{ kind: 'api', id: api.id, version: api.version }], permissions: ['review.write'] }));
    kernel.register(plugin('review.consumer', ctx => { ctx.use(token); }, {
      requires: [{ kind: 'api', id: api.id, range: '^1.0.0' }], permissions: ['review.read'],
    }));
    kernel.grant('review.provider', 'review.write'); kernel.grant('review.consumer', 'review.read');
    await kernel.start('review.consumer');
    const saved = retained;
    assert.equal(saved.read(), true); assert.equal(await saved.later(), true);
    assert.throws(() => { saved.read = () => false; }, TypeError);
    assert.equal(implementation.read(), true);
    if (loss === 'consume') kernel.revoke('review.consumer', 'review.read');
    else if (loss === 'provide') kernel.revoke('review.provider', 'review.write');
    else if (loss === 'dispose') registration.dispose();
    else await kernel[loss.endsWith('restart') ? 'restart' : 'stop'](loss.startsWith('consumer') ? 'review.consumer' : 'review.provider');
    assert.throws(() => saved.read()); assert.throws(() => saved.later());
    await kernel.stopAll();
  });
}
