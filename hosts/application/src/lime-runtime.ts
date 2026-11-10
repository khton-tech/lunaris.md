import { definePlugin } from "@lunaris/sdk";
import type { PluginManifest } from "@lunaris/sdk";
import type { Kernel } from "@lunaris/kernel";
import { Logger } from "@lunaris/logging";
import { PluginExecution } from "@lunaris/execution";
import type { ExecutionSource } from "@lunaris/execution";
import { LimeRuntime } from "@lunaris/lime";
import type { LimeEnvironment, LimeResult } from "@lunaris/lime";

/** Privileged host composition. Lime receives only the public token, never Kernel. */
export function createLimeRuntime(kernel: Kernel, builtinIds: readonly string[]) {
  const protectedIds = new Set([...builtinIds, 'lunaris.lime-runtime-adapter']);
  return definePlugin({ manifest: { manifestVersion: 1, id: 'lunaris.lime-runtime-adapter', version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './dist/lime-runtime.js',
    provides: [{ kind: 'api', id: LimeRuntime.id, version: LimeRuntime.version }],
    requires: [{ kind: 'api', id: Logger.id, range: '^1.0.0' }, { kind: 'api', id: PluginExecution.id, range: '^1.0.0' }], permissions: ['runtime.manage'], optionalPermissions: [],
  }, activate(ctx) {
    const logger = ctx.use(Logger); const execution = ctx.use(PluginExecution);
    const managed = new Set<string>(); let current: LimeEnvironment | null = null; let tail = Promise.resolve(); let generation = 0;
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
      for (const id of [...managed].sort().reverse()) { await kernel.unregister(id); managed.delete(id); }
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
        return { ok: true, value: Object.freeze(kernel.inspect().plugins.filter(item => managed.has(item.manifest.id)).map(item => Object.freeze({ id: item.manifest.id, version: item.manifest.version, state: item.state }))) };
      },
      register(environment, manifest, source, enabled) {
        const captured = { ...environment };
        const definition = execution.load(manifest, source, captured, ctx.signal);
        const metadata = definition.manifest;
        return serial(async () => {
          if (!matches(captured)) return failure('STALE', 'Plugin environment changed.');
          if (protectedIds.has(metadata.id) || kernel.inspect().plugins.some(item => item.manifest.id === metadata.id)) return failure('CONFLICT', 'Plugin ID collides with a registered or built-in plugin.');
          kernel.register(definition, { ownerId: ctx.pluginId }); managed.add(metadata.id);
          // Declarations are granted internally; the execution broker enforces native authority.
          for (const name of metadata.permissions) kernel.grant(metadata.id, name);
          if (enabled) await kernel.start(metadata.id);
          logger.info(ctx.pluginId, 'Plugin registered in runtime', { data: { pluginId: metadata.id, enabled } }); return { ok: true, value: null };
        });
      },
      replace(environment, manifest: PluginManifest, source: ExecutionSource) {
        const captured = { ...environment }; const definition = execution.load(manifest, source, captured, ctx.signal);
        return operation(captured, definition.manifest.id, () => kernel.replace(definition));
      },
      enable(environment, id) { return operation({ ...environment }, id, () => kernel.start(id)); },
      disable(environment, id) { return operation({ ...environment }, id, () => kernel.stop(id)); },
      remove(environment, id) { return operation({ ...environment }, id, async () => { await kernel.unregister(id); managed.delete(id); }); },
    });
    // Do not invoke kernel lifecycle from an SDK scope disposer: host shutdown
    // already owns that queue. Explicit close is required before Vault teardown.
    logger.info(ctx.pluginId, 'Lime runtime adapter ready');
  } });
}
