import { definePlugin } from '@lunaris/sdk';
import { Logger } from '@lunaris/logging';
import { Filesystem, failure, validTarget } from '@lunaris/filesystem';
import type { FileTarget, WriteOptions } from '@lunaris/filesystem';
import { Vault } from '@lunaris/vault';
import { createHash } from 'node:crypto';

export const developmentVault = Object.freeze({ id: 'lunaris.development-vault', name: 'Development Vault' });
const maxFileBytes = 128 * 1024;
const maxVaultBytes = 16 * 1024 * 1024;
const ok = <T>(value: T) => ({ ok: true as const, value });
const unsupported = async () => failure('UNSUPPORTED', 'This operation requires an application Vault.');

export function createDevelopmentVault() {
  return definePlugin({
    manifest: {
      manifestVersion: 1, id: developmentVault.id, version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './vault.js',
      provides: [Vault, Filesystem].map(token => ({ kind: token.kind, id: token.id, version: token.version })),
      requires: [{ kind: Logger.kind, id: Logger.id, range: '^1.0.0' }], permissions: [], optionalPermissions: [],
    },
    activate(ctx) {
      const logger = ctx.use(Logger);
      const files = new Map<string, { data: readonly number[]; version: string }>();
      let usedBytes = 0;
      const valid = (target: FileTarget, root = false) => validTarget(target, root) && target.vaultId === developmentVault.id && target.path.length <= 1024;
      const invalid = () => failure('INVALID_PATH', 'Expected a path inside the development Vault.');
      const missing = () => failure('NOT_FOUND', 'Development Vault entry does not exist.');
      const read = (target: FileTarget) => {
        if (!valid(target)) return invalid();
        const file = files.get(target.path);
        return file ? ok(file) : missing();
      };
      const write = (target: FileTarget, data: readonly number[] | Uint8Array, options: WriteOptions) => {
        if (!valid(target)) return invalid();
        if (!options || !['create', 'replace', 'upsert'].includes(options.mode)) return failure('INVALID_ARGUMENT', 'An explicit write mode is required.');
        const previous = files.get(target.path);
        if (previous && options.mode === 'create') return failure('ALREADY_EXISTS', 'File already exists.');
        if (!previous && options.mode === 'replace') return missing();
        if (options.expectedVersion !== undefined && options.expectedVersion !== previous?.version) return failure('CONFLICT', 'The file version changed.');
        const total = usedBytes + data.length - (previous?.data.length ?? 0);
        if (data.length > maxFileBytes || total > maxVaultBytes || (!previous && files.size >= 2048)) return failure('TOO_LARGE', 'Development Vault storage limit exceeded.');
        const bytes = Array.from(data);
        if (bytes.some(value => !Number.isInteger(value) || value < 0 || value > 255)) return failure('INVALID_ARGUMENT', 'Expected byte data.');
        const version = createHash('sha256').update(Uint8Array.from(bytes)).digest('hex');
        files.set(target.path, Object.freeze({ data: Object.freeze(bytes), version }));
        usedBytes = total;
        return ok({ version });
      };
      ctx.provide(Filesystem, {
        capabilities: () => ({ atomicReplace: true, versionCheck: 'optimistic', watch: false, trash: false, maxFileBytes }),
        selectVault: unsupported, closeVault: unsupported, pickFile: unsupported, pickDirectory: unsupported, pickSaveLocation: unsupported,
        async readFile(target) { return read(target); },
        async readText(target) {
          const result = read(target);
          if (!result.ok) return result;
          try { return ok({ text: new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(result.value.data)), version: result.value.version }); }
          catch { return failure('INVALID_ENCODING', 'The file is not UTF-8.'); }
        },
        async writeText(target, text, options) {
          if (typeof text !== 'string') return failure('INVALID_ARGUMENT', 'Expected text.');
          if (text.length > maxFileBytes) return failure('TOO_LARGE', 'File exceeds the development Vault limit.');
          return write(target, new TextEncoder().encode(text), options);
        },
        async writeFile(target, data, options) {
          return Array.isArray(data) ? write(target, data, options) : failure('INVALID_ARGUMENT', 'Expected byte data.');
        },
        async stat(target) {
          if (!valid(target, true)) return invalid();
          if (target.path === '') return ok({ path: '', kind: 'directory', size: 0, modifiedAt: null });
          const file = files.get(target.path);
          return file ? ok({ path: target.path, kind: 'file', size: file.data.length, modifiedAt: null }) : missing();
        },
        async remove(target) {
          if (!valid(target)) return invalid();
          const file = files.get(target.path);
          if (!file) return missing();
          usedBytes -= file.data.length;
          files.delete(target.path);
          return ok(null);
        },
        list: unsupported, createDirectory: unsupported, move: unsupported, copy: unsupported, watch: unsupported, unwatch: unsupported,
      });
      ctx.provide(Vault, { current: () => developmentVault, open: async () => ok(developmentVault), close: unsupported });
      ctx.scope.own({ dispose() { files.clear(); } });
      logger.info(ctx.pluginId, 'Disposable development Vault ready');
    },
  });
}
