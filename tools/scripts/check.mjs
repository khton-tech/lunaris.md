import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { checkEnvironment } from './environment.mjs';
import { checkBoundaries, dependencies, packagePath } from './boundaries.mjs';

function run(args, label) {
  const result = spawnSync(process.execPath, args, { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  if (result.error || result.status !== 0) {
    throw new Error(`${label}: ${result.error?.message ?? result.stdout + result.stderr}`);
  }
  return result.stdout;
}

try {
  checkEnvironment();
  const requested = process.argv.slice(2);
  if (!requested.length) throw new Error(`Provide package scope(s): ${Object.keys(dependencies).join(', ')}.`);
  for (const scope of requested) {
    if (!Object.hasOwn(dependencies, scope)) throw new Error(`Unknown package scope: ${scope}`);
  }
  const affected = new Set(requested);
  for (const scope of affected) {
    for (const [consumer, deps] of Object.entries(dependencies)) {
      if (deps.includes(scope)) affected.add(consumer);
    }
  }
  // Project references build prerequisites; checks include affected consumers.
  run(['node_modules/typescript/bin/tsc', '-b', ...[...affected].map(scope => packagePath(scope))], 'Build');
  await checkBoundaries(Object.keys(dependencies));
  let passed = 0; let skipped = 0;
  const totals = output => {
    passed += Number(output.match(/^# pass (\d+)$/m)?.[1] ?? 0);
    skipped += Number(output.match(/^# skipped (\d+)$/m)?.[1] ?? 0);
  };
  totals(run(['--test', '--test-reporter=tap', 'tools/scripts/boundaries.test.mjs'], 'Boundary checker tests'));
  for (const scope of affected) {
    const tests = readdirSync(`${packagePath(scope)}/test`).filter(name => name.endsWith('.test.mjs'));
    totals(run(['--test', '--test-reporter=tap', ...tests.map(name => `${packagePath(scope)}/test/${name}`)], `${scope} tests`));
    run(['node_modules/typescript/bin/tsc', '-p', `${packagePath(scope)}/test/tsconfig.json`], `${scope} type fixtures`);
  }
  if (skipped) throw new Error(`${skipped} required test(s) were skipped.`);
  console.log(`Checks passed: ${[...affected].join(', ')}; ${passed} tests, ${skipped} skipped; build, boundaries and type fixtures.`);
} catch (error) {
  console.error(`Checks failed: ${error.message}`);
  process.exitCode = 1;
}
