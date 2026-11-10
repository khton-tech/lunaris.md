import { spawnSync } from 'node:child_process';
/** Run built-module regressions; npm check/server:check prepare their prerequisites. */
export function runAuditRegressions(label, files, pattern) {
  const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', '--test-name-pattern=' + pattern, ...files], { encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
  const passed = Number(result.stdout?.match(/^# pass (\d+)/m)?.[1]);
  if (result.error || result.status !== 0 || !passed) {
    process.stderr.write(label + ' failed: ' + (result.error?.message ?? result.stdout + result.stderr) + '\n'); process.exitCode = 1; return;
  }
  process.stdout.write(label + ': ' + passed + ' desired-behavior regressions passed. Synthetic/temporary data only.\n');
}
