import type { FilesystemApi } from "@lunaris/filesystem";
import { isExactVersion, isValidId } from "@lunaris/manifest";
import { inspectLup } from "@lunaris/lup";
import type { InspectedLup } from "@lunaris/lup";

export interface InstallationRecord {
  readonly id: string; readonly version: string; readonly digest: string;
  readonly enabled: boolean; readonly recoveryRequired: boolean;
  readonly removing?: { readonly deleteData: boolean };
}
interface Registry { readonly formatVersion: 1; readonly revision: number; readonly plugins: readonly InstallationRecord[] }
const ROOT = '.lunaris/plugins';
const versions = { engineVersion: '0.1.0', sdkVersion: '0.1.0' };

/** One captured root, immutable archives and one optimistic committed registry. */
export function createStorage(fs: FilesystemApi, vaultId: string) {
  let version: string | null = null; let revision = 0;
  const target = (path: string) => ({ vaultId, path });
  return {
    async read(): Promise<readonly InstallationRecord[]> {
      const result = await fs.readText(target(`${ROOT}/registry.json`));
      if (!result.ok) { if (result.error.code === 'NOT_FOUND') { version = null; revision = 0; return []; } throw new Error('Cannot read plugin installation registry.', { cause: result.error }); }
      if (result.value.text.length > 256 * 1024) throw new Error('Plugin registry exceeds its size limit.');
      const input = JSON.parse(result.value.text) as Partial<Registry>;
      if (!input || typeof input !== 'object' || Object.keys(input).some(key => !['formatVersion', 'revision', 'plugins'].includes(key)) || input.formatVersion !== 1 || !Number.isSafeInteger(input.revision) || input.revision! < 0 || !Array.isArray(input.plugins) || input.plugins.length > 256) throw new Error('Malformed plugin registry.');
      const seen = new Set<string>(); const records: InstallationRecord[] = [];
      for (const item of input.plugins) {
        if (!item || typeof item !== 'object' || Object.keys(item).some(key => !['id', 'version', 'digest', 'enabled', 'recoveryRequired', 'removing'].includes(key)) || !isValidId(item.id) || seen.has(item.id) || !isExactVersion(item.version) || typeof item.digest !== 'string' || !/^[a-f0-9]{64}$/.test(item.digest) || typeof item.enabled !== 'boolean' || typeof item.recoveryRequired !== 'boolean') throw new Error('Malformed plugin installation record.');
        if (item.removing !== undefined && (!item.removing || typeof item.removing !== 'object' || Object.keys(item.removing).length !== 1 || typeof item.removing.deleteData !== 'boolean' || item.enabled || !item.recoveryRequired)) throw new Error('Malformed plugin removal journal.');
        seen.add(item.id); records.push(Object.freeze({ ...item }));
      }
      version = result.value.version; revision = input.revision!;
      return Object.freeze(records);
    },
    async save(records: readonly InstallationRecord[]): Promise<void> {
      if (records.length > 256 || revision >= Number.MAX_SAFE_INTEGER) throw new Error('Plugin registry limit reached.');
      const directory = await fs.createDirectory(target(ROOT), true);
      if (!directory.ok && directory.error.code !== 'ALREADY_EXISTS') throw new Error('Cannot create plugin storage.', { cause: directory.error });
      const next: Registry = { formatVersion: 1, revision: revision + 1, plugins: [...records].sort((a, b) => a.id < b.id ? -1 : 1) };
      const text = JSON.stringify(next); if (text.length > 256 * 1024) throw new Error('Plugin registry exceeds its size limit.');
      const result = await fs.writeText(target(`${ROOT}/registry.json`), text, version === null ? { mode: 'create' } : { mode: 'replace', expectedVersion: version });
      if (!result.ok) throw new Error('Cannot commit plugin registry; storage may have changed externally.', { cause: result.error });
      version = result.value.version; revision = next.revision;
    },
    async archive(preview: InspectedLup): Promise<void> {
      const directory = `${ROOT}/packages/${preview.manifest.id}`;
      const created = await fs.createDirectory(target(directory), true);
      if (!created.ok && created.error.code !== 'ALREADY_EXISTS') throw new Error('Cannot stage plugin package.', { cause: created.error });
      const path = `${directory}/${preview.digest}.lup`;
      const written = await fs.writeFile(target(path), Array.from(preview.bytes()), { mode: 'create' });
      if (!written.ok) {
        if (written.error.code !== 'ALREADY_EXISTS') throw new Error('Cannot persist plugin package.', { cause: written.error });
        const existing = await fs.readFile(target(path));
        if (!existing.ok || inspectLup(new Uint8Array(existing.value.data), versions).digest !== preview.digest) throw new Error('Existing package bytes conflict with the installation digest.');
      }
    },
    async inspect(record: InstallationRecord): Promise<InspectedLup> {
      const result = await fs.readFile(target(`${ROOT}/packages/${record.id}/${record.digest}.lup`));
      if (!result.ok) throw new Error('Installed package is unavailable.', { cause: result.error });
      const preview = inspectLup(new Uint8Array(result.value.data), versions);
      if (preview.digest !== record.digest || preview.manifest.id !== record.id || preview.manifest.version !== record.version) throw new Error('Installed package identity differs from its committed record.');
      return preview;
    },
    /** Best-effort optimistic cleanup; never recurse into unknown paths or data. */
    async cleanup(records: readonly InstallationRecord[]): Promise<number> {
      if (version === null) return 0;
      const unchanged = async (): Promise<void> => {
        const registry = await fs.readText(target(`${ROOT}/registry.json`));
        if (!registry.ok || registry.value.version !== version) throw new Error('Plugin registry changed before archive cleanup.');
      };
      await unchanged();
      const root = `${ROOT}/packages`; const directories = await fs.list(target(root));
      if (!directories.ok) { if (directories.error.code === 'NOT_FOUND') return 0; throw new Error('Cannot list package archive storage.', { cause: directories.error }); }
      if (directories.value.length > 512) throw new Error('Package cleanup directory limit reached.');
      const retained = new Set(records.map(record => `${root}/${record.id}/${record.digest}.lup`));
      const candidates: string[] = []; let scanned = 0;
      for (const directory of directories.value) {
        const id = directory.path.slice(root.length + 1);
        if (directory.kind !== 'directory' || directory.path !== `${root}/${id}` || !isValidId(id)) continue;
        const entries = await fs.list(target(directory.path));
        if (!entries.ok) throw new Error('Cannot list plugin archive directory.', { cause: entries.error });
        if ((scanned += entries.value.length) > 4096) throw new Error('Package cleanup entry limit reached.');
        for (const entry of entries.value) {
          const name = entry.path.slice(directory.path.length + 1);
          if (entry.kind === 'file' && entry.path === `${directory.path}/${name}` && /^[a-f0-9]{64}\.lup$/.test(name) && !retained.has(entry.path)) candidates.push(entry.path);
        }
      }
      let removed = 0;
      for (const filename of candidates) {
        await unchanged();
        const result = await fs.remove(target(filename), false);
        if (!result.ok && result.error.code !== 'NOT_FOUND') throw new Error('Cannot remove unused package archive.', { cause: result.error });
        if (result.ok) removed++;
      }
      return removed;
    },
  };
}
