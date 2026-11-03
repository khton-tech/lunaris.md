import { performance } from 'node:perf_hooks';
const started = performance.now();
const { createTestKernel } = await import('@lunaris/test');
const { definePlugin, defineApi } = await import('@lunaris/sdk');
const manifest = (id, provides = [], requires = []) => ({ manifestVersion: 1, id, version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './plugin.js', provides, requires, permissions: [], optionalPermissions: [] });
try {
  const host = createTestKernel();
  host.register(definePlugin({ manifest: manifest('bench.startup'), activate() {} }));
  await host.start('bench.startup'); await host.stopAll(); host.assertNoResources();
  const startupMs = performance.now() - started;
  if (startupMs >= 5000) throw new Error('Test-host startup exceeded five seconds.');
  const graphs = [];
  for (const size of [10, 50, 100]) {
    const kernel = createTestKernel(); const registration = performance.now();
    for (let index = 0; index < size; index++) {
      const id = `bench.node-${index}`; const token = defineApi({ id, version: '1.0.0' });
      kernel.register(definePlugin({ manifest: manifest(id, [{ kind: 'api', id, version: '1.0.0' }], index ? [{ kind: 'api', id: `bench.node-${index - 1}`, range: '^1.0.0' }] : []), activate(ctx) { ctx.provide(token, {}); } }));
    }
    const activation = performance.now(); await kernel.start(`bench.node-${size - 1}`);
    const stop = performance.now(); await kernel.stopAll(); kernel.assertNoResources();
    graphs.push({ nodes: size, registerMs: +(activation - registration).toFixed(2), startMs: +(stop - activation).toFixed(2), stopMs: +(performance.now() - stop).toFixed(2) });
  }
  const cycles = createTestKernel(); cycles.register(definePlugin({ manifest: manifest('bench.cycles'), activate(ctx) { ctx.scope.own({ dispose() {} }); } }));
  const repeat = performance.now();
  for (let index = 0; index < 100; index++) { await cycles.start('bench.cycles'); await cycles.stop('bench.cycles'); }
  cycles.assertNoResources();
  console.log(JSON.stringify({ node: process.versions.node, platform: `${process.platform}/${process.arch}`, startupMs: +startupMs.toFixed(2), graphs, cycles100Ms: +(performance.now() - repeat).toFixed(2) }));
} catch (error) { console.error(`Benchmark failed: ${error.message}`); process.exitCode = 1; }
