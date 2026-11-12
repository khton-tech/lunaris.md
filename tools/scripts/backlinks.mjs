import { spawnSync } from 'node:child_process';
import { checkEnvironment } from './environment.mjs';
import { checkBoundaries, dependencies } from './boundaries.mjs';

function run(args, label) {
  const result = spawnSync(process.execPath, args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(`${label}: ${result.error?.message ?? result.stdout + result.stderr}`);
  return result.stdout;
}
try {
  checkEnvironment();
  run(['node_modules/typescript/bin/tsc', '-b', 'hosts/application', 'hosts/tauri', 'packages/test'], 'Build');
  await checkBoundaries(Object.keys(dependencies));
  for (const path of ['packages/backlinks', 'plugins/systems/backlink-index', 'plugins/UI/backlinks', 'packages/active-document', 'packages/editor'])
    run(['node_modules/typescript/bin/tsc', '-p', path + '/test/tsconfig.json'], 'Type fixtures');
  const output = run(['--test', '--test-reporter=tap',
    'plugins/systems/backlink-index/test/markdown.test.mjs', 'plugins/systems/backlink-index/test/index.test.mjs',
    'plugins/UI/backlinks/test/filter.test.mjs', 'plugins/UI/text-editor/test/document-content.test.mjs',
    'plugins/UI/text-editor/test/integration.test.mjs', 'plugins/UI/mantine-components/test/components.test.mjs',
    'hosts/application/test/product-startup.test.mjs', 'hosts/application/test/preparation.test.mjs',
  ], 'Backlinks tests');
  const passed = Number(output.match(/^# pass (\d+)$/m)?.[1] ?? 0);
  if (Number(output.match(/^# skipped (\d+)$/m)?.[1] ?? 0)) throw new Error('Required tests were skipped.');
  console.log(`Backlinks checks passed: ${passed} tests; build, public contract fixtures and dependency boundaries.`);
} catch (error) {
  console.error(`Backlinks checks failed: ${error.message}`); process.exitCode = 1;
}
