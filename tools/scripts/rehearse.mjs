import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { createPlugin } from '@lunaris/cli';

const prefix = path.join(tmpdir(), 'lunaris-rehearsal-');
const parent = await mkdtemp(prefix);
const root = path.join(parent, 'first plugin');
const bin = fileURLToPath(new URL('./bin.js', import.meta.resolve('@lunaris/cli')));
const started = performance.now();
try {
  if (!process.env.npm_execpath) throw new Error('Use npm run rehearse.');
  await createPlugin(root, 'local.first-plugin');
  const commands = [
    [process.env.npm_execpath, 'install', '--ignore-scripts', '--no-audit', '--no-fund', '--offline'],
    [process.env.npm_execpath, 'run', 'build'],
    [process.env.npm_execpath, 'run', 'validate'], [process.env.npm_execpath, 'test'], [process.env.npm_execpath, 'run', 'inspect'], [process.env.npm_execpath, 'run', 'dev', '--', '--once'],
  ];
  for (const args of commands) {
    const result = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8' });
    if (result.status !== 0) throw new Error(result.stdout + result.stderr);
  }
  console.log(`Quickstart passed: ${(performance.now() - started).toFixed(0)} ms; generate, offline install, build, validate, test, inspect, dev/stop. Node ${process.versions.node} ${process.platform}/${process.arch}.`);
} catch (error) {
  console.error(`Quickstart failed: ${error.message}`); process.exitCode = 1;
} finally {
  if (!path.resolve(parent).startsWith(prefix)) throw new Error('Unsafe rehearsal cleanup path.');
  await rm(parent, { recursive: true, force: true });
}
