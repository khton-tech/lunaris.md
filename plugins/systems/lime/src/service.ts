import type { PluginContext, ResourceScope } from "@lunaris/sdk";
import { Logger } from "@lunaris/logging";
import { Filesystem } from "@lunaris/filesystem";
import { Config } from "@lunaris/config";
import { Vault, VaultLifecycle } from "@lunaris/vault";
import { Lime, LimeChanged, LimePackagePicker, LimeRuntime } from "@lunaris/lime";
import type { LimeEnvironment, LimeInstallation, LimePreview, LimeResult, LimeSnapshot } from "@lunaris/lime";
import type { ExecutionSource } from "@lunaris/execution";
import { versionSatisfies } from "@lunaris/manifest";
import { inspectLup } from "@lunaris/lup";
import type { InspectedLup } from "@lunaris/lup";
import { createStorage } from "./storage.js";
import type { InstallationRecord } from "./storage.js";

const ok = (): LimeResult<null> => ({ ok: true, value: null });
const fail = (code: 'BUSY' | 'NO_VAULT' | 'STALE' | 'INVALID_PACKAGE' | 'STORAGE_FAILED' | 'RUNTIME_FAILED' | 'NOT_FOUND' | 'CONFLICT', message: string): LimeResult<never> => ({ ok: false, error: { code, message } });
function source(preview: InspectedLup): ExecutionSource {
  const decoder = new TextDecoder('utf-8', { fatal: true }); const modules: Record<string, string> = {};
  for (const path of preview.paths) if (/\.(?:mjs|js)$/.test(path)) modules[path] = decoder.decode(preview.read(path)!);
  const resources = Object.fromEntries(preview.paths.filter(path => path.startsWith('assets/')).map(path => [path, Array.from(preview.read(path)!)]));
  return { entry: preview.manifest.entry.slice(2), modules, resources };
}

