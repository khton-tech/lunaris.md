import { access, copyFile, cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { packagePath } from './boundaries.mjs';

const workspace = fileURLToPath(new URL('../../', import.meta.url));
export async function npmCliPath() {
  for (const candidate of [process.env.npm_execpath, path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'), path.resolve(path.dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js')]) {
    if (!candidate) continue;
    try { await access(candidate); return candidate; } catch { /* Try the next standard installation layout. */ }
  }
  throw Error('Run this tool through npm so its supported npm CLI is available.');
}
export async function command(args, cwd = workspace, env = process.env) {
  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = ''; child.stdout.on('data', data => { output += data; }); child.stderr.on('data', data => { output += data; });
    child.once('error', reject); child.once('close', code => code === 0 ? resolve(output) : reject(Error(`Toolchain command failed (${code}): ${output.slice(-12000)}`)));
  });
}

export async function packWorkspace(npm, sourceDirectory, destination) {
  const metadata = JSON.parse(await readFile(path.join(sourceDirectory, 'package.json'), 'utf8'));
  const prefix = path.join(tmpdir(), 'lunaris-packed-sdk-'); const stage = await mkdtemp(prefix);
  try {
    await cp(path.join(sourceDirectory, 'dist'), path.join(stage, 'dist'), { recursive: true });
    await writeFile(path.join(stage, 'package.json'), JSON.stringify({ ...metadata, files: ['dist'] }));
    const result = JSON.parse(await command([npm, 'pack', stage, '--ignore-scripts', '--json', '--pack-destination', destination]));
    const file = result[0].filename; const bytes = await readFile(path.join(destination, file));
    return { name: metadata.name, version: metadata.version, file, sha256: createHash('sha256').update(bytes).digest('hex'), dependencies: metadata.dependencies ?? {} };
  } finally {
    if (!path.resolve(stage).startsWith(prefix)) throw Error('Unsafe toolchain staging cleanup path.');
    await rm(stage, { recursive: true, force: true });
  }
}

/** Local packed distribution only. No registry publication or source-directory links. */
export async function prepareEmbeddedToolchain({ build = true, output } = {}) {
  const npm = await npmCliPath();
  const scopes = (await readdir(path.join(workspace, 'packages'), { withFileTypes: true })).filter(entry => entry.isDirectory() && entry.name !== 'cli').map(entry => entry.name).sort();
  const roots = [...scopes.map(scope => path.join('packages', scope)), packagePath('logger'), packagePath('quickjs-execution'), packagePath('development')];
  await command(['node_modules/typescript/bin/tsc', '-b', ...(build ? ['packages/cli'] : []), ...roots]);
  const embedded = path.join(workspace, 'packages/cli/dist/toolchain'); await mkdir(embedded, { recursive: true });
  const index = { formatVersion: 1, packages: {} };
  for (const root of roots) {
    const { name, ...archive } = await packWorkspace(npm, path.join(workspace, root), embedded);
    const tool = ['kernel', 'test', 'lup', 'execution', 'lime', 'logger', 'quickjs-execution', 'development'].includes(name.slice('@lunaris/'.length));
    index.packages[name] = { ...archive, kind: tool ? 'tool' : 'sdk' };
  }
  await writeFile(path.join(embedded, 'index.json'), JSON.stringify(index, null, 2) + '\n');
  await copyFile(path.join(workspace, 'DOCS/guides/plugin-authoring.md'), path.join(embedded, 'authoring.md'));
  await copyFile(path.join(workspace, 'DOCS/guides/plugin-recipes.md'), path.join(embedded, 'plugin-recipes.md'));
  if (output) {
    const destination = path.resolve(output); const artifacts = path.join(destination, 'packages'); await mkdir(artifacts, { recursive: true });
    for (const entry of Object.values(index.packages)) await copyFile(path.join(embedded, entry.file), path.join(artifacts, entry.file));
    const { name, ...cli } = await packWorkspace(npm, path.join(workspace, 'packages/cli'), artifacts);
    const all = { ...index.packages, [name]: cli };
    const dependencies = Object.fromEntries(Object.entries(all).map(([name, entry]) => [name, `file:./packages/${entry.file}`]));
    const overrides = Object.fromEntries(Object.keys(all).map(name => [name, `$${name}`]));
    await writeFile(path.join(destination, 'package.json'), JSON.stringify({ name: 'lunaris-plugin-toolchain', version: '0.1.0', private: true, dependencies, overrides, engines: { node: '>=26.13.0 <27', npm: '>=11 <12' } }, null, 2) + '\n');
    await writeFile(path.join(destination, 'README.md'), '# Local Lunaris plugin toolchain\n\nThis directory is a packed distribution, not a source checkout.\n\nRun `npm install --ignore-scripts`, then `npm exec -- lunaris-core create-plugin ./projects/my-plugin --id author.my-plugin`. In the generated directory run `npm install --ignore-scripts`, `npm run check`, `npm test` and `npm run pack`. The parent toolchain supplies the CLI. See the generated DOCS/authoring.md and AGENTS.md. No package is published by preparing this directory.\n');
  }
  return { packages: Object.keys(index.packages).length, embedded, ...(output ? { output: path.resolve(output) } : {}) };
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  try {
    const output = process.argv.includes('--embedded-only') ? undefined : process.argv[2] ?? path.join(workspace, 'dist/lime-toolchain');
    const result = await prepareEmbeddedToolchain({ output });
    process.stdout.write(`Toolchain ready: ${result.packages} packed dependencies; ${output ? 'standalone local distribution' : 'embedded SDK artifacts'}; no publication.\n`);
  } catch (error) { process.stderr.write(`Toolchain failed: ${error.message}\n`); process.exitCode = 1; }
}
