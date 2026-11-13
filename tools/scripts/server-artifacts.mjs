import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { checkEnvironment } from './environment.mjs';
import { command, npmCliPath, packWorkspace } from './plugin-toolchain.mjs';

const repository = fileURLToPath(new URL('../../', import.meta.url));
const runtimeRoots = [
  'packages/manifest', 'packages/sdk', 'packages/kernel', 'packages/logging',
  'plugins/systems/logger', 'packages/filesystem', 'packages/vault', 'packages/remote',
];
const defaultFeatures = ['editor', 'files', 'settings'];
const exec = promisify(execFile);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';

function parseArgs(args) {
  const [output, option, selection, ...rest] = args;
  if (!output || output.startsWith('-') || (args.length !== 1 &&
      (option !== '--features' || !selection || rest.length))) {
    throw Error('Usage: npm run server:artifacts -- OUTPUT_DIRECTORY [--features editor,files,settings]');
  }
  const features = selection?.split(',') ?? defaultFeatures;
  if (!features.includes('files') || features.some(feature => !defaultFeatures.includes(feature)) ||
      new Set(features).size !== features.length) {
    throw Error('Select distinct features from editor, files and settings. The files feature is required.');
  }
  return { output: path.resolve(output), features };
}

async function git(cwd, ...args) {
  const { stdout } = await exec('git', args, { cwd, windowsHide: true });
  return stdout.trim();
}

async function assertAbsent(output) {
  try {
    await lstat(output);
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  throw Error(`The output directory already exists: ${output}`);
}

async function withTemporaryDirectory(parent, prefix, operation) {
  const directory = await mkdtemp(path.join(parent, prefix));
  if (path.dirname(path.resolve(directory)) !== parent || !path.basename(directory).startsWith(prefix)) {
    throw Error('Unexpected staging directory path.');
  }
  try {
    return await operation(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function buildRuntime(npm, source, runtime, lockfile, verification) {
  const packages = path.join(runtime, 'packages');
  await mkdir(packages, { recursive: true });
  await command(['node_modules/typescript/bin/tsc', '-b', ...runtimeRoots], source);
  const archives = new Map();
  for (const root of runtimeRoots) {
    const archive = await packWorkspace(npm, path.join(source, root), packages);
    archives.set(archive.name, archive);
  }

  const semver = lockfile.packages['node_modules/semver'];
  const [vendor] = JSON.parse(await command([
    npm, 'pack', semver.resolved, '--ignore-scripts', '--offline', '--json', '--pack-destination', packages,
  ], source));
  if (vendor.name !== 'semver' || vendor.version !== semver.version || vendor.integrity !== semver.integrity) {
    throw Error('The semver archive does not match the client lockfile.');
  }
  archives.set(vendor.name, { version: vendor.version, file: vendor.filename, dependencies: {} });
  for (const [name, archive] of archives) {
    for (const [dependency, version] of Object.entries(archive.dependencies)) {
      if (archives.get(dependency)?.version !== version) throw Error(`Missing runtime archive for ${name}: ${dependency}@${version}`);
    }
  }

  const dependencies = Object.fromEntries([...archives].map(([name, archive]) => [name, `file:packages/${archive.file}`]));
  const overrides = Object.fromEntries([...archives.keys()].map(name => [name, `$${name}`]));
  const { version, engines } = JSON.parse(await readFile(path.join(source, 'package.json'), 'utf8'));
  await writeFile(path.join(runtime, 'package.json'), json({ name: 'lunaris-server-runtime', version, private: true, engines, dependencies, overrides }));
  await command([npm, 'install', '--package-lock-only', '--ignore-scripts', '--offline', '--no-audit', '--no-fund'], runtime);

  await cp(runtime, verification, { recursive: true });
  await command([npm, 'ci', '--ignore-scripts', '--offline', '--no-audit', '--no-fund', '--cache', path.join(verification, '.cache')], verification);
  const imports = JSON.stringify([...archives.keys()]);
  const protocol = Number(await command(['--input-type=module', '--eval', `
    await Promise.all(${imports}.map(name => import(name)));
    console.log((await import('@lunaris/remote')).REMOTE_PROTOCOL);
  `], verification));
  if (!Number.isSafeInteger(protocol) || protocol < 1) throw Error('Invalid remote protocol exported by the installed runtime.');
  return protocol;
}

async function assetHashes(directory, prefix = '') {
  const hashes = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    const relative = prefix + entry.name;
    if (entry.isDirectory()) hashes.push(...await assetHashes(filename, relative + '/'));
    else if (entry.isFile()) hashes.push([relative, sha256(await readFile(filename))]);
    else throw Error(`Expected a regular web asset: ${relative}`);
  }
  return hashes;
}

async function buildWeb(npm, source, web, metadata) {
  const { buildId, features } = metadata;
  await command([npm, 'run', 'build', '--workspace', '@lunaris/web', '--', '--outDir', web], source, {
    ...process.env, LUNARIS_BUILD_ID: buildId, LUNARIS_FEATURES: JSON.stringify(features),
  });
  const files = Object.fromEntries(await assetHashes(web));
  const index = await readFile(path.join(web, 'index.html'), 'utf8');
  if (!index.includes(`/bundles/${buildId}/`) || Object.hasOwn(files, 'manifest.json')) {
    throw Error('The browser build did not produce a versioned web bundle.');
  }
  await writeFile(path.join(web, 'manifest.json'), json({ ...metadata, createdAt: new Date().toISOString(), files }), { flag: 'wx' });
  return Object.keys(files).length;
}

async function produce({ output, features }) {
  checkEnvironment();
  await assertAbsent(output);
  if (await git(repository, 'status', '--porcelain=v1', '--untracked-files=all')) {
    throw Error('Commit client changes before producing release artifacts. A clean checkout is required.');
  }
  const sourceRevision = await git(repository, 'rev-parse', '--verify', 'HEAD^{commit}');
  const npm = await npmCliPath();
  await mkdir(path.dirname(output), { recursive: true });
  const parent = await realpath(path.dirname(output));
  const destination = path.join(parent, path.basename(output));
  const buildId = randomUUID();

  return await withTemporaryDirectory(await realpath(tmpdir()), 'lunaris-release-source-', async temporary => {
    const source = path.join(temporary, 'source');
    await git(repository, 'clone', '--quiet', '--shared', '--no-checkout', '--', repository, source);
    await git(source, 'checkout', '--quiet', '--detach', sourceRevision);
    await command([npm, 'ci', '--ignore-scripts', '--no-audit', '--no-fund'], source);
    const lockfile = await readFile(path.join(source, 'package-lock.json'));
    return await withTemporaryDirectory(parent, '.lunaris-release-', async staging => {
      const artifact = path.join(staging, 'artifact');
      const protocol = await buildRuntime(npm, source, path.join(artifact, 'runtime'), JSON.parse(lockfile), path.join(temporary, 'verify-runtime'));
      const assets = await buildWeb(npm, source, path.join(artifact, 'web'), { protocol, buildId, sourceRevision, lockfileHash: sha256(lockfile), features });
      await assertAbsent(destination);
      await rename(artifact, destination);
      return { destination, buildId, assets, sourceRevision };
    });
  });
}

try {
  const { destination, buildId, assets, sourceRevision } = await produce(parseArgs(process.argv.slice(2)));
  process.stdout.write(`Server artifacts ready at ${destination}. Web bundle ${buildId}, ${assets} files, source ${sourceRevision}.\n`);
} catch (error) {
  process.stderr.write(`Server artifact build failed: ${error.message}\n`);
  process.exitCode = 1;
}
