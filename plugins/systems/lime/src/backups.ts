import { validPath } from '@lunaris/filesystem';
import type { FilesystemApi, FsResult } from '@lunaris/filesystem';
import type { ConfigSnapshotsApi } from '@lunaris/config';
import { isValidId } from '@lunaris/manifest';
import { sha256 } from '@noble/hashes/sha2.js';

interface Backup {
  readonly formatVersion: 1; readonly pluginId: string; readonly codeDigest: string;
  readonly dataPresent: boolean; readonly directories: readonly string[];
  readonly files: readonly { readonly path: string; readonly size: number; readonly digest: string }[];
  readonly config: string;
}
const digest = (bytes: Uint8Array): string => [...sha256(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
const hash = (text: string): string => digest(new TextEncoder().encode(text));
const required = <T>(result: FsResult<T>, message: string): T => { if (!result.ok) throw new Error(message, { cause: result.error }); return result.value; };
const maxBytes = 32 * 1024 * 1024; const maxEntries = 2048;

/** Captured-Vault, bounded managed-data backups. No arbitrary documents or global settings. */
export function createBackups(fs: FilesystemApi, config: ConfigSnapshotsApi, vaultId: string) {
  const target = (path: string) => ({ vaultId, path });
  const scope = { scope: 'vault' as const, vaultId };
  const roots = (pluginId: string, backupId: string) => {
    if (!isValidId(pluginId) || !/^u-[a-z0-9-]{1,76}$/.test(backupId)) throw new Error('Invalid managed-data backup identity.');
    return { data: `.lunaris/plugins/data/${pluginId}`, backup: `.lunaris/plugins/backups/${pluginId}/${backupId}` };
  };
  const mkdir = async (path: string) => {
    const result = await fs.createDirectory(target(path), true);
    if (!result.ok && result.error.code !== 'ALREADY_EXISTS') required(result, 'Cannot create managed-data backup directory.');
  };
  const remove = async (path: string) => {
    const result = await fs.remove(target(path), true);
    if (!result.ok && result.error.code !== 'NOT_FOUND') required(result, 'Cannot remove managed-data directory.');
  };
  function validate(input: unknown, pluginId: string, codeDigest: string): Backup {
    const value = input as Backup;
    if (!value || typeof value !== 'object' || Object.keys(value).some(key => !['formatVersion','pluginId','codeDigest','dataPresent','directories','files','config'].includes(key)) || value.formatVersion !== 1 || value.pluginId !== pluginId || value.codeDigest !== codeDigest || typeof value.dataPresent !== 'boolean' || typeof value.config !== 'string' || value.config.length > 256 * 1024 || !Array.isArray(value.directories) || !Array.isArray(value.files) || value.directories.length + value.files.length > maxEntries) throw new Error('Malformed managed-data backup.');
    const names = new Set<string>(); let bytes = 0;
    const admit = (name: unknown) => {
      if (typeof name !== 'string' || !validPath(name) || name.length > 1024 || name.split('/').length > 32 || names.has(name.toLowerCase())) throw new Error('Invalid managed-data backup path.');
      names.add(name.toLowerCase());
    };
    for (const name of value.directories) admit(name);
    for (const file of value.files) {
      if (!file || typeof file !== 'object' || Object.keys(file).length !== 3 || !Number.isSafeInteger(file.size) || file.size < 0 || file.size > 16 * 1024 * 1024 || (bytes += file.size) > maxBytes || !/^[a-f0-9]{64}$/.test(file.digest)) throw new Error('Invalid managed-data backup file.');
      admit(file.path);
    }
    const directories = new Set(value.directories.map((name: string) => name.toLowerCase()));
    for (const name of names) {
      const parts = name.split('/'); parts.pop();
      while (parts.length) { if (!directories.has(parts.join('/'))) throw new Error('Missing parent in managed-data backup.'); parts.pop(); }
    }
    if (!value.dataPresent && names.size) throw new Error('Absent managed-data root cannot contain files.');
    return value;
  }
  return {
    async create(pluginId: string, backupId: string, codeDigest: string): Promise<string> {
      const { data, backup } = roots(pluginId, backupId);
      if (!/^[a-f0-9]{64}$/.test(codeDigest)) throw new Error('Invalid backup code digest.');
      await mkdir(backup.slice(0, backup.lastIndexOf('/')));
      required(await fs.createDirectory(target(backup), false), 'Managed-data backup already exists or cannot be created.');
      const directories: string[] = []; const files: { path: string; size: number; digest: string }[] = []; let bytes = 0;
      try {
        const root = await fs.stat(target(data));
        if (!root.ok && root.error.code !== 'NOT_FOUND') required(root, 'Cannot inspect managed data.');
        if (root.ok && root.value.kind !== 'directory') throw new Error('Managed-data root must be a directory.');
        async function scan(path: string, relative: string, depth: number): Promise<void> {
          if (depth > 32) throw new Error('Managed-data directory depth exceeds the backup limit.');
          const entries = required(await fs.list(target(path)), 'Cannot list managed data.');
          for (const entry of entries) {
            const name = entry.path.slice(path.length + 1); const child = relative ? `${relative}/${name}` : name;
            if (!validPath(name) || name.includes('/') || entry.path !== `${path}/${name}` || child.length > 1024 || directories.length + files.length >= maxEntries) throw new Error('Invalid managed-data entry or backup limit.');
            if (entry.kind === 'directory') { directories.push(child); await mkdir(`${backup}/data/${child}`); await scan(entry.path, child, depth + 1); }
            else if (entry.kind === 'file') {
              if (entry.size > 16 * 1024 * 1024 || bytes + entry.size > maxBytes) throw new Error('Managed data exceeds the backup byte limit.');
              const content = required(await fs.readFile(target(entry.path)), 'Cannot read managed data.');
              bytes += content.data.length;
              if (content.data.length > 16 * 1024 * 1024 || bytes > maxBytes) throw new Error('Managed data changed beyond the backup byte limit.');
              await mkdir(`${backup}/data/${relative}`.replace(/\/$/, ''));
              required(await fs.writeFile(target(`${backup}/data/${child}`), content.data, { mode: 'create' }), 'Cannot persist managed-data file backup.');
              files.push({ path: child, size: content.data.length, digest: digest(new Uint8Array(content.data)) });
            } else throw new Error('Managed-data backup does not follow symlinks or special files.');
          }
        }
        if (root.ok) await scan(data, '', 0);
        const snapshot = await config.capture(pluginId, scope);
        if (!snapshot.ok) throw new Error('Cannot capture plugin configuration.', { cause: snapshot.error });
        const description: Backup = { formatVersion: 1, pluginId, codeDigest, dataPresent: root.ok, directories, files, config: snapshot.value };
        validate(description, pluginId, codeDigest);
        const text = JSON.stringify(description);
        if (text.length > 1024 * 1024) throw new Error('Managed-data backup manifest exceeds its size limit.');
        required(await fs.writeText(target(`${backup}/manifest.json`), text, { mode: 'create' }), 'Cannot commit managed-data backup manifest.');
        return hash(text);
      } catch (error) {
        try { await remove(backup); } catch { /* Unreferenced partial backups cannot become recovery journals. */ }
        throw error;
      }
    },
    async restore(pluginId: string, backupId: string, codeDigest: string, expectedDigest: string): Promise<void> {
      const { data, backup } = roots(pluginId, backupId);
      const manifest = required(await fs.readText(target(`${backup}/manifest.json`)), 'Managed-data backup manifest is unavailable.');
      if (manifest.text.length > 1024 * 1024 || hash(manifest.text) !== expectedDigest) throw new Error('Managed-data backup manifest integrity mismatch.');
      const description = validate(JSON.parse(manifest.text), pluginId, codeDigest);
      const contents = new Map<string, Uint8Array>();
      for (const file of description.files) {
        const content = required(await fs.readFile(target(`${backup}/data/${file.path}`)), 'Managed-data backup file is unavailable.');
        const bytes = new Uint8Array(content.data);
        if (bytes.length !== file.size || digest(bytes) !== file.digest) throw new Error('Managed-data backup file integrity mismatch.');
        contents.set(file.path, bytes);
      }
      const current = await fs.stat(target(data));
      if (current.ok && current.value.kind !== 'directory') throw new Error('Managed-data recovery refuses a non-directory root.');
      if (!current.ok && current.error.code !== 'NOT_FOUND') required(current, 'Cannot inspect managed-data recovery target.');
      const settings = await config.restore(pluginId, description.config, scope);
      if (!settings.ok) throw new Error('Cannot restore plugin configuration.', { cause: settings.error });
      await remove(data);
      if (description.dataPresent) await mkdir(data);
      for (const directory of [...description.directories].sort((a, b) => a.split('/').length - b.split('/').length)) await mkdir(`${data}/${directory}`);
      for (const [name, bytes] of contents) required(await fs.writeFile(target(`${data}/${name}`), Array.from(bytes), { mode: 'create' }), 'Cannot restore managed-data file.');
    },
    async discard(pluginId: string, backupId: string): Promise<void> { await remove(roots(pluginId, backupId).backup); },
  };
}
