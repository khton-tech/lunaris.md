import { definePlugin } from "@lunaris/sdk";
import { Logger, scopeLogger } from "@lunaris/logging";
import { Startup, StartupChanged, isStartupSnapshot } from "@lunaris/startup";
import type { StartupSnapshot } from "@lunaris/startup";
import { Preparation, PreparationChanged } from "@lunaris/startup";
import type { CancellationSignal } from "@lunaris/sdk";
import { Vault, VaultLifecycle } from "@lunaris/vault";
import { createPreparation } from "./preparation.js";
import manifest from "../manifest.json" with { type: "json" };

/** Trusted host ingress. Product consumers only receive the read-only SDK API. */
export function createStartupProvider() {
  let snapshot: StartupSnapshot = Object.freeze({ sequence: 0, state: "loading", stage: "composition" });
  let publish: ((value: StartupSnapshot) => void) | undefined;
  let closed = false;
  let currentVault: (() => string | null) | undefined;
  let reportFailure: ((error: unknown) => void) | undefined;
  let preparation: ReturnType<typeof createPreparation> | undefined;
  const plugin = definePlugin({ manifest, activate(ctx) {
    const logger = scopeLogger(ctx.use(Logger), ctx.signal);
    closed = false;
    const vault = ctx.permissions.has("vault.access") ? ctx.optional(Vault) : undefined;
    const lifecycle = ctx.permissions.has("vault.access") ? ctx.optional(VaultLifecycle) : undefined;
    currentVault = () => vault?.current()?.id ?? null;
    reportFailure = error => { if (!ctx.signal.aborted) logger.error(ctx.pluginId, "Application preparation failed", { error }); };
    preparation = createPreparation(async value => {
      if (ctx.signal.aborted) return;
      logger.debug(ctx.pluginId, "Preparation state changed", { data: value });
      await ctx.events.emit(PreparationChanged, value);
    }, 15000, !!vault && !!lifecycle, currentVault);
    ctx.provide(Preparation, preparation.api);
    if (ctx.permissions.has("vault.access")) {
      const result = lifecycle?.register({ id: ctx.pluginId, settlementOrder: 100, async beforeRelease() { return { ok: true, value: null }; },
        async settled(_previous, current) {
          try { await preparation!.run(current?.id ?? null, ctx.signal); }
          catch (error) { if (!ctx.signal.aborted) logger.error(ctx.pluginId, "Vault preparation failed", { error }); throw error; }
        },
      }, ctx.signal);
      if (result && !result.ok) throw new Error("Cannot register Vault preparation.", { cause: result.error });
    }
    ctx.provide(Startup, { snapshot: () => snapshot });
    publish = value => {
      if (ctx.signal.aborted) return;
      logger.info(ctx.pluginId, "Startup state changed", { data: value });
      void ctx.events.emit(StartupChanged, value).catch(error => {
        if (!ctx.signal.aborted) logger.error(ctx.pluginId, "Cannot publish startup state", { code: "STARTUP_EVENT_FAILED", error });
      });
    };
    ctx.scope.own({ dispose() { preparation?.dispose(); publish = undefined; closed = true; } });
    logger.info(ctx.pluginId, "Startup provider ready", { code: "STARTUP_READY" });
  } });
  return {
    plugin,
    async prepare(signal: CancellationSignal): Promise<void> {
      if (!preparation || closed) throw new Error("Preparation provider is unavailable.");
      try { await preparation.run(currentVault?.() ?? null, signal); }
      catch (error) { reportFailure?.(error); throw error; }
    },
    update(value: StartupSnapshot): boolean {
      if (closed) return false;
      if (!isStartupSnapshot(value)) throw new TypeError("Invalid startup snapshot.");
      if (value.sequence <= snapshot.sequence) return false;
      snapshot = Object.freeze({ sequence: value.sequence, state: value.state, stage: value.stage,
        ...(value.pluginId === undefined ? {} : { pluginId: value.pluginId }),
        ...(value.errorCode === undefined ? {} : { errorCode: value.errorCode }),
      });
      publish?.(snapshot);
      return true;
    },
  };
}
