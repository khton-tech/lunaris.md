import { definePlugin } from "@lunaris/sdk";
import { Logger } from "@lunaris/logging";
import { AccountAccess, AccountAccessChanged } from "@lunaris/remote";
import { Localization, LocaleChanged } from "@lunaris/localization";
import { Slots } from "@lunaris/slots";
import { SlotDom } from "@lunaris/slot-dom";
import { Components, ComponentsChanged } from "@lunaris/components";
import type { MountedComponent } from "@lunaris/components";
import { Startup, StartupChanged } from "@lunaris/startup";
import { Vault, VaultCreation, VaultLocations, VaultChanged, VaultHistory, VaultHistoryChanged } from "@lunaris/vault";
import type { RecentVault } from "@lunaris/vault";
import { validDirectoryName } from "@lunaris/filesystem";
import type { FolderLocation } from "@lunaris/filesystem";
import { catalogs } from "./catalog.js";
import manifest from "../manifest.json" with { type: "json" };

const role = "lunaris.vault-selector";
type Mode = "create" | "select";

export function createVaultSelector(options: { readonly art: string; readonly hideWhenVaultOpen?: boolean; readonly restoreLastVault?: boolean }) {
  const art = options.art;
  if (typeof art !== "string" || !art.trim()) throw new TypeError("Selector artwork is required.");
  return definePlugin({ manifest, async activate(ctx) {
    const logger = ctx.use(Logger);
    try {
      const localization = ctx.use(Localization);
      const registered = localization.register(ctx.pluginId, catalogs, ctx.signal);
      if (!registered.ok) throw new Error("Cannot register selector messages.", { cause: registered.error });
      const slots = ctx.use(Slots); const targets = ctx.use(SlotDom); const components = ctx.use(Components);
      const creation = ctx.use(VaultCreation);
      const startup = ctx.use(Startup); const vaults = ctx.use(Vault); const locations = ctx.use(VaultLocations); const history = ctx.use(VaultHistory);
      const accountAccess = ctx.permissions.has("account.access") ? ctx.optional(AccountAccess) : undefined;
      const forms: Record<Mode, { location: FolderLocation | null; name: string }> = { create: { location: null, name: "" }, select: { location: null, name: "" } };
      let mode: Mode | null = null; let busy = false; let operation = "working"; let errorKey = ""; let historyFailed = false;
      let entries: readonly RecentVault[] = []; let historyVersion = 0; let current = vaults.current(); let activeReference: string | null = null;
      let latest = startup.snapshot(); let mounted: MountedComponent | undefined; let allocated = false;
      let screen = ctx.scope.child();
      const slotId = `${ctx.pluginId}.screen`;
      const text = (key: string) => localization.text(ctx.pluginId, key);
      function failure(error: { readonly code: string }): string {
        if (error.code === "ALREADY_EXISTS") return "exists";
        if (["INVALID_PATH", "INVALID_ARGUMENT"].includes(error.code)) return "invalidName";
        if (["NOT_FOUND", "NOT_DIRECTORY"].includes(error.code)) return "missing";
        if (error.code === "ACCESS_DENIED") return "denied";
        if (["PREPARATION_FAILED", "INVALID_CONFIG", "INVALID_TOML"].includes(error.code)) return "config";
        if (error.code === "CONFLICT") return "conflict";
        if (error.code === "BUSY") return "busy";
        if (error.code === "UNSUPPORTED") return "unsupported";
        return "error";
      }
      function render(): void {
        if (ctx.signal.aborted || latest.state !== "loaded") return;
        if ((options.hideWhenVaultOpen && current) || accountAccess?.visible()) {
          mounted = undefined; allocated = false;
          void screen.dispose().catch(error => { if (!ctx.signal.aborted) logger.error(ctx.pluginId, "Cannot release selector surface", { code: "SELECTOR_RELEASE_FAILED", error }); });
          return;
        }
        if (!allocated) {
          if (screen.signal.aborted) screen = ctx.scope.child();
          const result = slots.create({ id: slotId, grow: 1 }, screen.signal);
          if (!result.ok) throw new Error("Cannot allocate selector slot.", { cause: result.error });
          allocated = true;
        }
        const form = mode ? forms[mode] : null;
        const props = { presentation: { mode: "standalone", sizing: "fill" }, art, text: Object.fromEntries(Object.keys(catalogs.en).filter(key => key !== "opened").map(key => [key, text(key === "folder" && mode === "create" ? "parentFolder" : key)])), mode, activeReference,
          folder: form?.location?.label ?? "", name: form?.name ?? "", busy,
          canContinue: !!form?.location && (mode !== "create" || validDirectoryName(form.name.trim())),
          error: errorKey ? text(errorKey) : "", historyError: historyFailed ? text("historyError") : "",
          status: busy ? text(operation) : current ? localization.text(ctx.pluginId, "opened", { name: current.name }) : "",
          entries: entries.map(entry => ({ reference: entry.location.reference, name: entry.name, label: entry.location.label })),
          onMode(next: Mode) { if (!busy) { mode = mode === next ? null : next; errorKey = ""; refresh(); } },
          onName(name: string) { if (!busy && mode) { forms[mode].name = name; errorKey = ""; refresh(); } },
          onBrowse: browse, onNext: next, onRecent: recent, onRetry: () => run(loadHistory, "refreshing"),
          ...(accountAccess ? { onServer: () => accountAccess.open() } : {}),
        };
        if (mounted) {
          const result = mounted.update(props);
          if (result.ok) return;
          if (result.error.code !== "NOT_FOUND") throw new Error("Cannot update selector.", { cause: result.error });
          mounted = undefined;
        }
        if (!components.has(role)) return;
        const target = targets.get(slotId);
        if (!target) throw new Error("Selector rendering target is unavailable.");
        const result = components.mount(role, target, props, screen.signal);
        if (!result.ok) throw new Error("Cannot mount selector.", { cause: result.error });
        mounted = result.value;
        logger.debug(ctx.pluginId, "Vault selector mounted");
      }
      function refresh(): void {
        try { render(); }
        catch (error) { if (!ctx.signal.aborted) logger.error(ctx.pluginId, "Cannot render Vault selector", { code: "SELECTOR_RENDER_FAILED", error }); throw error; }
      }
      if (accountAccess) ctx.events.on(AccountAccessChanged, refresh);
      async function loadHistory(): Promise<void> {
        const version = historyVersion;
        const result = await history.list();
        if (ctx.signal.aborted || version !== historyVersion) return;
        historyFailed = !result.ok;
        if (result.ok) entries = result.value;
        else logger.warn(ctx.pluginId, "Recent Vault history is unavailable", { code: result.error.code, error: result.error });
      }
      function run(work: () => Promise<void>, status = "working"): void {
        if (busy || ctx.signal.aborted) return;
        busy = true; operation = status; errorKey = "";
        void (async () => {
          try { refresh(); await work(); }
          catch (error) {
            if (!ctx.signal.aborted) { errorKey = "error"; logger.error(ctx.pluginId, "Vault selector operation failed", { code: "SELECTOR_OPERATION_FAILED", error }); }
          } finally { busy = false; if (!ctx.signal.aborted) refresh(); }
        })().catch(error => { if (!ctx.signal.aborted) logger.error(ctx.pluginId, "Cannot refresh selector after operation", { code: "SELECTOR_RENDER_FAILED", error }); });
      }
      function browse(): void {
        if (!mode || busy) return;
        const form = forms[mode];
        run(async () => {
          const result = await locations.select(ctx.signal);
          if (ctx.signal.aborted) return;
          if (!result.ok) { errorKey = failure(result.error); logger.warn(ctx.pluginId, "Folder selection failed", { code: result.error.code, error: result.error }); }
          else if (result.value) { form.location = result.value; logger.debug(ctx.pluginId, "Folder selected"); }
        }, "choosing");
      }
      function next(): void {
        if (!mode || busy) return;
        const form = forms[mode]; const location = form.location;
        if (!location || (mode === "create" && !validDirectoryName(form.name.trim()))) return;
        const creating = mode === "create"; const name = form.name.trim();
        run(async () => {
          const result = creating ? await creation.create(location, name) : await locations.open(location);
          if (ctx.signal.aborted) return;
          if (!result.ok) { errorKey = failure(result.error); logger.error(ctx.pluginId, "Cannot open selected Vault", { code: result.error.code, error: result.error }); }
          else { current = vaults.current(); if (!creating) activeReference = current?.id === result.value.id ? location.reference : null; mode = null; logger.info(ctx.pluginId, "Vault opened from selector", { code: "SELECTOR_VAULT_OPENED" }); }
        });
      }
      function recent(reference: string): void {
        if (busy) return; mode = null;
        run(async () => {
          const result = await history.open(reference);
          if (ctx.signal.aborted) return;
          if (!result.ok) { errorKey = failure(result.error); logger.warn(ctx.pluginId, "Cannot reopen recent Vault", { code: result.error.code, error: result.error }); }
          else { current = vaults.current(); activeReference = current?.id === result.value.id ? reference : null; logger.info(ctx.pluginId, "Recent Vault opened", { code: "SELECTOR_RECENT_OPENED" }); }
        });
      }
      ctx.events.on(StartupChanged, snapshot => { if (snapshot.sequence <= latest.sequence) return; latest = snapshot; refresh(); });
      ctx.events.on(LocaleChanged, refresh);
      ctx.events.on(VaultChanged, change => {
        const previousId = current?.id;
        current = vaults.current();
        if (current?.id === change.current?.id) activeReference = change.location?.reference ?? null;
        else if (current?.id !== previousId) activeReference = null;
        refresh();
      });
      ctx.events.on(VaultHistoryChanged, change => { historyVersion++; entries = change.entries; historyFailed = false; refresh(); });
      ctx.events.on(ComponentsChanged, change => {
        if (change.componentId !== role) return;
        if (change.kind === "removed") { mounted = undefined; logger.warn(ctx.pluginId, "Selector component removed; waiting for replacement", { code: "SELECTOR_COMPONENT_MISSING" }); }
        else refresh();
      });
      await loadHistory(); ctx.signal.throwIfAborted();
      // Restore once before startup handoff; history is ordered most-recent-first.
      const last = entries[0];
      if (options.restoreLastVault !== false && !vaults.current() && last) {
        try {
          const result = await history.open(last.location.reference);
          ctx.signal.throwIfAborted();
          if (result.ok) {
            current = vaults.current();
            activeReference = current?.id === result.value.id ? last.location.reference : null;
            logger.info(ctx.pluginId, "Last Vault restored", { code: "SELECTOR_VAULT_RESTORED" });
          } else {
            errorKey = failure(result.error);
            logger.warn(ctx.pluginId, "Cannot restore last Vault; showing selector", { code: result.error.code, error: result.error });
          }
        } catch (error) {
          ctx.signal.throwIfAborted();
          errorKey = "error";
          logger.error(ctx.pluginId, "Last Vault restoration failed; showing selector", { code: "SELECTOR_RESTORE_FAILED", error });
        }
      }
      latest = startup.snapshot(); refresh();
      if (!components.has(role)) logger.warn(ctx.pluginId, "Waiting for selector component", { code: "SELECTOR_COMPONENT_MISSING" });
      logger.info(ctx.pluginId, "Vault selector ready", { code: "SELECTOR_READY" });
    } catch (error) {
      if (!ctx.signal.aborted) logger.error(ctx.pluginId, "Cannot activate Vault selector", { code: "SELECTOR_ACTIVATION_FAILED", error });
      throw error;
    }
  } });
}
