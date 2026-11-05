import { definePlugin } from "@lunaris/sdk";
import { Logger } from "@lunaris/logging";
import { Config } from "@lunaris/config";
import { Localization, LocaleChanged } from "@lunaris/localization";
import { Slots } from "@lunaris/slots";
import { SlotDom } from "@lunaris/slot-dom";
import { Components, ComponentsChanged } from "@lunaris/components";
import type { ComponentProps, MountedComponent } from "@lunaris/components";
import { Startup, StartupChanged } from "@lunaris/startup";
import type { StartupSnapshot } from "@lunaris/startup";
import { catalogs } from "./catalog.js";
import manifest from "../manifest.json" with { type: "json" };

const role = "lunaris.startup-screen";

/** Artwork is supplied by trusted composition, with no filesystem/host imports. */
export function createRunner(options: { readonly art: string }) {
  const art = options.art;
  if (typeof art !== "string" || art.trim().length === 0) throw new TypeError("Runner artwork is required.");
  return definePlugin({ manifest, async activate(ctx) {
    const logger = ctx.use(Logger);
    try {
      logger.debug(ctx.pluginId, "Reading runner startup settings");
      const read = await ctx.use(Config).read(ctx.pluginId);
      ctx.signal.throwIfAborted();
      if (!read.ok) throw new Error("Cannot read runner settings.", { cause: read.error });
      const showDetails = read.value.showDetails ?? true;
      if (typeof showDetails !== "boolean") throw new TypeError("Runner showDetails must be a boolean.");

      const localization = ctx.use(Localization);
      const registered = localization.register(ctx.pluginId, catalogs, ctx.signal);
      if (!registered.ok) throw new Error("Cannot register runner messages.", { cause: registered.error });
      const slots = ctx.use(Slots);
      const targets = ctx.use(SlotDom);
      const components = ctx.use(Components);
      const startup = ctx.use(Startup);
      const slotId = `${ctx.pluginId}.screen`;
      const allocated = slots.create({ id: slotId, grow: 1 }, ctx.signal);
      if (!allocated.ok) throw new Error("Cannot allocate runner slot.", { cause: allocated.error });
      if (!targets.get(slotId)) throw new Error("Runner rendering target is unavailable.");

      let mounted: MountedComponent | undefined;
      let latest: StartupSnapshot | undefined;
      function props(): ComponentProps {
        const snapshot = latest!;
        const text = (key: string) => localization.text(ctx.pluginId, key);
        let detail = "";
        if (showDetails && snapshot.state === "loading") {
          detail = snapshot.stage === "activation" ? snapshot.pluginId ?
            localization.text(ctx.pluginId, "activation", { plugin: snapshot.pluginId }) : text("activationGeneric") : text(snapshot.stage);
        } else if (showDetails && snapshot.state === "failed" && snapshot.errorCode) {
          detail = localization.text(ctx.pluginId, "failureDetail", { code: snapshot.errorCode });
        }
        return { art, logoLabel: text("logo"), status: text(snapshot.state), detail };
      }
      function render(): void {
        if (!latest || ctx.signal.aborted) return;
        const next = props();
        if (mounted) {
          const updated = mounted.update(next);
          if (updated.ok) return;
          if (updated.error.code !== "NOT_FOUND") throw new Error("Cannot update runner screen.", { cause: updated.error });
          mounted = undefined;
        }
        if (!components.has(role)) return;
        const target = targets.get(slotId);
        if (!target) throw new Error("Runner rendering target was removed.");
        const result = components.mount(role, target, next, ctx.signal);
        if (!result.ok) throw new Error("Cannot mount runner screen.", { cause: result.error });
        mounted = result.value;
        logger.debug(ctx.pluginId, "Runner screen mounted");
      }
      function refresh(): void {
        try { render(); }
        catch (error) {
          if (!ctx.signal.aborted) logger.error(ctx.pluginId, "Cannot render runner screen", { code: "RUNNER_RENDER_FAILED", error });
          throw error;
        }
      }
      ctx.events.on(StartupChanged, snapshot => {
        if (latest && snapshot.sequence <= latest.sequence) return;
        latest = snapshot;
        refresh();
        if (snapshot.state === "loaded") logger.info(ctx.pluginId, "System loaded", { code: "RUNNER_LOADED" });
        else logger.debug(ctx.pluginId, "Runner milestone changed", { data: { state: snapshot.state, stage: snapshot.stage } });
      });
      ctx.events.on(LocaleChanged, refresh);
      ctx.events.on(ComponentsChanged, change => {
        if (change.componentId !== role) return;
        if (change.kind === "removed") {
          mounted = undefined;
          logger.warn(ctx.pluginId, "Startup screen component removed; waiting for replacement", { code: "RUNNER_COMPONENT_MISSING" });
        } else refresh();
      });
      // Subscribe first, then capture the current host milestone for late activation.
      latest = startup.snapshot();
      refresh();
      if (!mounted) logger.warn(ctx.pluginId, "Waiting for startup screen component", { code: "RUNNER_COMPONENT_MISSING" });
      logger.info(ctx.pluginId, "Runner ready", { code: "RUNNER_READY" });
      // Scope cancellation releases the slot, component, catalog and subscriptions.
      // Cleanup never invokes SDK handles after scope closure.
    } catch (error) {
      if (!ctx.signal.aborted) logger.error(ctx.pluginId, "Cannot activate runner", { code: "RUNNER_ACTIVATION_FAILED", error });
      throw error;
    }
  } });
}
