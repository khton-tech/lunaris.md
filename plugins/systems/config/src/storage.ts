import type { FilesystemApi, FileTarget } from "@lunaris/filesystem";
import type { ConfigResult, ConfigTable, ConfigValue } from "@lunaris/config";
import { decode, encode, isTable, section, snapshot } from "./codec.js";

export function createStorage(fs: FilesystemApi, stopped: () => boolean) {
  const queues = new Map<string, Promise<unknown>>();
  const reads = new Map<string, ReturnType<typeof load>>();
  const stoppedResult = (): Extract<ConfigResult<never>, { ok: false }> => ({ ok: false, error: { code: "STOPPED", message: "The config manager is stopped." } });
  function queued<T>(target: FileTarget, work: () => Promise<ConfigResult<T>>): Promise<ConfigResult<T>> {
    const key = JSON.stringify([target.vaultId, target.path]);
    // A queued write/initialization is a barrier: later reads must see its result.
    reads.delete(key);
    const task = (queues.get(key) ?? Promise.resolve()).catch(() => {}).then(() => stopped() ? stoppedResult() : work());
    queues.set(key, task);
    void task.finally(() => { if (queues.get(key) === task) queues.delete(key); }).catch(() => {});
    return task;
  }
  async function load(target: FileTarget): Promise<ConfigResult<{ document: Record<string, ConfigValue>; version: string | null }>> {
    if (stopped()) return stoppedResult();
    const read = await fs.readText(target);
    if (stopped()) return stoppedResult();
    if (!read.ok) return read.error.code === "NOT_FOUND" ? { ok: true, value: { document: {}, version: null } } : read;
    return { ok: true, value: { document: decode(read.value.text), version: read.value.version } };
  }
  function ensure(target: FileTarget): Promise<ConfigResult<null>> {
    return queued(target, async () => {
      const current = await load(target);
      if (!current.ok) return current;
      if (current.value.version !== null) return { ok: true, value: null };
      if (stopped()) return stoppedResult();
      const created = await fs.writeText(target, "# Lunaris plugin configuration.\n", { mode: "create" });
      if (stopped()) return stoppedResult();
      if (!created.ok && created.error.code !== "ALREADY_EXISTS") return created;
      if (!created.ok) {
        const raced = await load(target);
        if (!raced.ok) return raced;
        if (raced.value.version === null) return { ok: false, error: { code: "CONFLICT", message: "Configuration was removed during initialization." } };
      }
      return { ok: true, value: null };
    });
  }
  return {
    ensure,
    async prepareVault(vaultId: string): Promise<ConfigResult<null>> {
      if (stopped()) return stoppedResult();
      const directory = { vaultId, path: ".lunaris" };
      // Recursive creation also accepts an existing directory in native drivers.
      const created = await fs.createDirectory(directory, true);
      if (stopped()) return stoppedResult();
      if (!created.ok) {
        if (created.error.code !== "ALREADY_EXISTS") return created;
        const info = await fs.stat(directory);
        if (stopped()) return stoppedResult();
        if (!info.ok) return info;
        if (info.value.kind !== "directory") return { ok: false, error: { code: "NOT_DIRECTORY", message: "The .lunaris resource must be a directory." } };
      }
      return ensure({ vaultId, path: ".lunaris/config.toml" });
    },
    read(target: FileTarget, pluginId: string): Promise<ConfigResult<ConfigTable>> {
      const key = JSON.stringify([target.vaultId, target.path]);
      let pending = reads.get(key);
      if (!pending) {
        pending = queued(target, () => load(target)); reads.set(key, pending);
        const current = pending;
        void pending.finally(() => { if (reads.get(key) === current) reads.delete(key); }).catch(() => {});
      }
      // Only in-flight reads share decoding. Each consumer owns its returned table.
      return pending.then(current => current.ok ? { ok: true, value: snapshot(section(current.value.document, pluginId)) as ConfigTable } : current);
    },
    mutate(target: FileTarget, pluginId: string, key: string, value: ConfigValue | undefined): Promise<ConfigResult<boolean>> {
      return queued(target, async () => {
        const current = await load(target);
        if (!current.ok) return current;
        const { document, version } = current.value;
        const plugins: Record<string, ConfigValue> = isTable(document.plugins) ? document.plugins : {};
        document.plugins = plugins;
        const entry = Object.hasOwn(plugins, pluginId) ? plugins[pluginId] : undefined;
        const config: Record<string, ConfigValue> = isTable(entry) ? entry : {};
        plugins[pluginId] = config;
        if (value === undefined) {
          if (!Object.hasOwn(config, key)) return { ok: true, value: false };
          delete config[key];
        } else {
          if (Object.hasOwn(config, key) && Object.is(config[key], value)) return { ok: true, value: false };
          config[key] = value;
        }
        const text = encode(document);
        if (stopped()) return stoppedResult();
        const written = await fs.writeText(target, text, version === null ? { mode: "create" } : { mode: "replace", expectedVersion: version });
        if (stopped()) return stoppedResult();
        return written.ok ? { ok: true, value: true } : written;
      });
    },
    replace(target: FileTarget, pluginId: string, values: ConfigTable): Promise<ConfigResult<readonly string[]>> {
      return queued(target, async () => {
        const current = await load(target); if (!current.ok) return current;
        const { document, version } = current.value;
        const keys = [...new Set([...Object.keys(section(document, pluginId)), ...Object.keys(values)])].sort();
        const plugins: Record<string, ConfigValue> = isTable(document.plugins) ? document.plugins : {};
        document.plugins = plugins; plugins[pluginId] = values;
        const text = encode(document); if (stopped()) return stoppedResult();
        const written = await fs.writeText(target, text, version === null ? { mode: 'create' } : { mode: 'replace', expectedVersion: version });
        if (stopped()) return stoppedResult();
        return written.ok ? { ok: true, value: keys } : written;
      });
    },
  };
}
