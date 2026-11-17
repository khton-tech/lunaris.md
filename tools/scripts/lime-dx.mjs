import { copyFile, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { command, npmCliPath, prepareEmbeddedToolchain } from './plugin-toolchain.mjs';

const prefix = path.join(tmpdir(), 'lunaris-external-dx-');
const root = await mkdtemp(prefix);
try {
  const npm = await npmCliPath();
  const archivePath = process.argv[2];
  let toolchain = root;
  if (archivePath?.toLowerCase().endsWith('.7z')) {
    execFileSync('7z', ['x', '-bso0', '-bsp0', `-o${root}`, '--', path.resolve(archivePath)], { windowsHide: true });
    const entries = await readdir(root, { withFileTypes: true });
    assert.ok(entries.length === 1 && entries[0].isDirectory(), 'Expected a single toolchain directory in the archive');
    toolchain = path.join(root, entries[0].name);
  } else if (archivePath) {
    execFileSync('tar', ['-xzf', path.resolve(archivePath), '--strip-components', '1', '-C', root], { windowsHide: true });
  } else {
    await prepareEmbeddedToolchain({ output: root });
  }
  if (archivePath) await readFile(path.join(toolchain, 'DOCS/reference/sdk.md'), 'utf8');
  await command([npm, archivePath ? 'ci' : 'install', '--ignore-scripts', '--no-audit', '--no-fund', '--offline'], toolchain);
  const cli = path.join(toolchain, 'node_modules/@lunaris/cli/dist/bin.js');
  const project = path.join(toolchain, 'projects/independent-plugin');
  await command([npm, 'exec', '--', 'lunaris-core', 'create-plugin', project, '--id', 'author.independent'], toolchain);
  const catalog = JSON.parse(await command([cli, 'contracts'], project));
  assert.ok(catalog.packages.some(item => item.name === '@lunaris/components'));
  assert.ok(!catalog.packages.some(item => item.name === '@lunaris/kernel'));
  await command([cli, 'add-contract', '@lunaris/components'], project);
  await command([cli, 'add-contract', '@lunaris/active-screen'], project);
  await command([cli, 'add-contract', '@lunaris/workspace'], project);
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

  const recipes = await readFile(path.join(project, 'DOCS/plugin-recipes.md'), 'utf8');
  const snippet = language => {
    const match = recipes.match(new RegExp('```' + language + '\\r?\\n([\\s\\S]+?)\\r?\\n```'));
    assert.ok(match, `Missing ${language} recipe`);
    return match[1];
  };
  const recipeManifest = JSON.parse(snippet('json'));
  for (const name of ['config', 'localization', 'settings', 'vault']) {
    await command([cli, 'add-contract', '@lunaris/' + name], project);
  }
  await command([npm, 'install', '--ignore-scripts', '--no-audit', '--no-fund', '--offline'], project);
  const filename = path.join(project, 'manifest.json');
  const manifest = JSON.parse(await readFile(filename, 'utf8'));
  await writeFile(filename, JSON.stringify({ ...manifest, ...recipeManifest }, null, 2) + '\n');
  await writeFile(path.join(project, 'src/plugin.ts'), snippet('ts'));
  await command([npm, 'run', 'check'], project);
  const recipeArchive = path.join(project, 'counter.lup');
  await command([cli, 'pack', project, recipeArchive], project);
  const counter = JSON.parse(await command([cli, 'inspect-package', recipeArchive], project));
  assert.deepEqual(counter.manifest.requires, recipeManifest.requires);

  const compositionManifest = {
    ...manifest,
    provides: [{ kind: 'api', id: 'lunaris.workspace-layout', version: '1.0.0' }],
    requires: [
      ...manifest.requires,
      { kind: 'api', id: 'lunaris.views', range: '^1.0.0' },
      { kind: 'api', id: 'lunaris.view-surfaces', range: '^1.0.0' },
    ],
    permissions: ['ui.dom'],
  };
  await writeFile(filename, JSON.stringify(compositionManifest, null, 2) + '\n');
  await writeFile(path.join(project, 'src/plugin.ts'), `
import { definePlugin } from "@lunaris/sdk";
import { Logger } from "@lunaris/logging";
import { Views, ViewSurfaces } from "@lunaris/components";
import { WorkspaceLayout } from "@lunaris/workspace";
import manifest from "../manifest.json" with { type: "json" };

export default definePlugin({ manifest, activate(ctx) {
  const logger = ctx.use(Logger);
  ctx.provide(WorkspaceLayout, {
    describe: () => ({ kind: "region", region: "main" }),
    watch() {},
  });
  const id = ctx.pluginId + ".view";
  const view = ctx.use(Views).register({ id, render: () => ({ kind: "text", text: "SDK archive check" }) }, ctx.signal);
  if (!view.ok) throw new Error(view.error.message);
  const surface = ctx.use(ViewSurfaces).mount(id, ctx.pluginId + ".surface", {}, ctx.signal);
  if (!surface.ok) throw new Error(surface.error.message);
  logger.info(ctx.pluginId, "SDK archive check ready");
} });
`);
  await command([npm, 'run', 'check'], project);
  const compositionArchive = path.join(project, 'composition.lup');
  await command([cli, 'pack', project, compositionArchive], project);
  const composition = JSON.parse(await command([cli, 'inspect-package', compositionArchive], project));
  assert.deepEqual(composition.manifest.provides, compositionManifest.provides);
  assert.deepEqual(composition.manifest.requires, compositionManifest.requires);
  if (archivePath?.toLowerCase().endsWith('.7z')) {
    for (const doc of ['DOCS/quickstart/first-plugin.md', 'DOCS/reference/application-dom.md', 'DOCS/reference/native-processes.md']) {
      assert.ok((await readFile(path.join(toolchain, doc), 'utf8')).startsWith('# '), doc);
    }
    const drema = path.join(toolchain, 'examples/drema');
    const hotkey = path.join(toolchain, 'examples/global-hotkey');
    await copyFile(path.join(drema, 'manifest.json'), filename);
    await copyFile(path.join(drema, 'src/plugin.ts'), path.join(project, 'src/plugin.ts'));
    await mkdir(path.join(project, 'assets'));
    await copyFile(path.join(drema, 'assets/drema.svg'), path.join(project, 'assets/drema.svg'));
    await command([npm, 'run', 'check'], project);
    const dremaPackage = path.join(project, 'drema.lup');
    await command([cli, 'pack', project, dremaPackage], project);
    const installedDrema = JSON.parse(await command([cli, 'inspect-package', dremaPackage], project));
    assert.equal(installedDrema.pluginId, 'example.drema');
    assert.ok(installedDrema.paths.includes('assets/drema.svg'));

    await command([cli, 'add-contract', '@lunaris/execution'], project);
    await command([npm, 'install', '--ignore-scripts', '--no-audit', '--no-fund', '--offline'], project);
    await copyFile(path.join(hotkey, 'manifest.json'), filename);
    await copyFile(path.join(hotkey, 'plugin.ts'), path.join(project, 'src/plugin.ts'));
    await copyFile(path.join(hotkey, 'contract.ts'), path.join(project, 'src/contract.ts'));
    await command([npm, 'run', 'check'], project);
    for (const file of ['native/Cargo.toml', 'native/Cargo.lock', 'native/src/main.rs']) {
      assert.ok((await readFile(path.join(hotkey, file))).byteLength > 0, file);
    }
  }
  process.stdout.write('External DX passed: packed SDK installation, generation, dev cleanup, counter and composition recipes.' +
    (archivePath?.toLowerCase().endsWith('.7z') ? ' Bundled Drema packaged and Global Hotkey TypeScript checked.\n' : '\n'));
} catch (error) {
  process.stderr.write(`External DX failed: ${error.message}\n`); process.exitCode = 1;
} finally {
  if (!path.resolve(root).startsWith(prefix)) throw Error('Unsafe external rehearsal cleanup path.');
  await rm(root, { recursive: true, force: true });
}