export function activateLime(ctx: PluginContext, platform: 'desktop' | 'web' | 'mobile', initialSafeMode = false): void {
  const logger = ctx.use(Logger); const fs = ctx.use(Filesystem); const vault = ctx.use(Vault);
  const config = ctx.use(Config);
  const runtime = ctx.use(LimeRuntime); const picker = ctx.use(LimePackagePicker);
  const lifecycle = ctx.use(VaultLifecycle);
  let environment: LimeEnvironment | null = null; let generation = 0; let owner: ResourceScope | null = null;
  let storage: ReturnType<typeof createStorage> | null = null; let records: readonly InstallationRecord[] = [];
  const packages = new Map<string, InspectedLup>(); const previews = new Map<number, { environment: LimeEnvironment; preview: InspectedLup }>();
  let nextTicket = 0; let busy = false; let transitioning = false; let safeMode = initialSafeMode; let error: string | null = null; let tail = Promise.resolve();
  const snapshot = (): LimeSnapshot => {
    const observed = environment ? runtime.snapshot(environment) : null;
    return Object.freeze({ vaultId: environment?.vaultId ?? null, busy: busy || transitioning, safeMode, error,
      installations: Object.freeze(records.map(({ removing, ...record }) => Object.freeze({ ...record, removalPending: !!removing, ...(packages.get(record.id) ? { manifest: packages.get(record.id)!.manifest } : {}), state: removing ? 'removing' : observed?.ok ? observed.value.find(item => item.id === record.id)?.state ?? 'unavailable' : 'unavailable' } satisfies LimeInstallation))),
    });
  };
  const publish = (): void => { if (!ctx.signal.aborted) void ctx.events.emit(LimeChanged, snapshot()).catch(cause => { if (!ctx.signal.aborted) logger.error(ctx.pluginId, 'Cannot publish Lime state', { error: cause }); }); };
  const valid = (captured: LimeEnvironment) => !ctx.signal.aborted && !!environment && environment.vaultId === captured.vaultId && environment.generation === captured.generation;
  const save = async (next: readonly InstallationRecord[]) => { await storage!.save(next); records = Object.freeze([...next]); publish(); };
  const cleanup = async (): Promise<void> => {
    try { const removed = await storage!.cleanup(records); if (removed) logger.info(ctx.pluginId, 'Unused package archives removed', { data: { count: removed } }); }
    catch (cause) { if (!ctx.signal.aborted) logger.warn(ctx.pluginId, 'Unused archive cleanup deferred', { error: cause }); }
  };
  const mutate = (work: (captured: LimeEnvironment) => Promise<LimeResult<null>>): Promise<LimeResult<null>> => {
    if (!environment) return Promise.resolve(fail('NO_VAULT', 'Open a Vault before managing plugins.'));
    if (busy || transitioning) return Promise.resolve(fail('BUSY', 'Plugin environment is busy.'));
    const captured = { ...environment }; busy = true; error = null; publish();
    const result = tail.then(async () => {
      try {
        if (!valid(captured)) return fail('STALE', 'Plugin environment changed.');
        return await work(captured);
      }
      catch (cause) { error = 'Plugin storage operation failed. Inspect diagnostics before retrying.'; if (!ctx.signal.aborted) logger.error(ctx.pluginId, 'Lime operation failed', { error: cause }); return fail('STORAGE_FAILED', error); }
      finally { busy = false; publish(); }
    }); tail = result.then(() => {}); return result;
  };
  const activate = async (id: string, captured: LimeEnvironment): Promise<LimeResult<null>> => {
    const record = records.find(item => item.id === id); if (!record) return fail('NOT_FOUND', 'Plugin is not installed.');
    if (record.removing) return fail('CONFLICT', 'Plugin removal must finish before activation.');
    if (safeMode) return fail('CONFLICT', 'Exit safe mode before activating packages.');
    await save(records.map(item => item.id === id ? { ...item, enabled: true, recoveryRequired: true } : item));
    const result = await runtime.enable(captured, id);
    if (result.ok && valid(captured)) await save(records.map(item => item.id === id ? { ...item, recoveryRequired: false } : item));
    else if (!result.ok) logger.warn(ctx.pluginId, 'Plugin requires recovery before retry', { data: { pluginId: id, code: result.error.code } });
    return result;
  };
  const finishRemoval = async (record: InstallationRecord, captured: LimeEnvironment): Promise<LimeResult<null>> => {
    const stopped = await runtime.remove(captured, record.id);
    if (!stopped.ok && stopped.error.code !== 'NOT_FOUND') return stopped;
    const removePath = async (path: string) => {
      const result = await fs.remove({ vaultId: captured.vaultId, path }, true);
      if (!result.ok && result.error.code !== 'NOT_FOUND') throw new Error('Plugin removal cleanup failed.', { cause: result.error });
    };
    if (record.removing?.deleteData) {
      const target = { scope: 'vault' as const, vaultId: captured.vaultId };
      const settings = await config.read(record.id, target);
      if (!settings.ok) throw new Error('Cannot read plugin settings during removal.', { cause: settings.error });
      for (const key of Object.keys(settings.value)) {
        const result = await config.remove(record.id, key, target);
        if (!result.ok) throw new Error('Cannot remove plugin settings.', { cause: result.error });
      }
      await removePath(`.lunaris/plugins/data/${record.id}`);
    }
    await removePath(`.lunaris/plugins/packages/${record.id}`);
    await save(records.filter(item => item.id !== record.id)); packages.delete(record.id);
    logger.info(ctx.pluginId, 'Plugin removal committed', { data: { pluginId: record.id, deletedData: record.removing?.deleteData === true } });
    return ok();
  };
  const restore = async (requestedSafeMode = safeMode): Promise<LimeResult<null>> => {
    const current = vault.current();
    if (!current) return fail('NO_VAULT', 'No Vault is active.');
    if (busy || transitioning) return fail('BUSY', 'Plugin operation or environment transition is still running.');
    transitioning = true; previews.clear();
    try {
      if (owner) await owner.dispose();
      owner = ctx.scope.child(); environment = Object.freeze({ vaultId: current.id, generation: ++generation });
      storage = createStorage(fs, current.id); packages.clear(); records = []; error = null; safeMode = requestedSafeMode;
      const opened = await runtime.open(environment); if (!opened.ok) { error = opened.error.message; return opened; }
      records = await storage.read();
      await cleanup();
      for (const record of [...records]) {
        if (record.removing) {
          try { const result = await finishRemoval(record, environment); if (!result.ok) error = result.error.message; }
          catch (cause) { error = 'Pending plugin removal needs another cleanup attempt.'; logger.error(ctx.pluginId, 'Cannot recover pending plugin removal', { error: cause, data: { pluginId: record.id } }); }
          continue;
        }
        try {
          const inspected = await storage.inspect(record); packages.set(record.id, inspected);
          const loaded = await runtime.register(environment, inspected.manifest, source(inspected), false);
          if (!loaded.ok) logger.warn(ctx.pluginId, 'Installed plugin could not be registered', { data: { pluginId: record.id, code: loaded.error.code } });
        } catch (cause) { logger.error(ctx.pluginId, 'Installed package validation failed', { error: cause, data: { pluginId: record.id } }); }
      }
      // Order only enabled required package dependencies. Built-ins resolve through
      // the runtime; optional cycles must not become required startup cycles.
      const pending = new Set(records.filter(record => record.enabled && !record.recoveryRequired && packages.has(record.id)).map(record => record.id));
      const order: string[] = [];
      while (pending.size) {
        const ready = [...pending].sort().find(id => !packages.get(id)!.manifest.requires.some(requirement => !requirement.optional && [...pending].some(provider => provider !== id && packages.get(provider)!.manifest.provides.some(provided => provided.kind === requirement.kind && provided.id === requirement.id && versionSatisfies(provided.version, requirement.range)))));
        if (!ready) { order.push(...[...pending].sort()); break; }
        order.push(ready); pending.delete(ready);
      }
      if (!safeMode) for (const id of order) await activate(id, environment);
      logger.info(ctx.pluginId, 'Vault plugin environment restored', { data: { count: records.length, safeMode } }); return ok();
    } catch (cause) {
      safeMode = true; error = 'Plugin environment could not be restored; packages remain inactive.';
      logger.error(ctx.pluginId, 'Lime environment restore failed', { error: cause }); return fail('STORAGE_FAILED', error);
    } finally { transitioning = false; publish(); }
  };
  const participation = lifecycle.register({ id: ctx.pluginId,
    async beforeRelease() {
      transitioning = true; previews.clear(); if (owner) await owner.dispose();
      await tail;
      if (environment) { const closed = await runtime.close(environment); if (!closed.ok) { transitioning = false; return { ok: false, error: { code: 'IO_ERROR', message: closed.error.message } }; } }
      environment = null; storage = null; records = []; packages.clear(); publish(); return { ok: true, value: null };
    },
    async settled(_previous, current) {
      transitioning = false;
      if (current) await restore(safeMode);
      else { environment = null; records = []; storage = null; publish(); }
    },
  }, ctx.signal);
  if (!participation.ok) throw new Error('Cannot register Lime Vault lifecycle.', { cause: participation.error });
  const install = (ticket: number, enabled: boolean, updating: boolean) => mutate(async captured => {
    const selected = previews.get(ticket); previews.delete(ticket);
    if (!selected || selected.environment.vaultId !== captured.vaultId || selected.environment.generation !== captured.generation) return fail('STALE', 'Select and preview this package again.');
    const preview = selected.preview; const previous = records.find(item => item.id === preview.manifest.id);
    if (previous?.removing) return fail('CONFLICT', 'Finish removing this plugin before installing another version.');
    if (updating ? !previous : !!previous) return fail('CONFLICT', updating ? 'Plugin is not installed.' : 'Plugin is already installed; choose update.');
    if (previous?.version === preview.manifest.version) return fail('CONFLICT', 'The same version is already installed.');
    if (!updating) {
      const staged = await runtime.register(captured, preview.manifest, source(preview), false);
      if (!staged.ok) return staged;
    }
    try { await storage!.archive(preview); }
    catch (cause) { if (!updating) await runtime.remove(captured, preview.manifest.id); throw cause; }
    if (!valid(captured) || transitioning) {
      if (!updating) await runtime.remove(captured, preview.manifest.id);
      return fail('STALE', 'Vault transition interrupted installation.');
    }
    if (updating) {
      await save(records.map(item => item.id === previous!.id ? { ...item, recoveryRequired: true } : item));
      // Runtime rollback restores code, not arbitrary Vault side effects.
      const changed = await runtime.replace(captured, preview.manifest, source(preview));
      if (!changed.ok) return changed;
    }
    const record: InstallationRecord = { id: preview.manifest.id, version: preview.manifest.version, digest: preview.digest, enabled: updating ? previous!.enabled : enabled, recoveryRequired: false };
    try { await save([...records.filter(item => item.id !== record.id), record]); }
    catch (cause) {
      if (previous) { const old = packages.get(previous.id); if (old) await runtime.replace(captured, old.manifest, source(old)); }
      else await runtime.remove(captured, record.id);
      await cleanup();
      throw cause;
    }
    packages.set(record.id, preview);
    await cleanup();
    logger.info(ctx.pluginId, updating ? 'Plugin update committed' : 'Plugin installation committed', { data: { pluginId: record.id, version: record.version } });
    if (record.enabled && !updating && !safeMode) return await activate(record.id, captured);
    publish(); return ok();
  });
  ctx.provide(Lime, {
    snapshot, restore,
    async preview(): Promise<LimeResult<LimePreview | null>> {
      if (!environment || !owner) return fail('NO_VAULT', 'Open a Vault before selecting a plugin.');
      if (transitioning) return fail('BUSY', 'Vault transition is in progress.');
      const captured = { ...environment }; const scope = owner.child();
      try {
        const selected = await picker.pick(scope.signal);
        if (!selected.ok) return selected;
        if (selected.value === null) return { ok: true, value: null };
        if (!valid(captured)) return fail('STALE', 'Vault changed during package selection.');
        const inspected = inspectLup(selected.value, { engineVersion: '0.1.0', sdkVersion: '0.1.0' });
        previews.clear(); const ticket = ++nextTicket; previews.set(ticket, { environment: captured, preview: inspected });
        const platforms = inspected.manifest.metadata!.platforms;
        return { ok: true, value: Object.freeze({ ticket, manifest: inspected.manifest, digest: inspected.digest, platformWarning: platforms !== 'universal' && !platforms.includes(platform) }) };
      } catch (cause) { logger.warn(ctx.pluginId, 'Package preview rejected', { error: cause }); return fail('INVALID_PACKAGE', 'Selected package is invalid or incompatible.'); }
      finally { await scope.dispose(); }
    },
    cancelPreview(ticket) { previews.delete(ticket); },
    install: (ticket, enabled = true) => install(ticket, enabled, false), update: ticket => install(ticket, true, true),
    enable: id => mutate(captured => activate(id, captured)), retry: id => mutate(captured => activate(id, captured)),
    remove: (id, deleteData) => mutate(async captured => {
      const record = records.find(item => item.id === id); if (!record) return fail('NOT_FOUND', 'Plugin is not installed.');
      if (typeof deleteData !== 'boolean') return fail('CONFLICT', 'Choose whether plugin data and settings should be deleted.');
      const pending: InstallationRecord = record.removing ? record : { ...record, enabled: false, recoveryRequired: true, removing: { deleteData } };
      if (!record.removing) await save(records.map(item => item.id === id ? pending : item));
      return await finishRemoval(pending, captured);
    }),
    disable: id => mutate(async captured => {
      if (!records.some(item => item.id === id)) return fail('NOT_FOUND', 'Plugin is not installed.');
      if (records.some(item => item.id === id && item.removing)) return fail('CONFLICT', 'Plugin removal must finish first.');
      const result = await runtime.disable(captured, id); if (!result.ok) return result;
      await save(records.map(item => item.id === id ? { ...item, enabled: false, recoveryRequired: false } : item));
      logger.info(ctx.pluginId, 'Plugin disabled', { data: { pluginId: id } }); return ok();
    }),
  });
  logger.info(ctx.pluginId, 'Lunaris Lime ready');
}
