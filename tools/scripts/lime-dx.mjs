import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import { command, npmCliPath, prepareEmbeddedToolchain } from './plugin-toolchain.mjs';

const prefix = path.join(tmpdir(), 'lunaris-external-dx-');
const root = await mkdtemp(prefix);
try {
  const npm = await npmCliPath();
  await prepareEmbeddedToolchain({ output: root });
  await command([npm, 'install', '--ignore-scripts', '--no-audit', '--no-fund', '--offline'], root);
  const cli = path.join(root, 'node_modules/@lunaris/cli/dist/bin.js');
  const project = path.join(root, 'projects/independent-plugin');
  await command([cli, 'create-plugin', project, '--id', 'author.independent'], root);
  const catalog = JSON.parse(await command([cli, 'contracts'], project));
  assert.ok(catalog.packages.some(item => item.name === '@lunaris/components'));
  assert.ok(!catalog.packages.some(item => item.name === '@lunaris/kernel'));
  await command([cli, 'add-contract', '@lunaris/components'], project);
  await command([cli, 'add-contract', '@lunaris/active-screen'], project);
  await command([npm, 'install', '--ignore-scripts', '--no-audit', '--no-fund', '--offline'], project);
  const pkg = JSON.parse(await readFile(path.join(project, 'package.json'), 'utf8'));
  for (const [name, spec] of Object.entries({ ...pkg.dependencies, ...pkg.devDependencies })) {
    if (!name.startsWith('@lunaris/')) continue;
    assert.ok(spec.startsWith('file:./tools/vendor/'));
    const installed = await realpath(path.join(project, 'node_modules', name));
    assert.ok(installed.startsWith(project + path.sep), `${name} escaped the independent project`);
  }
  for (const task of ['check', 'test', 'pack']) await command([npm, 'run', task], project);
  const archive = path.join(project, 'author.independent-0.1.0.lup');
  const inspection = JSON.parse(await command([cli, 'inspect-package', archive], project));
  assert.equal(inspection.pluginId, 'author.independent');
  assert.ok((await command([cli, 'dev', project, '--once'], project)).includes('DEV_STOPPED'));
  const isolated = await command([cli, 'dev', project, '--live', '--once'], project);
  assert.ok(isolated.includes('"mode":"isolated"') && isolated.includes('DEV_STOPPED'));
  process.stdout.write('External DX passed: packed installation, generation, contract discovery/addition, independent SDK copies, build, validation, tests, LUP inspection and dev cleanup; no publication.\n');
} catch (error) {
  process.stderr.write(`External DX failed: ${error.message}\n`); process.exitCode = 1;
} finally {
  if (!path.resolve(root).startsWith(prefix)) throw Error('Unsafe external rehearsal cleanup path.');
  await rm(root, { recursive: true, force: true });
}
