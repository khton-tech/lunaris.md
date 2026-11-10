import { definePlugin } from "@lunaris/sdk";
import type { PluginDefinition, PluginManifest } from "@lunaris/sdk";
import type { Kernel } from "@lunaris/kernel";
import { Logger } from "@lunaris/logging";
import { Vault } from "@lunaris/vault";
import { PluginExecution } from "@lunaris/execution";
import type { ExecutionSource } from "@lunaris/execution";
import { LimeRuntime } from "@lunaris/lime";
import type { LimeEnvironment, LimeResult } from "@lunaris/lime";

/** Privileged host composition. Lime receives only the public token, never Kernel. */
export function createLimeRuntime(kernel: Kernel, builtinIds: readonly string[]) {
  const protectedIds = new Set([...builtinIds, 'lunaris.lime-runtime-adapter']);
  return definePlugin({ manifest: { manifestVersion: 1, id: 'lunaris.lime-runtime-adapter', version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './dist/lime-runtime.js',
    provides: [{ kind: 'api', id: LimeRuntime.id, version: LimeRuntime.version }],
    requires: [{ kind: 'api', id: Logger.id, range: '^1.0.0' }, { kind: 'api', id: PluginExecution.id, range: '^1.0.0' }, { kind: 'api', id: Vault.id, range: '^1.0.0' }], permissions: ['runtime.manage', 'vault.access'], optionalPermissions: [],
  }, activate(ctx) {
    const logger = ctx.use(Logger); const execution = ctx.use(PluginExecution);
    const managed = new Map<string, PluginDefinition>(); let current: LimeEnvironment | null = null; let tail = Promise.resolve(); let generation = 0;
    const registered = (id: string) => kernel.inspect().plugins.find(item => item.manifest.id === id);
    const start = async (id: string): Promise<void> => {
      const definition = managed.get(id)!;
      if (!registered(id)) {
        kernel.register(definition, { ownerId: ctx.pluginId });
        for (const name of definition.manifest.permissions) kernel.grant(id, name);
      }
      await kernel.start(id);
    };
    const failure = (code: 'STALE' | 'CONFLICT' | 'NOT_FOUND' | 'RUNTIME_FAILED', message: string): LimeResult<null> => ({ ok: false, error: { code, message } });
    const matches = (environment: LimeEnvironment) => !ctx.signal.aborted && !!current && current.vaultId === environment.vaultId && current.generation === environment.generation;
    const serial = (work: () => Promise<LimeResult<null>>): Promise<LimeResult<null>> => {
      const result = tail.then(async () => {
        if (ctx.signal.aborted) return failure('STALE', 'Runtime adapter is stopped.');
        try { return await work(); }
        catch (error) { if (!ctx.signal.aborted) logger.error(ctx.pluginId, 'Plugin runtime operation failed', { error }); return failure('RUNTIME_FAILED', 'Runtime operation failed; inspect plugin diagnostics and recovery state.'); }
      });
      tail = result.then(() => {}); return result;
    };
    const operation = (environment: LimeEnvironment, id: string, work: () => Promise<void>) => serial(async () => {
      if (!matches(environment)) return failure('STALE', 'Plugin environment changed.');
      if (!managed.has(id)) return failure('NOT_FOUND', 'Plugin is not managed in this environment.');
      await work();
      if (!ctx.signal.aborted) logger.info(ctx.pluginId, 'Plugin runtime state changed', { data: { pluginId: id } });
      return { ok: true, value: null };
    });
    const release = async (): Promise<void> => {
      for (const id of [...managed.keys()].sort().reverse()) { if (registered(id)) await kernel.unregister(id); managed.delete(id); }
      current = null;
    };
    ctx.provide(LimeRuntime, {
      open(environment) { const captured = { ...environment }; return serial(async () => {
        if (!captured.vaultId || !Number.isSafeInteger(captured.generation) || captured.generation <= generation) return failure('STALE', 'Environment generation must increase.');
        await release(); current = Object.freeze(captured); generation = captured.generation;
        logger.info(ctx.pluginId, 'Plugin runtime environment opened', { data: { generation } }); return { ok: true, value: null };
      }); },
      close(environment) { const captured = { ...environment }; return serial(async () => {
        if (!matches(captured)) return failure('STALE', 'Plugin environment changed.');
        await release(); logger.info(ctx.pluginId, 'Plugin runtime environment closed'); return { ok: true, value: null };
      }); },
      snapshot(environment) {
        if (!matches(environment)) return { ok: false, error: { code: 'STALE', message: 'Plugin environment changed.' } };
        return { ok: true, value: Object.freeze([...managed].sort(([a], [b]) => a < b ? -1 : 1).map(([id, definition]) => {
          const snapshot = registered(id); return Object.freeze({ id, version: snapshot?.manifest.version ?? definition.manifest.version, state: snapshot?.state ?? 'disabled' });
        })) };
      },
      register(environment, manifest, source, enabled) {
        const captured = { ...environment };
        const definition = execution.load(manifest, source, captured, ctx.signal);
        const metadata = definition.manifest;
        return serial(async () => {
          if (!matches(captured)) return failure('STALE', 'Plugin environment changed.');
          if (protectedIds.has(metadata.id) || managed.has(metadata.id) || registered(metadata.id)) return failure('CONFLICT', 'Plugin ID collides with a registered or built-in plugin.');
          managed.set(metadata.id, definition);
          // Declarations are granted internally; the execution broker enforces native authority.
          if (enabled) await start(metadata.id);
          logger.info(ctx.pluginId, 'Plugin registered in runtime', { data: { pluginId: metadata.id, enabled } }); return { ok: true, value: null };
        });
      },
      replace(environment, manifest: PluginManifest, source: ExecutionSource) {
        const captured = { ...environment }; const definition = execution.load(manifest, source, captured, ctx.signal);
        return operation(captured, definition.manifest.id, async () => {
          if (registered(definition.manifest.id)) await kernel.replace(definition);
          managed.set(definition.manifest.id, definition);
        });
      },
      enable(environment, id) { return operation({ ...environment }, id, () => start(id)); },
      disable(environment, id) { return operation({ ...environment }, id, async () => { if (registered(id)) await kernel.unregister(id); }); },
      remove(environment, id) { return operation({ ...environment }, id, async () => { if (registered(id)) await kernel.unregister(id); managed.delete(id); }); },
    });
    // Do not invoke kernel lifecycle from an SDK scope disposer: host shutdown
    // already owns that queue. Explicit close is required before Vault teardown.
    logger.info(ctx.pluginId, 'Lime runtime adapter ready');
  } });
}
