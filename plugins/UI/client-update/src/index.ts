import { definePlugin, isSdkUnavailable } from "@lunaris/sdk";
import { Logger, scopeLogger } from "@lunaris/logging";
import { ClientUpdates, ClientUpdateChanged, ApplicationReload } from "@lunaris/remote";
import { Vault } from "@lunaris/vault";
import { Components, ComponentsChanged } from "@lunaris/components";
import type { MountedComponent } from "@lunaris/components";
import { Slots } from "@lunaris/slots";
import { SlotDom } from "@lunaris/slot-dom";
import { Localization, LocaleChanged } from "@lunaris/localization";

export default definePlugin({ manifest: { manifestVersion: 1, id: "lunaris.client-update-ui", version: "0.1.0", engine: "^0.1.0", sdk: "^0.1.0", entry: "./dist/index.js",
  provides: [], requires: [Logger, ClientUpdates, ClientUpdateChanged, ApplicationReload, Vault, Components, ComponentsChanged, Slots, SlotDom, Localization, LocaleChanged].map(t => ({ kind: t.kind, id: t.id, range: `^${t.version}` })),
  permissions: ["application.update", "application.reload", "vault.access", "ui.dom"], optionalPermissions: [] }, activate(ctx) {
  const logger = scopeLogger(ctx.use(Logger), ctx.signal); const updates = ctx.use(ClientUpdates); const reload = ctx.use(ApplicationReload); const vaults = ctx.use(Vault);
  const components = ctx.use(Components); const slots = ctx.use(Slots); const targets = ctx.use(SlotDom); const localization = ctx.use(Localization);
  localization.register(ctx.pluginId, { en: { message: "A Lunaris update is available.", action: "Save and reload", error: "Resolve unsaved changes before reloading." } }, ctx.signal);
  let screen = ctx.scope.child(); let mounted: MountedComponent | undefined; let allocated = false; let busy = false; let failed = false; let unavailable = false;
  const slotId = "lunaris.client-update.notice";
  function render() {
    if (unavailable || ctx.signal.aborted) return;
    try { renderView(); } catch (error) { if (isSdkUnavailable(error)) unavailable = true; else throw error; }
  }
  function renderView() {
    if (ctx.signal.aborted) return;
    if (!updates.available()) { mounted = undefined; allocated = false; void screen.dispose().catch(() => {}); return; }
    if (!allocated) { if (screen.signal.aborted) screen = ctx.scope.child(); const result = slots.create({ id: slotId, order: -100, grow: 0 }, screen.signal); if (!result.ok) throw Error("Cannot allocate update notice."); allocated = true; }
    const props = { message: localization.text(ctx.pluginId, "message"), action: localization.text(ctx.pluginId, "action"), error: failed ? localization.text(ctx.pluginId, "error") : "", busy,
      presentation: { mode: "standalone", sizing: "content" }, onReload() {
        if (busy || ctx.signal.aborted) return; busy = true; failed = false; render();
        void (async () => { try { const closed = await vaults.close(); if (ctx.signal.aborted) return; if (closed.ok) reload.reload(); else failed = true; }
          catch (error) { if (!ctx.signal.aborted) { failed = true; logger.error(ctx.pluginId, "Cannot prepare browser update", { error }); } }
          finally { busy = false; if (!ctx.signal.aborted) render(); } })();
      } };
    if (mounted && mounted.update(props).ok) return;
    const target = targets.get(slotId); if (!target || !components.has("lunaris.client-update")) return;
    const result = components.mount("lunaris.client-update", target, props, screen.signal); if (result.ok) mounted = result.value;
  }
  ctx.events.on(ClientUpdateChanged, render); ctx.events.on(LocaleChanged, render);
  ctx.events.on(ComponentsChanged, change => { if (change.componentId === "lunaris.client-update") { if (change.kind === "removed") mounted = undefined; render(); } });
  render(); logger.info(ctx.pluginId, "Client update notice ready");
} });
