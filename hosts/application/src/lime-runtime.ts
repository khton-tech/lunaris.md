import { definePlugin, LunarisError } from "@lunaris/sdk";
import { versionSatisfies } from '@lunaris/manifest';
import type { PluginDefinition, PluginManifest } from "@lunaris/sdk";
import type { Kernel } from "@lunaris/kernel";
import { Logger } from "@lunaris/logging";
import { Vault, VaultPreservation } from "@lunaris/vault";
import { PluginLoader } from "@lunaris/execution";
import type { ExecutionSource } from "@lunaris/execution";
import { LimeCompositionRuntime, LimeRuntime } from "@lunaris/lime";
import type { LimeCompositionProfile, LimeDependency, LimeEnvironment, LimeResult } from "@lunaris/lime";

const defaultComposition: LimeCompositionProfile = Object.freeze({ bindings: Object.freeze([]), disabledBuiltins: Object.freeze([]) });
const compareIds = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;

/** Privileged host composition. Lime receives only the public token, never Kernel. */
export function createLimeRuntime(kernel: Kernel, builtinIds: readonly string[], options: {
  readonly safeMode?: boolean;
  readonly protect?: readonly string[];
  readonly observeCheckpoints?: (ids: ReadonlySet<string>) => void;
} = {}) {
  const builtin = new Set(builtinIds);
  const protectedRoots = new Set(['lunaris.lime-runtime-adapter', 'lunaris.lime', ...options.protect ?? []]);
  return definePlugin({ manifest: { manifestVersion: 1, id: 'lunaris.lime-runtime-adapter', version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './dist/lime-runtime.js',
    provides: [LimeRuntime, LimeCompositionRuntime].map(token => ({ kind: token.kind, id: token.id, version: token.version })),
    requires: [{ kind: 'api', id: Logger.id, range: '^1.0.0' }, { kind: 'api', id: Vault.id, range: '^1.0.0' },
      { kind: 'api', id: PluginLoader.id, range: '^1.0.0' },
      { kind: 'api', id: VaultPreservation.id, range: '^1.0.0', optional: true }], permissions: ['runtime.manage', 'vault.access'], optionalPermissions: [],
  }, activate(ctx) {
    const logger = ctx.use(Logger);
    const execution = ctx.use(PluginLoader);
    const preservation = ctx.optional(VaultPreservation);
    const managed = new Map<string, PluginDefinition>(); let current: LimeEnvironment | null = null; let tail = Promise.resolve(); let generation = 0;
    const choices = new Map<string, Map<string, string>>(); let revision = 0; let signature = '';
    const checkpoints = new Map<number, { id: string; definition: PluginDefinition; active: readonly string[]; grants: readonly string[]; choices: Map<string, string> }>(); let nextCheckpoint = 0;
    let composition = defaultComposition;
    let safeMode = options.safeMode ?? false;
    const publishCheckpoints = () => options.observeCheckpoints?.(new Set([...checkpoints.values()].flatMap(saved => saved.active).filter(id => builtin.has(id))));
    const protectedServices = () => {
      const ids = new Set(protectedRoots);
      const plugins = new Map(kernel.inspect().plugins.map(plugin => [plugin.manifest.id, plugin]));
      for (const id of ids) {
        const plugin = plugins.get(id);
        if (plugin?.ownerId) ids.add(plugin.ownerId);
        for (const binding of plugin?.bindings ?? []) if (binding.providerId) ids.add(binding.providerId);
      }
      return ids;
    };
    const refresh = (): number => {
      const observed = JSON.stringify(kernel.inspect().plugins.map(item => [item.manifest, item.state, item.activationId, item.ownerId, item.suspended, item.bindings, item.effectivePermissions]));
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
      await kernel.applyComposition(defaultComposition, protectedServices());
      composition = defaultComposition;
      for (const id of [...managed.keys()].sort().reverse()) { if (registered(id)) await kernel.unregister(id); managed.delete(id); }
      for (const id of new Set([...checkpoints.values()].flatMap(saved => saved.active))) if (builtin.has(id)) await kernel.start(id);
      current = null; choices.clear(); checkpoints.clear(); publishCheckpoints();
    };
    ctx.provide(LimeCompositionRuntime, {
      snapshot(environment) {
        if (!matches(environment)) return failure('STALE', 'Plugin environment changed.');
        const protectedIds = protectedServices();
        const builtins = kernel.inspect().plugins.flatMap(item => builtin.has(item.manifest.id) ? [
          Object.freeze({ id: item.manifest.id, version: item.manifest.version, state: item.suspended ? 'disabled' : item.state, mutable: !protectedIds.has(item.manifest.id) }),
        ] : []);
        return { ok: true, value: Object.freeze({ revision: refresh(), profile: composition, builtins: Object.freeze(builtins) }) };
      },
      apply(environment, profile, expectedRevision) {
        const captured = { ...environment };
        const next = Object.freeze({
          bindings: Object.freeze(profile.bindings.map(binding => Object.freeze({ ...binding }))),
          disabledBuiltins: Object.freeze([...profile.disabledBuiltins].sort(compareIds)),
        });
        return serial(async () => {
          if (!matches(captured)) return failure('STALE', 'Plugin environment changed.');
          if (!Number.isSafeInteger(expectedRevision) || refresh() !== expectedRevision) return failure('STALE', 'Composition revision is stale.');
          if (safeMode && (next.bindings.length || next.disabledBuiltins.length)) return failure('CONFLICT', 'Safe mode restores the default composition.');
          const protectedIds = protectedServices();
          const disabled = new Set(next.disabledBuiltins);
          if (disabled.size !== next.disabledBuiltins.length || [...disabled].some(id => !builtin.has(id) || protectedIds.has(id) || !registered(id))) {
            return failure('CONFLICT', 'Composition can only disable mutable built-in plugins.');
          }
          for (const binding of next.bindings) {
            if (!builtin.has(binding.consumerId) || protectedIds.has(binding.consumerId) || disabled.has(binding.consumerId) ||
              disabled.has(binding.providerId) || !registered(binding.consumerId) || !registered(binding.providerId) ||
              (managed.has(binding.providerId) && registered(binding.providerId)?.state !== 'active')) {
              return failure('CONFLICT', 'Choose an available provider for a mutable built-in consumer.');
            }
          }
          if (!next.bindings.length && !next.disabledBuiltins.length && composition === defaultComposition) return { ok: true, value: null };
          const lease = await preservation?.lock(captured.vaultId);
          if (lease && !lease.ok) return failure('CONFLICT', lease.error.message);
          try {
            if (refresh() !== expectedRevision) return failure('STALE', 'Composition revision is stale.');
            await kernel.applyComposition(next, protectedIds);
          } catch (error) {
            if (error instanceof LunarisError && ['PROVIDER_MISSING', 'PROVIDER_AMBIGUOUS', 'DEPENDENCY_CYCLE', 'LIFECYCLE_INVALID'].includes(error.code)) return failure('CONFLICT', error.message);
            throw error;
          } finally { if (lease?.ok) await lease.value.dispose(); }
          composition = next.bindings.length || next.disabledBuiltins.length ? next : defaultComposition;
          logger.info(ctx.pluginId, 'Vault composition applied', { data: { bindings: next.bindings.length, disabled: next.disabledBuiltins.length } });
          return { ok: true, value: null };
        });
      },
    });
    ctx.provide(LimeRuntime, {
      open(environment, policy) { const captured = { ...environment }; const nextSafeMode = policy?.safeMode ?? options.safeMode ?? false; return serial(async () => {
        if (!captured.vaultId || !Number.isSafeInteger(captured.generation) || captured.generation <= generation) return failure('STALE', 'Environment generation must increase.');
        const lease = current && composition !== defaultComposition ? await preservation?.lock(current.vaultId) : undefined;
        if (lease && !lease.ok) return failure('CONFLICT', lease.error.message);
        try { await release(); } finally { if (lease?.ok) await lease.value.dispose(); }
        current = Object.freeze(captured); generation = captured.generation; safeMode = nextSafeMode;
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
      plan(environment, id, candidate) {
        if (!matches(environment)) return failure('STALE', 'Plugin environment changed.');
        if (candidate && candidate.id !== id) return failure('CONFLICT', 'Candidate identity does not match the plan target.');
        const manifest = candidate ?? managed.get(id)?.manifest ?? (builtin.has(id) ? registered(id)?.manifest : undefined);
        if (!manifest) return failure('NOT_FOUND', 'Plugin is not available in this environment.');
        const snapshot = kernel.inspect(); const affected = new Set([id]);
        for (const provider of affected) for (const item of snapshot.plugins) if (item.state === 'active' && (item.ownerId === provider || item.bindings.some(binding => binding.providerId === provider))) affected.add(item.manifest.id);
        const available = new Map<string, { manifest: PluginManifest; state: string }>(snapshot.plugins.map(item => [item.manifest.id, { manifest: item.manifest, state: item.suspended ? 'disabled' : item.state }]));
        for (const [pluginId, candidate] of managed) if (!available.has(pluginId)) available.set(pluginId, { manifest: candidate.manifest, state: 'disabled' });
        available.set(id, { manifest, state: available.get(id)?.state ?? 'candidate' });
        const bindings = new Map(snapshot.plugins.map(item => [item.manifest.id, item.bindings]));
        const describe = (consumer: PluginManifest): readonly LimeDependency[] => Object.freeze(consumer.requires.map(requirement => {
          const candidates = [...available].flatMap(([pluginId, item]) => {
            if (pluginId === consumer.id) return [];
            const provided = item.manifest.provides.find(provided => provided.kind === requirement.kind && provided.id === requirement.id && versionSatisfies(provided.version, requirement.range));
            return provided ? [Object.freeze({ id: pluginId, version: provided.version, state: item.state })] : [];
          }).sort((a, b) => a.id < b.id ? -1 : 1);
          const key = `${requirement.kind}:${requirement.id}`;
          const selected = composition.bindings.find(binding => binding.consumerId === consumer.id && `${binding.kind}:${binding.contractId}` === key)?.providerId ??
            choices.get(consumer.id)?.get(key) ?? bindings.get(consumer.id)?.find(binding => binding.contract === key)?.providerId;
          return Object.freeze({ kind: requirement.kind, id: requirement.id, range: requirement.range, optional: requirement.optional === true, ...(selected ? { selected } : {}), candidates: Object.freeze(candidates) });
        }));
        const graph = [];
        const reachable = new Set([id]);
        for (const pluginId of reachable) {
          const dependencies = describe(available.get(pluginId)!.manifest);
          graph.push(Object.freeze({ pluginId, dependencies }));
          for (const requirement of dependencies) for (const provider of requirement.candidates) reachable.add(provider.id);
        }
        return { ok: true, value: Object.freeze({ pluginId: id, revision: refresh(), affected: Object.freeze([...affected].sort()), dependencies: graph[0]!.dependencies, graph: Object.freeze(graph) }) };
      },
      selectProvider(environment, id, kind, contractId, providerId, expectedRevision) {
        const captured = { ...environment }; return serial(async () => {
          if (!matches(captured)) return failure('STALE', 'Plugin environment changed.');
          if (!managed.has(id)) return failure('NOT_FOUND', 'Plugin is not managed in this environment.');
          if (!Number.isSafeInteger(expectedRevision) || refresh() !== expectedRevision) return failure('STALE', 'Dependency plan revision is stale.');
          const requirement = managed.get(id)!.manifest.requires.find(item => item.kind === kind && item.id === contractId);
          const provider = managed.get(providerId)?.manifest ?? registered(providerId)?.manifest;
          if (providerId === id || !requirement || !provider?.provides.some(item => item.kind === kind && item.id === contractId && versionSatisfies(item.version, requirement.range))) return failure('CONFLICT', 'Provider does not satisfy the declared dependency.');
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
          const lease = active.some(activeId => builtin.has(activeId)) ? await preservation?.lock(captured.vaultId) : undefined;
          if (lease && !lease.ok) return failure('CONFLICT', lease.error.message);
          const checkpoint = ++nextCheckpoint;
          checkpoints.set(checkpoint, { id, definition, active, grants, choices: new Map(choices.get(id)) });
          publishCheckpoints();
          try {
            if (registered(id)) await kernel.stop(id);
            for (const activeId of active) if (registered(activeId)?.state === 'active') await kernel.stop(activeId);
          }
          catch (error) { checkpoints.delete(checkpoint); publishCheckpoints(); throw error; }
          finally { if (lease?.ok) await lease.value.dispose(); }
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
          publishCheckpoints();
          return { ok: true, value: null };
        }, true);
      },
      register(environment, manifest, source, enabled) {
        const captured = { ...environment };
        const definition = execution.load(manifest, source, captured, ctx.signal);
        const metadata = definition.manifest;
        return serial(async () => {
          if (!matches(captured)) return failure('STALE', 'Plugin environment changed.');
          if (builtin.has(metadata.id) || protectedRoots.has(metadata.id) || managed.has(metadata.id) || registered(metadata.id)) return failure('CONFLICT', 'Plugin ID collides with a registered or built-in plugin.');
          managed.set(metadata.id, definition);
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
      disable(environment, id) { return unregister(environment, id, false); },
      remove(environment, id) { return unregister(environment, id, true); },
    });
    function unregister(environment: LimeEnvironment, id: string, remove: boolean): Promise<LimeResult<null>> {
      const captured = { ...environment };
      return serial(async () => {
        if (!matches(captured)) return failure('STALE', 'Plugin environment changed.');
        if (!managed.has(id)) return failure('NOT_FOUND', 'Plugin is not managed in this environment.');
        if (composition.bindings.some(binding => binding.providerId === id)) return failure('CONFLICT', 'Release the package from the composition before disabling it.');
        if (registered(id)) await kernel.unregister(id);
        if (remove) { managed.delete(id); choices.delete(id); }
        logger.info(ctx.pluginId, 'Plugin runtime state changed', { data: { pluginId: id } });
        return { ok: true, value: null };
      });
    }
    // Do not invoke kernel lifecycle from an SDK scope disposer: host shutdown
    // already owns that queue. Explicit close is required before Vault teardown.
    logger.info(ctx.pluginId, 'Lime runtime adapter ready');
  } });
}
