import { definePlugin } from "@lunaris/sdk";
import { versionSatisfies } from '@lunaris/manifest';
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
    const choices = new Map<string, Map<string, string>>(); let revision = 0; let signature = '';
    const checkpoints = new Map<number, { id: string; definition: PluginDefinition; active: readonly string[]; grants: readonly string[]; choices: Map<string, string> }>(); let nextCheckpoint = 0;
    const refresh = (): number => {
      const observed = JSON.stringify(kernel.inspect().plugins.map(item => [item.manifest, item.state, item.activationId, item.ownerId, item.bindings, item.effectivePermissions]));
      if (observed !== signature) { signature = observed; revision++; }
      return revision;
    };
    const registered = (id: string) => kernel.inspect().plugins.find(item => item.manifest.id === id);
    const start = async (id: string): Promise<void> => {
      const definition = managed.get(id)!;
      if (!registered(id)) {
        kernel.register(definition, { ownerId: ctx.pluginId });
        for (const name of [...definition.manifest.permissions, ...definition.manifest.optionalPermissions]) kernel.grant(id, name);
      }
      if (registered(id)?.state !== 'active') for (const requirement of definition.manifest.requires) {
        const selected = choices.get(id)?.get(`${requirement.kind}:${requirement.id}`);
        if (selected) kernel.selectProvider(id, requirement.kind, requirement.id, selected);
      }
      await kernel.start(id);
    };
    const failure = (code: 'STALE' | 'CONFLICT' | 'NOT_FOUND' | 'RUNTIME_FAILED', message: string): Extract<LimeResult<never>, { ok: false }> => ({ ok: false, error: { code, message } });
    const matches = (environment: LimeEnvironment) => !ctx.signal.aborted && !!current && current.vaultId === environment.vaultId && current.generation === environment.generation;
    const serial = <T>(work: () => Promise<LimeResult<T>>, checkpointOperation = false): Promise<LimeResult<T>> => {
      const result = tail.then(async () => {
        if (ctx.signal.aborted) return failure('STALE', 'Runtime adapter is stopped.');
        if (checkpoints.size && !checkpointOperation) return failure('CONFLICT', 'An update checkpoint holds the runtime graph.');
        try { return await work(); }
        catch (error) { if (!ctx.signal.aborted) logger.error(ctx.pluginId, 'Plugin runtime operation failed', { error }); return failure('RUNTIME_FAILED', 'Runtime operation failed; inspect plugin diagnostics and recovery state.'); }
        finally { revision++; signature = ''; }
      });
      tail = result.then(() => {}); return result;
    };
    const operation = (environment: LimeEnvironment, id: string, work: () => Promise<void>, checkpointOperation = false) => serial(async () => {
      if (!matches(environment)) return failure('STALE', 'Plugin environment changed.');
      if (!managed.has(id)) return failure('NOT_FOUND', 'Plugin is not managed in this environment.');
      if (checkpoints.size && checkpointOperation && ![...checkpoints.values()].some(saved => saved.id === id)) return failure('CONFLICT', 'A different plugin owns the update checkpoint.');
      await work();
      if (!ctx.signal.aborted) logger.info(ctx.pluginId, 'Plugin runtime state changed', { data: { pluginId: id } });
      return { ok: true, value: null };
    }, checkpointOperation);
    const release = async (): Promise<void> => {
      for (const id of [...managed.keys()].sort().reverse()) { if (registered(id)) await kernel.unregister(id); managed.delete(id); }
      current = null; choices.clear(); checkpoints.clear();
    };
    ctx.provide(LimeRuntime, {
      open(environment) { const captured = { ...environment }; return serial(async () => {
        if (!captured.vaultId || !Number.isSafeInteger(captured.generation) || captured.generation <= generation) return failure('STALE', 'Environment generation must increase.');
        await release(); current = Object.freeze(captured); generation = captured.generation;
        logger.info(ctx.pluginId, 'Plugin runtime environment opened', { data: { generation } }); return { ok: true, value: null };
      }, true); },
      close(environment) { const captured = { ...environment }; return serial(async () => {
        if (!matches(captured)) return failure('STALE', 'Plugin environment changed.');
        await release(); logger.info(ctx.pluginId, 'Plugin runtime environment closed'); return { ok: true, value: null };
      }, true); },
      snapshot(environment) {
        if (!matches(environment)) return { ok: false, error: { code: 'STALE', message: 'Plugin environment changed.' } };
        return { ok: true, value: Object.freeze([...managed].sort(([a], [b]) => a < b ? -1 : 1).map(([id, definition]) => {
          const snapshot = registered(id); return Object.freeze({ id, version: snapshot?.manifest.version ?? definition.manifest.version, state: snapshot?.state ?? 'disabled' });
        })) };
      },
      plan(environment, id) {
        if (!matches(environment)) return failure('STALE', 'Plugin environment changed.');
        const definition = managed.get(id); if (!definition) return failure('NOT_FOUND', 'Plugin is not managed in this environment.');
        const snapshot = kernel.inspect(); const affected = new Set([id]);
        for (const provider of affected) for (const item of snapshot.plugins) if (item.state === 'active' && (item.ownerId === provider || item.bindings.some(binding => binding.providerId === provider))) affected.add(item.manifest.id);
        const available = new Map<string, { manifest: PluginManifest; state: string }>(snapshot.plugins.map(item => [item.manifest.id, { manifest: item.manifest, state: item.state }]));
        for (const [pluginId, candidate] of managed) if (!available.has(pluginId)) available.set(pluginId, { manifest: candidate.manifest, state: 'disabled' });
        const bindings = registered(id)?.bindings;
        const dependencies = definition.manifest.requires.map(requirement => {
          const candidates = [...available].flatMap(([pluginId, item]) => {
            const provided = item.manifest.provides.find(provided => provided.kind === requirement.kind && provided.id === requirement.id && versionSatisfies(provided.version, requirement.range));
            return provided ? [Object.freeze({ id: pluginId, version: provided.version, state: item.state })] : [];
          }).sort((a, b) => a.id < b.id ? -1 : 1);
          const selected = choices.get(id)?.get(`${requirement.kind}:${requirement.id}`) ?? bindings?.find(binding => binding.contract === `${requirement.kind}:${requirement.id}`)?.providerId;
          return Object.freeze({ kind: requirement.kind, id: requirement.id, range: requirement.range, optional: requirement.optional === true, ...(selected ? { selected } : {}), candidates: Object.freeze(candidates) });
        });
        return { ok: true, value: Object.freeze({ pluginId: id, revision: refresh(), affected: Object.freeze([...affected].sort()), dependencies: Object.freeze(dependencies) }) };
      },
      selectProvider(environment, id, kind, contractId, providerId, expectedRevision) {
        const captured = { ...environment }; return serial(async () => {
          if (!matches(captured)) return failure('STALE', 'Plugin environment changed.');
          if (!managed.has(id)) return failure('NOT_FOUND', 'Plugin is not managed in this environment.');
          if (!Number.isSafeInteger(expectedRevision) || refresh() !== expectedRevision) return failure('STALE', 'Dependency plan revision is stale.');
          const requirement = managed.get(id)!.manifest.requires.find(item => item.kind === kind && item.id === contractId);
          const provider = managed.get(providerId)?.manifest ?? registered(providerId)?.manifest;
          if (!requirement || !provider?.provides.some(item => item.kind === kind && item.id === contractId && versionSatisfies(item.version, requirement.range))) return failure('CONFLICT', 'Provider does not satisfy the declared dependency.');
          if (registered(id) && !registered(providerId)) return failure('CONFLICT', 'Enable the chosen provider before rebinding a registered consumer.');
          if (registered(id)) await kernel.rebindProvider(id, kind, contractId, providerId);
          let selections = choices.get(id); if (!selections) choices.set(id, selections = new Map());
          selections.set(`${kind}:${contractId}`, providerId);
          logger.info(ctx.pluginId, 'Plugin provider selection changed', { data: { pluginId: id, kind, contractId, providerId } });
          return { ok: true, value: null };
        });
      },
      suspend(environment, id) {
        const captured = { ...environment }; return serial(async () => {
          if (!matches(captured)) return failure('STALE', 'Plugin environment changed.');
          const definition = managed.get(id); if (!definition) return failure('NOT_FOUND', 'Plugin is not managed in this environment.');
          if (nextCheckpoint >= Number.MAX_SAFE_INTEGER) return failure('CONFLICT', 'Update checkpoint sequence exhausted.');
          if ([...checkpoints.values()].some(checkpoint => checkpoint.id === id)) return failure('CONFLICT', 'Plugin already has an update checkpoint.');
          const observed = kernel.inspect(); const affected = new Set([id]);
          for (const provider of affected) for (const item of observed.plugins) if (item.state === 'active' && (item.ownerId === provider || item.bindings.some(binding => binding.providerId === provider))) affected.add(item.manifest.id);
          const active = observed.plugins.filter(item => affected.has(item.manifest.id) && item.state === 'active').map(item => item.manifest.id);
          const grants = registered(id)?.effectivePermissions ?? [];
          if (registered(id)) await kernel.stop(id);
          const checkpoint = ++nextCheckpoint; checkpoints.set(checkpoint, { id, definition, active, grants, choices: new Map(choices.get(id)) });
          logger.info(ctx.pluginId, 'Plugin update graph suspended', { data: { pluginId: id, count: active.length } });
          return { ok: true, value: checkpoint };
        });
      },
      resume(environment, checkpoint, startTarget = false) {
        const captured = { ...environment }; return serial(async () => {
          if (!matches(captured)) return failure('STALE', 'Plugin environment changed.');
          const saved = checkpoints.get(checkpoint); if (!saved) return failure('NOT_FOUND', 'Update checkpoint is unavailable.');
          if (startTarget && !saved.active.includes(saved.id)) await start(saved.id);
          for (const id of saved.active) { if (managed.has(id)) await start(id); else await kernel.start(id); }
          logger.info(ctx.pluginId, 'Plugin update graph resumed', { data: { pluginId: saved.id } });
          return { ok: true, value: null };
        }, true);
      },
      rollback(environment, checkpoint) {
        const captured = { ...environment }; return serial(async () => {
          if (!matches(captured)) return failure('STALE', 'Plugin environment changed.');
          const saved = checkpoints.get(checkpoint); if (!saved) return failure('NOT_FOUND', 'Update checkpoint is unavailable.');
          if (registered(saved.id)) {
            await kernel.stop(saved.id);
            await kernel.replace(saved.definition, { grants: saved.grants });
          }
          managed.set(saved.id, saved.definition); choices.set(saved.id, new Map(saved.choices));
          logger.info(ctx.pluginId, 'Plugin update code rolled back while suspended', { data: { pluginId: saved.id } });
          return { ok: true, value: null };
        }, true);
      },
      finish(environment, checkpoint) {
        const captured = { ...environment }; return serial(async () => {
          if (!matches(captured)) return failure('STALE', 'Plugin environment changed.');
          if (!checkpoints.delete(checkpoint)) return failure('NOT_FOUND', 'Update checkpoint is unavailable.');
          return { ok: true, value: null };
        }, true);
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
          if (registered(definition.manifest.id)) await kernel.replace(definition, { grants: [...definition.manifest.permissions, ...definition.manifest.optionalPermissions] });
          managed.set(definition.manifest.id, definition);
        }, true);
      },
      enable(environment, id) { return operation({ ...environment }, id, () => start(id)); },
      disable(environment, id) { return operation({ ...environment }, id, async () => { if (registered(id)) await kernel.unregister(id); }); },
      remove(environment, id) { return operation({ ...environment }, id, async () => { if (registered(id)) await kernel.unregister(id); managed.delete(id); choices.delete(id); }); },
    });
    // Do not invoke kernel lifecycle from an SDK scope disposer: host shutdown
    // already owns that queue. Explicit close is required before Vault teardown.
    logger.info(ctx.pluginId, 'Lime runtime adapter ready');
  } });
}
