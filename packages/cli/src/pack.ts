import { lstat, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";
import { inspectLup, LUP_LIMITS, LupError, packLup } from "@lunaris/lup";
import type { InspectedLup, LupEntry } from "@lunaris/lup";
import { validateLocalPlugin } from "@lunaris/development";

export class PackageBuildError extends Error {
  constructor(readonly code: string, message: string, options?: ErrorOptions) { super(message, options); this.name = "PackageBuildError"; }
}

export async function inspectPackage(filename: string): Promise<InspectedLup> {
  const details = await lstat(filename);
  if (!details.isFile() || details.isSymbolicLink() || details.size > LUP_LIMITS.archiveBytes) throw new LupError('LUP_LIMIT', 'Package must be a regular file within the archive size limit.');
  return inspectLup(new Uint8Array(await readFile(filename)), { engineVersion: '0.1.0', sdkVersion: '0.1.0' });
}

/** Bundle without evaluating user code; no project bundler config or plugins are loaded. */
export async function buildPackage(root: string, output?: string): Promise<InspectedLup> {
  const checked = await validateLocalPlugin(root);
  if (!checked.manifest.metadata) throw new PackageBuildError('PACKAGE_METADATA_REQUIRED', 'Add plugin display metadata to manifest.json before packaging.');
  let bundled;
  try {
    bundled = await build({ entryPoints: [checked.entryPath], absWorkingDir: checked.root, bundle: true, platform: 'neutral', format: 'esm', target: 'es2022', write: false, metafile: true, sourcemap: false, legalComments: 'none', logLevel: 'silent', outfile: 'plugin.js' });
  } catch (cause) { throw new PackageBuildError('PACKAGE_BUILD_FAILED', 'Cannot bundle the plugin. Use portable public imports and build the declared entry first.', { cause }); }
  if (bundled.outputFiles.length !== 1 || Object.values(bundled.metafile.outputs).some(item => item.imports.length > 0)) throw new PackageBuildError('PACKAGE_EXTERNAL_IMPORT', 'Package entry must bundle its complete static module graph.');
  const entries: LupEntry[] = [
    { path: 'manifest.json', data: new TextEncoder().encode(JSON.stringify(checked.manifest)) },
    { path: checked.manifest.entry.slice(2), data: bundled.outputFiles[0]!.contents },
  ];
  const assetsRoot = path.join(checked.root, 'assets');
  let assetBytes = 0;
  async function assets(directory: string, relative: string): Promise<void> {
    const details = await lstat(directory);
    if (details.isSymbolicLink()) throw new PackageBuildError('PACKAGE_SYMLINK', 'Package assets may not contain symlinks.');
    const resolved = await realpath(directory);
    const containment = path.relative(checked.root, resolved);
    if (containment.startsWith('..') || path.isAbsolute(containment)) throw new PackageBuildError('PACKAGE_PATH', 'Package asset escapes the project root.');
    if (details.isDirectory()) {
      for (const name of (await readdir(directory)).sort()) await assets(path.join(directory, name), `${relative}/${name}`);
      return;
    }
    if (!details.isFile()) throw new PackageBuildError('PACKAGE_ASSET_KIND', 'Only regular files may be packaged as assets.');
    assetBytes += details.size;
    if (details.size > LUP_LIMITS.fileBytes || assetBytes > LUP_LIMITS.archiveBytes || entries.length >= LUP_LIMITS.entries) throw new LupError('LUP_LIMIT', 'Assets exceed package limits.');
    entries.push({ path: relative, data: new Uint8Array(await readFile(directory)) });
  }
  let hasAssets = true;
  try { await lstat(assetsRoot); }
  catch (error) { if ((error as { code?: string }).code === 'ENOENT') hasAssets = false; else throw error; }
  if (hasAssets) await assets(assetsRoot, 'assets');
  const bytes = packLup(entries, { engineVersion: '0.1.0', sdkVersion: '0.1.0' });
  const preview = inspectLup(bytes);
  const filename = output ?? path.join(checked.root, `${checked.manifest.id}-${checked.manifest.version}.lup`);
  try { await writeFile(filename, bytes, { flag: 'wx' }); }
  catch (cause) { throw new PackageBuildError('PACKAGE_WRITE_FAILED', 'Cannot create output package. Choose an existing output directory and a new filename.', { cause }); }
  return preview;
}
