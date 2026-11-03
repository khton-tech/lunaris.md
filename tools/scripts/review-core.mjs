// Regression entry point replacing the historical buggy-baseline assertions.
import { spawnSync } from 'node:child_process';
const files = ['review-api', 'review-lifecycle', 'review-diagnostics'].map(name => `packages/kernel/test/${name}.test.mjs`);
const run = spawnSync(process.execPath, ['--test', ...files], { encoding: 'utf8' });
if (run.status !== 0) {
  console.error(run.stdout || run.stderr || run.error?.message || 'Core review checks failed.');
  process.exitCode = 1;
} else {
  const counts = run.stdout.split(/\r?\n/).filter(line => /tests |pass |fail |cancelled /.test(line));
  console.log(`Core review regressions passed: ${counts.join('; ')}`);
  if (process.argv.includes('--benchmark')) {
    const benchmark = spawnSync(process.execPath, ['--expose-gc', 'tools/scripts/benchmark-core.mjs', '.AI_DOCS/reviews/2026-11-03-core/repair-performance.json'], { encoding: 'utf8' });
    console.log(benchmark.stdout.trim());
    if (benchmark.status !== 0) { console.error(benchmark.stderr || benchmark.error?.message); process.exitCode = 1; }
  }
}
