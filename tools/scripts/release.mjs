import { spawnSync } from 'node:child_process';
import { dependencies } from './boundaries.mjs';
try {
  for (const args of [
    ['tools/scripts/check.mjs', ...Object.keys(dependencies)],
    ['--test', '--test-reporter=dot', 'tools/scripts/ci.test.mjs'],
    ['tools/scripts/audit.mjs'], ['tools/scripts/benchmark.mjs'], ['tools/scripts/rehearse.mjs'],
  ]) {
    const result = spawnSync(process.execPath, args, { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
    if (result.status !== 0) throw new Error(result.stdout + result.stderr);
    if (result.stdout.trim()) console.log(result.stdout.trim());
  }
  console.log('Release validation passed for the adjusted local 0.1 scope. No merge or publishing performed.');
} catch (error) { console.error(`Release validation failed: ${error.message}`); process.exitCode = 1; }
