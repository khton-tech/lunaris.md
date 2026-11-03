import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { createPlugin, run } from '@lunaris/cli';

const prefix = path.join(tmpdir(), 'lunaris-cli-');
const bin = fileURLToPath(new URL('./bin.js', import.meta.resolve('@lunaris/cli')));
async function directory(t) {
  const root = await mkdtemp(prefix);
  t.after(async () => { assert.ok(path.resolve(root).startsWith(prefix)); await rm(root, { recursive: true, force: true }); });
  return root;
}
function command(args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = ''; child.stdout.on('data', data => { output += data; }); child.stderr.on('data', data => { output += data; });
    child.once('error', reject); child.once('close', code => resolve({ code, output }));
  });
}
async function success(args, cwd) { const result = await command(args, cwd); assert.equal(result.code, 0, result.output); return result.output; }

test('generated TypeScript plugin installs offline, builds, validates, inspects, tests and shuts down dev', { timeout: 30000 }, async t => {
  const parent = await directory(t); const root = path.join(parent, 'generated plugin'); const started = performance.now();
  await success([bin, 'create-plugin', root, '--id', 'test.generated'], parent); assert.ok(process.env.npm_execpath, 'Run through npm run check -- cli.');
  await success([process.env.npm_execpath, 'install', '--ignore-scripts', '--no-audit', '--no-fund', '--offline'], root);
  await success([process.env.npm_execpath, 'run', 'build'], root);
  assert.ok((await success([bin, 'validate', root], root)).includes('VALIDATED'));
  const view = JSON.parse((await success([bin, 'inspect', root], root)).trim());
  assert.equal(view.plugins[0].state, 'active'); assert.deepEqual(view.plugins[0].effectivePermissions, []);
  await success([process.env.npm_execpath, 'test'], root);
  assert.ok((await success([bin, 'dev', root, '--once'], root)).includes('DEV_STOPPED'));
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [bin, 'dev', root], { stdio: ['pipe', 'pipe', 'pipe'], signal: t.signal });
    let output = ''; let sent = false;
    child.stdout.on('data', data => { output += data; if (!sent && output.includes('DEV_READY')) { sent = true; child.stdin.end('stop\n'); } });
    child.stderr.on('data', data => { output += data; }); child.once('error', reject); child.once('close', code => resolve({ code, output }));
  });
  assert.equal(result.code, 0, result.output); assert.ok(result.output.includes('DEV_STOPPED'));
  const stopped = JSON.parse(result.output.trim().split('\n').at(-1));
  assert.equal(stopped.snapshot.plugins[0].ownedResources, 0);
  assert.equal(stopped.snapshot.plugins[0].state, 'stopped');
  t.diagnostic(`Quickstart rehearsal: ${(performance.now() - started).toFixed(0)} ms (dependencies cached, offline local links).`);
});

test('generator refuses existing work and invalid CLI commands return nonzero', async t => {
  const parent = await directory(t); const target = path.join(parent, 'plugin'); await createPlugin(target);
  const before = await readFile(path.join(target, 'manifest.json'), 'utf8');
  await assert.rejects(createPlugin(target), { code: 'TARGET_EXISTS' }); assert.equal(await readFile(path.join(target, 'manifest.json'), 'utf8'), before);
  const messages = []; const io = { out: line => messages.push(line), error: line => messages.push(line) };
  assert.equal(await run(['unknown'], io), 1); assert.equal(await run(['--help'], io), 0);
  assert.equal(await run(['dev', '--unknown'], io), 1);
});

test('CLI validation never evaluates an invalid entry and test failures return exit code 1', async t => {
  const parent = await directory(t); const root = path.join(parent, 'plugin'); await createPlugin(root);
  const manifestPath = path.join(root, 'manifest.json'); const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.engine = '^9.0.0'; await writeFile(manifestPath, JSON.stringify(manifest));
  const invalid = await command([bin, 'validate', root], root); assert.equal(invalid.code, 1); assert.ok(invalid.output.includes('VERSION_INCOMPATIBLE'));
  manifest.engine = '^0.1.0'; manifest.entry = './test/fail.mjs'; await writeFile(manifestPath, JSON.stringify(manifest));
  await writeFile(path.join(root, 'test/fail.mjs'), 'throw new Error("entry must not be evaluated by validate");');
  await writeFile(path.join(root, 'test/plugin.test.mjs'), 'throw new Error("deliberate test failure");');
  await success([bin, 'validate', root], root);
  const failed = await command([bin, 'test', root], root);
  assert.equal(failed.code, 1, failed.output);
});
