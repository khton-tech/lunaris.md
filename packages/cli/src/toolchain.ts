import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { versionSatisfies } from "@lunaris/manifest";

export class ToolchainError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = 'ToolchainError'; }
}
interface Artifact { readonly version: string; readonly file: string; readonly sha256: string; readonly kind: 'sdk' | 'tool'; readonly dependencies: Readonly<Record<string, string>> }
interface Toolchain { readonly formatVersion: 1; readonly packages: Readonly<Record<string, Artifact>> }
const directory = fileURLToPath(new URL('./toolchain/', import.meta.url));
export async function toolchain(): Promise<Toolchain> {
  let input: Toolchain;
  try { input = JSON.parse(await readFile(path.join(directory, 'index.json'), 'utf8')) as Toolchain; }
  catch { throw new ToolchainError('TOOLCHAIN_NOT_PREPARED', 'Install a prepared packed toolchain. Maintainers can run npm run toolchain:build.'); }
  if (input.formatVersion !== 1 || !input.packages || typeof input.packages !== 'object') throw new ToolchainError('TOOLCHAIN_INVALID', 'Unsupported toolchain artifact index.');
  return input;
}
export async function vendor(root: string, requested: readonly string[]): Promise<Record<string, string>> {
  const index = await toolchain(); const names = new Set(requested);
  for (const name of names) {
    const entry = index.packages[name];
    if (!entry || typeof entry.version !== 'string' || !/^[a-z0-9.-]+\.tgz$/.test(entry.file) || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw new ToolchainError('CONTRACT_UNAVAILABLE', 'The installed toolchain does not contain this supported package.');
    for (const [dependency, range] of Object.entries(entry.dependencies)) if (dependency.startsWith('@lunaris/')) {
      const provided = index.packages[dependency]; if (!provided || !versionSatisfies(provided.version, range)) throw new ToolchainError('TOOLCHAIN_INCOMPATIBLE', 'Packed SDK dependencies are incompatible.');
      names.add(dependency);
    }
  }
  const destination = path.join(root, 'tools/vendor'); await mkdir(destination, { recursive: true });
  const relative = path.relative(await realpath(root), await realpath(destination));
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new ToolchainError('TOOLCHAIN_PATH', 'Vendored artifacts must stay inside the project.');
  const result: Record<string, string> = {};
  for (const name of [...names].sort()) {
    const entry = index.packages[name]!; const bytes = await readFile(path.join(directory, entry.file));
    if (createHash('sha256').update(bytes).digest('hex') !== entry.sha256) throw new ToolchainError('TOOLCHAIN_INTEGRITY', 'A packed SDK artifact does not match its index.');
    const target = path.join(destination, entry.file);
    try { await writeFile(target, bytes, { flag: 'wx' }); }
    catch (error) {
      if ((error as { code?: string }).code !== 'EEXIST') throw error;
      if (createHash('sha256').update(await readFile(target)).digest('hex') !== entry.sha256) throw new ToolchainError('TOOLCHAIN_CONFLICT', 'Existing vendored SDK bytes conflict; nothing was overwritten.');
    }
    result[name] = `file:./tools/vendor/${entry.file}`;
  }
  return result;
}
export async function authoringGuide(): Promise<string> { return await readFile(path.join(directory, 'authoring.md'), 'utf8'); }
export async function addContract(name: string, root: string): Promise<void> {
  const index = await toolchain(); if (index.packages[name]?.kind !== 'sdk') throw new ToolchainError('CONTRACT_UNAVAILABLE', 'Choose a public SDK package listed by contracts.');
  const filename = path.join(path.resolve(root), 'package.json'); const pkg = JSON.parse(await readFile(filename, 'utf8')) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string>; overrides?: Record<string, unknown> };
  const artifacts = await vendor(path.resolve(root), [name]); pkg.dependencies ??= {}; pkg.overrides ??= {};
  for (const [dependency, spec] of Object.entries(artifacts)) {
    const existing = pkg.dependencies[dependency] ?? pkg.devDependencies?.[dependency];
    if (existing && existing !== spec) throw new ToolchainError('CONTRACT_DEPENDENCY_CONFLICT', 'Existing dependency differs from this toolchain; resolve its version explicitly.');
    if (!existing) pkg.dependencies[dependency] = spec;
    pkg.overrides[dependency] = `$${dependency}`;
  }
  await writeFile(filename, JSON.stringify(pkg, null, 2) + '\n');
}
