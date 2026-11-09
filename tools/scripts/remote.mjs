import { spawnSync } from 'node:child_process';
import { checkEnvironment } from './environment.mjs';
import { checkBoundaries, dependencies, packagePath } from './boundaries.mjs';
const tests = [
  'packages/logging/test/contracts.test.mjs',
  'packages/remote/test/contracts.test.mjs', 'packages/filesystem/test/contracts.test.mjs',
  'plugins/systems/filesystem-router/test/router.test.mjs', 'plugins/systems/driver/server-transport/test/transport.test.mjs',
  'plugins/systems/driver/remote-filesystem/test/remote.test.mjs', 'plugins/systems/driver/browser-storage/test/storage.test.mjs',
  'plugins/systems/drafts/test/drafts.test.mjs', 'plugins/systems/account-session/test/account.test.mjs',
  'plugins/systems/client-updates/test/updates.test.mjs', 'plugins/systems/driver/browser-navigation/test/navigation.test.mjs',
  'plugins/systems/driver/tauri-filesystem/test/driver.test.mjs', 'plugins/UI/text-editor/test/session.test.mjs',
  'tools/scripts/remote-integration.test.mjs',
];
function run(args) { const result = spawnSync(process.execPath, args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }); if (result.error || result.status !== 0) throw Error(result.error?.message ?? result.stdout + result.stderr); return result.stdout; }
try {
  checkEnvironment(); run(['node_modules/typescript/bin/tsc', '-b', 'hosts/web', 'hosts/tauri', 'packages/test']);
  await checkBoundaries(Object.keys(dependencies));
  for (const scope of ['remote', 'filesystem', 'logging', 'filesystem-router', 'server-transport', 'remote-filesystem', 'browser-storage', 'drafts-provider', 'account-session', 'account-access', 'client-updates', 'client-update-ui', 'browser-navigation', 'vault-history', 'application-host', 'web']) {
    run(['node_modules/typescript/bin/tsc', '-p', `${packagePath(scope)}/test/tsconfig.json`]);
  }
  const output = run(['--test', '--test-reporter=tap', ...tests]); const count = Number(output.match(/^# pass (\d+)/m)?.[1]);
  if (!count || Number(output.match(/^# skipped (\d+)/m)?.[1])) throw Error('Required remote checks were absent or skipped.');
  process.stdout.write(`Remote checks passed: ${count} tests; shared browser/desktop builds, type fixtures, boundaries, real server and offline recovery.\n`);
} catch (error) { process.stderr.write(`Remote checks failed: ${error.message}\n`); process.exitCode = 1; }
