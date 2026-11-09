import { definePlugin } from "@lunaris/sdk";
import { Logger, scopeLogger } from "@lunaris/logging";
import { Startup, StartupChanged, isStartupSnapshot } from "@lunaris/startup";
import type { StartupSnapshot } from "@lunaris/startup";
import manifest from "../manifest.json" with { type: "json" };

/** Trusted host ingress. Product consumers only receive the read-only SDK API. */
export function createStartupProvider() {
  let snapshot: StartupSnapshot = Object.freeze({ sequence: 0, state: "loading", stage: "composition" });
  let publish: ((value: StartupSnapshot) => void) | undefined;
  let closed = false;
  const plugin = definePlugin({ manifest, activate(ctx) {
    const logger = scopeLogger(ctx.use(Logger), ctx.signal);
    closed = false;
    ctx.provide(Startup, { snapshot: () => snapshot });
    publish = value => {
      if (ctx.signal.aborted) return;
      logger.info(ctx.pluginId, "Startup state changed", { data: value });
      void ctx.events.emit(StartupChanged, value).catch(error => {
        if (!ctx.signal.aborted) logger.error(ctx.pluginId, "Cannot publish startup state", { code: "STARTUP_EVENT_FAILED", error });
      });
    };
    ctx.scope.own({ dispose() { publish = undefined; closed = true; } });
    logger.info(ctx.pluginId, "Startup provider ready", { code: "STARTUP_READY" });
  } });
  return {
    plugin,
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
