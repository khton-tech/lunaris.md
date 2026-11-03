// Follow-up audit probes: assert observed defects, not desired fixed behavior.
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { writeFile } from 'node:fs/promises';
import { createKernel } from '@lunaris/kernel';
import { defineApi, definePlugin } from '@lunaris/sdk';

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
    const settled = [];
    const operations = [kernel.stop('followup.consumer'), kernel.stop('followup.provider'), kernel.start('followup.consumer')];
    operations.forEach((operation, index) => {
      void operation.then(() => settled.push(index), error => settled.push({ index, code: error.code }));
    });
    // Flush complete event-loop turns; plugins have no external asynchronous work.
    await new Promise(setImmediate); await new Promise(setImmediate);
    const states = kernel.inspect().plugins.map(p => ({ id: p.manifest.id, state: p.state }));
    assert.deepEqual(settled, [0]);
    assert.equal(tasks.size, 0);
    assert.deepEqual(states.map(p => p.state), ['stopped', 'stopping']);
    results.push({ id: 'F01', kind, settledOperations: settled, scheduledDeadlines: tasks.size, states });
    // stopAll would join the same unresolved queues. No external resources exist.
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
  const report = { reviewedCommit: '3698b21', node: process.version, platform: `${process.platform}/${process.arch}`, results };
  if (process.argv[2]) await writeFile(process.argv[2], JSON.stringify(report, null, 2) + '\n');
  console.log(`Follow-up audit: ${results.filter(r => r.id === 'F01').length} queue deadlocks reproduced; 9 shared-contract performance samples; ${process.argv[2] ?? JSON.stringify(report)}`);
}
main().catch(error => { console.error(`Follow-up audit failed: ${error.message}`); process.exitCode = 1; });
