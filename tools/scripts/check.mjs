import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { checkEnvironment } from './environment.mjs';
import { checkBoundaries, dependencies } from './boundaries.mjs';

function run(args, label) {
  const result = spawnSync(process.execPath, args, { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  if (result.error || result.status !== 0) {
    throw new Error(`${label}: ${result.error?.message ?? result.stdout + result.stderr}`);
  }
}

try {
  checkEnvironment();
  const requested = process.argv.slice(2);
  if (!requested.length) throw new Error('Provide package scope(s): manifest, sdk, kernel.');
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
  run(['node_modules/typescript/bin/tsc', '-b', ...[...affected].map(scope => `packages/${scope}`)], 'Build');
  await checkBoundaries(Object.keys(dependencies));
  run(['--test', '--test-reporter=dot', 'tools/scripts/boundaries.test.mjs'], 'Boundary checker tests');
  for (const scope of affected) {
    const tests = readdirSync(`packages/${scope}/test`).filter(name => name.endsWith('.test.mjs'));
    run(['--test', '--test-reporter=dot', ...tests.map(name => `packages/${scope}/test/${name}`)], `${scope} tests`);
    run(['node_modules/typescript/bin/tsc', '-p', `packages/${scope}/test/tsconfig.json`], `${scope} type fixtures`);
  }
  console.log(`Checks passed: ${[...affected].join(', ')}; build, boundaries, tests and type fixtures.`);
} catch (error) {
  console.error(`Checks failed: ${error.message}`);
  process.exitCode = 1;
}
