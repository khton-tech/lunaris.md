// Public-boundary throughput samples; no timing thresholds or production SLOs.
// Run with --expose-gc for retained-heap observations (not total allocations).
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { writeFile } from 'node:fs/promises';
import { Session } from 'node:inspector/promises';
import { createKernel } from '@lunaris/kernel';
import { defineApi, defineEvent, defineHook, definePlugin } from '@lunaris/sdk';
const results = [];
const profiler = new Session();
profiler.connect();
const scheduler = { schedule(ms, callback) { const id = setTimeout(callback, ms); return () => clearTimeout(id); } };
const host = () => createKernel({ scheduler });
const plugin = (id, activate = () => {}, extra = {}) => definePlugin({ manifest: {
  manifestVersion: 1, id, version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './plugin.js',
  provides: [], requires: [], permissions: [], optionalPermissions: [], ...extra,
}, activate });
const provided = token => ({ kind: token.kind, id: token.id, version: token.version });
const required = token => ({ kind: token.kind, id: token.id, range: '^1.0.0' });
async function measure(fields, work, count) {
  for (let i = 0; i < 1000; i++) await work();
  global.gc?.(); const heap = process.memoryUsage().heapUsed;
  await profiler.post('HeapProfiler.startSampling', { samplingInterval: 32768,
    includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
  const start = performance.now();
  for (let i = 0; i < count; i++) await work();
  const elapsedMs = performance.now() - start;
  const { profile } = await profiler.post('HeapProfiler.stopSampling');
  const sampledBytes = node => node.selfSize + node.children.reduce((sum, child) => sum + sampledBytes(child), 0);
  global.gc?.();
  results.push({ ...fields, calls: count, elapsedMs: +elapsedMs.toFixed(3),
    sampledAllocationBytes: sampledBytes(profile.head),
    ...(global.gc ? { retainedHeapDeltaBytes: process.memoryUsage().heapUsed - heap } : {}) });
}
async function main() {
  for (const kind of ['api', 'event', 'hook']) for (const [unrelated, manifestSize] of [[0, 0], [100, 0], [1000, 0], [0, 100]]) {
    const kernel = host(); let owner, handle; let deliveries = 0;
    const factory = kind === 'api' ? defineApi : kind === 'event' ? defineEvent : defineHook;
    const token = factory({ id: 'bench.contract', version: '1.0.0' });
    const permissions = Array.from({ length: manifestSize }, (_, i) => `bench.permission-${i}`);
    kernel.register(plugin('bench.provider', ctx => { owner = ctx; if (kind === 'api') ctx.provide(token, { ping() { return 1; } }); }, { provides: [provided(token)], optionalPermissions: permissions }));
    kernel.register(plugin('bench.consumer', ctx => {
      if (kind === 'api') handle = ctx.use(token);
      else if (kind === 'event') ctx.events.on(token, () => { deliveries++; });
      else ctx.hooks.register(token, value => { deliveries++; return value; });
    }, { requires: [required(token)], optionalPermissions: permissions }));
    for (let i = 0; i < unrelated; i++) {
      if (kind === 'api') kernel.register(plugin(`bench.extra-${i}`));
      else {
        const other = factory({ id: `bench.other-${i}`, version: '1.0.0' });
        kernel.register(plugin(`bench.extra-${i}`, ctx => {
          if (kind === 'event') ctx.events.on(other, () => {}); else ctx.hooks.register(other, value => value);
        }, { requires: [required(other)] }));
        // One provider keeps unrelated subscription setup out of the measured path.
        kernel.register(plugin(`bench.owner-${i}`, () => {}, { provides: [provided(other)] }));
        await kernel.start(`bench.extra-${i}`);
      }
    }
    await kernel.start('bench.consumer');
    const work = kind === 'api' ? () => assert.equal(handle.ping(), 1) : kind === 'event' ? () => owner.events.emit(token, null) : async () => assert.equal(await owner.hooks.run(token, 1), 1);
    await measure({ kind, unrelated, manifestSize }, work, kind === 'api' ? 10000 : 2000);
    if (kind !== 'api') assert.equal(deliveries, 3000);
    await kernel.stopAll(); assert.ok(kernel.inspect().plugins.every(p => p.ownedResources === 0));
  }
  for (const pairs of [100, 500, 1000]) {
    const kernel = host(); kernel.register(plugin('bench.target'));
    for (let i = 0; i < pairs; i++) {
      const token = defineApi({ id: `bench.contract-${i}`, version: '1.0.0' });
      kernel.register(plugin(`bench.provider-${i}`, ctx => { ctx.provide(token, {}); }, { provides: [provided(token)] }));
      kernel.register(plugin(`bench.consumer-${i}`, () => {}, { requires: [required(token)] }));
    }
    const samples = [];
    for (let i = 0; i < 7; i++) {
      const start = performance.now(); await kernel.start('bench.target'); samples.push(performance.now() - start); await kernel.stop('bench.target');
    }
    results.push({ kind: 'isolated-start', unrelatedPairs: pairs, samplesMs: samples.map(v => +v.toFixed(3)) });
    await kernel.stopAll();
  }
  for (const shape of ['chain', 'diamonds', 'optional-cycle']) for (const size of [10, 50, 100]) {
    const kernel = host(); const order = [];
    const tokens = Array.from({ length: size }, (_, i) => defineApi({ id: `bench.node-${i}`, version: '1.0.0' }));
    for (let i = 0; i < size; i++) {
      const deps = shape === 'optional-cycle' ? [(i + 1) % size] : shape === 'chain' ? (i ? [i - 1] : []) : (i > 1 ? [i - 1, i - 2] : i ? [0] : []);
      kernel.register(plugin(`bench.node-${i}`, ctx => { order.push(i); ctx.provide(tokens[i], {}); }, {
        provides: [provided(tokens[i])], requires: deps.map(n => ({ ...required(tokens[n]), ...(shape === 'optional-cycle' ? { optional: true } : {}) })),
      }));
    }
    const start = performance.now(); await kernel.start(`bench.node-${size - 1}`);
    results.push({ kind: 'graph-start', shape, nodes: size, elapsedMs: +(performance.now() - start).toFixed(3), activated: order.length });
    assert.ok(order.length > 0); assert.equal(new Set(order).size, order.length);
    await kernel.stopAll();
  }
  profiler.disconnect();
  const report = { node: process.version, platform: `${process.platform}/${process.arch}`, gc: !!global.gc,
    allocationSamplingIntervalBytes: 32768, results };
  const output = process.argv[2]; if (output) await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log(`Core performance: ${results.length} samples completed; ${output ? `evidence: ${output}` : JSON.stringify(report)}`);
}
main().catch(error => { console.error(`Core performance failed: ${error.message}`); process.exitCode = 1; });
