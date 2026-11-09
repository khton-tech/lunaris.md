import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkEnvironment } from './environment.mjs';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export function serverDirectory() {
  return path.resolve(process.env.LUNARIS_SERVER_DIRECTORY ?? path.join(repository, '../lunaris-server'));
}
export function hasServer(directory = serverDirectory()) { return fs.existsSync(path.join(directory, 'src/application.mjs')); }

function run(args, cwd, label) {
  const result = spawnSync(process.execPath, args, { cwd, encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw Error(`${label}: ${result.error?.message ?? result.stdout + result.stderr}`);
  return result.stdout.trim();
}

export function checkServer() {
  checkEnvironment(); const server = serverDirectory();
  if (!hasServer(server)) throw Error('The sibling lunaris-server checkout is required. Set LUNARIS_SERVER_DIRECTORY for another location. No remote is required.');
  const remote = run(['tools/scripts/remote.mjs'], repository, 'Client/server integration');
  const backend = run(['tools/scripts/check.mjs'], server, 'Server checks');
  const development = run(['--test', '--test-reporter=tap', 'tools/scripts/server-dev.test.mjs', 'tools/scripts/server-dev.integration.test.mjs'], repository, 'Automatic development synchronization');
  if (!/^# pass 3$/m.test(development) || !/^# skipped 0$/m.test(development)) throw Error('Required development synchronization tests were absent or skipped.');
  process.stdout.write(`${remote}\n${backend}\nLocal server gate passed: automatic compilation/restart, preserved sessions/notes and config reload (3 tests).\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { checkServer(); }
  catch (error) { process.stderr.write(`Local server gate failed: ${error.message}\n`); process.exitCode = 1; }
}
