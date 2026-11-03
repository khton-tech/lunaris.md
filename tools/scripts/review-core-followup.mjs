// Follow-up regression probes and uninstrumented scaling samples.
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { writeFile } from 'node:fs/promises';
import { createKernel } from '@lunaris/kernel';
import { defineApi, defineEvent, defineHook, definePlugin } from '@lunaris/sdk';

function host() {
  const tasks = new Map(); let sequence = 0;
  const kernel = createKernel({ scheduler: { schedule(ms, callback) {
    const id = ++sequence; tasks.set(id, { ms, callback }); return () => tasks.delete(id);
  } } });
  return { kernel, tasks };
}
const token = defineApi({ id: 'followup.api', version: '1.0.0' });
const provided = (kind = 'api') => [{ kind, id: token.id, version: token.version }];
const required = (kind = 'api') => [{ kind, id: token.id, range: '^1.0.0' }];
const plugin = (id, activate, extra = {}) => definePlugin({ manifest: {
  manifestVersion: 1, id, version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0',
  entry: './plugin.js', provides: [], requires: [], permissions: [], optionalPermissions: [], ...extra,
}, activate });

async function main() {
  const results = [];
  for (const kind of ['api', 'event', 'hook']) {
    const { kernel, tasks } = host();
    kernel.register(plugin('followup.provider', ctx => {
      if (kind === 'api') ctx.provide(token, {});
    }, { provides: provided(kind) }));
    kernel.register(plugin('followup.consumer', () => {}, { requires: required(kind) }));
    await kernel.start('followup.consumer');
    const operations = [kernel.stop('followup.consumer'), kernel.stop('followup.provider'), kernel.start('followup.consumer')];
    await Promise.all(operations);
    const states = kernel.inspect().plugins.map(p => ({ id: p.manifest.id, state: p.state }));
    assert.equal(tasks.size, 0);
    assert.deepEqual(states.map(p => p.state), ['active', 'active']);
    await kernel.stopAll(); assert.equal(tasks.size, 0);
    assert.ok(kernel.inspect().plugins.every(p => p.state === 'stopped' && p.ownedResources === 0));
    results.push({ id: 'F01', kind, settledOperations: 3, scheduledDeadlines: tasks.size, cleanup: 'passed' });
  }

  for (const consumers of [1, 100, 500]) {
    const { kernel } = host(); let handle;
    kernel.register(plugin('followup.provider', ctx => { ctx.provide(token, { ping() { return 1; } }); }, { provides: provided() }));
    for (let i = 0; i < consumers; i++) {
      const id = `followup.consumer-${i}`;
      kernel.register(plugin(id, ctx => { handle = ctx.use(token); }, { requires: required() }));
      await kernel.start(id);
    }
    for (let i = 0; i < 1000; i++) handle.ping();
    const samplesMs = [];
    for (let sample = 0; sample < 3; sample++) {
      const began = performance.now();
      for (let i = 0; i < 10000; i++) handle.ping();
      samplesMs.push(+(performance.now() - began).toFixed(3));
    }
    results.push({ id: 'F02', consumers, callsPerSample: 10000, samplesMs });
    await kernel.stopAll();
  }
  for (const kind of ['event', 'hook']) for (const consumers of [1, 100, 500]) {
    const { kernel } = host(); let owner; let deliveries = 0;
    const contract = (kind === 'event' ? defineEvent : defineHook)({ id: token.id, version: token.version });
    kernel.register(plugin('followup.provider', ctx => { owner = ctx; }, { provides: provided(kind) }));
    for (let i = 0; i < consumers; i++) {
      const id = `followup.consumer-${i}`;
      kernel.register(plugin(id, ctx => {
        if (kind === 'event') ctx.events.on(contract, () => { deliveries++; });
        else ctx.hooks.register(contract, value => { deliveries++; return value; });
      }, { requires: required(kind) }));
      await kernel.start(id);
    }
    const dispatch = () => kind === 'event' ? owner.events.emit(contract, 1) : owner.hooks.run(contract, 1);
    for (let i = 0; i < 10; i++) await dispatch();
    const samplesMs = [];
    for (let sample = 0; sample < 3; sample++) {
      const began = performance.now();
      for (let i = 0; i < 50; i++) await dispatch();
      samplesMs.push(+(performance.now() - began).toFixed(3));
    }
    assert.equal(deliveries, consumers * 160);
    results.push({ id: 'F02-dispatch', kind, consumers, callsPerSample: 50, samplesMs });
    await kernel.stopAll();
  }
  for (const unrelatedPairs of [100, 500, 1000]) {
    const { kernel } = host();
    kernel.register(plugin('followup.provider', ctx => { ctx.provide(token, {}); }, { provides: provided() }));
    kernel.register(plugin('followup.consumer', () => {}, { requires: required() }));
    for (let i = 0; i < unrelatedPairs; i++) {
      const id = `noise.contract-${i}`;
      const api = defineApi({ id, version: '1.0.0' });
      kernel.register(plugin(`noise.provider-${i}`, ctx => { ctx.provide(api, {}); }, { provides: [{ kind: 'api', id, version: api.version }] }));
      kernel.register(plugin(`noise.consumer-${i}`, () => {}, { requires: [{ kind: 'api', id, range: '^1.0.0' }] }));
    }
    const samplesMs = [];
    for (let i = 0; i < 5; i++) {
      const began = performance.now(); await kernel.start('followup.consumer');
      samplesMs.push(+(performance.now() - began).toFixed(3)); await kernel.stop('followup.provider');
    }
    results.push({ id: 'R07', unrelatedPairs, dependencyNodes: 2, samplesMs });
    assert.ok(kernel.inspect().plugins.filter(p => p.manifest.id.startsWith('noise.')).every(p => p.state === 'registered'));
    await kernel.stopAll();
  }
  const report = { phase: 'post-hardening', node: process.version, platform: `${process.platform}/${process.arch}`, results };
  if (process.argv[2]) await writeFile(process.argv[2], JSON.stringify(report, null, 2) + '\n');
  console.log(`Follow-up checks: 3 lifecycle regressions passed; API/event/hook fan-out and dependency-closure samples completed; ${process.argv[2] ?? JSON.stringify(report)}`);
}
const watchdog = setTimeout(() => { console.error('Follow-up checks exceeded 30 seconds.'); process.exitCode = 1; }, 30000);
main().catch(error => { console.error(`Follow-up audit failed: ${error.message}`); process.exitCode = 1; })
  .finally(() => clearTimeout(watchdog));
