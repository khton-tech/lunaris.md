import { definePlugin } from "@lunaris/sdk";
import type { ResourceScope } from "@lunaris/sdk";
import { Logger } from "@lunaris/logging";
import { Sidebar } from "@lunaris/sidebar";
import { Filesystem, FilesystemObservation, FileChanged } from "@lunaris/filesystem";
import { Vault, VaultChanged } from "@lunaris/vault";
import { Localization, LocaleChanged } from "@lunaris/localization";
import { ExplorerModel } from "./model.js";
import type { ExplorerDraft } from "./model.js";
import { catalogs } from "./catalog.js";
import manifest from "../manifest.json" with { type: "json" };

export default definePlugin({ manifest, activate(ctx) {
  const logger = ctx.use(Logger); const sidebar = ctx.use(Sidebar); const fs = ctx.use(Filesystem);
  const observation = ctx.use(FilesystemObservation); const vaults = ctx.use(Vault); const localization = ctx.use(Localization);
  const messages = localization.register(ctx.pluginId, catalogs, ctx.signal);
  if (!messages.ok) throw new Error("Cannot register explorer localization.", { cause: messages.error });
  const tabId = `${ctx.pluginId}.files`; let registered = false; let scheduled = false;
  let session: ResourceScope | undefined; let model: ExplorerModel | undefined; let watchId: string | undefined;
  let refreshing = false; let dirty = false;
  const text = (key: string) => localization.text(ctx.pluginId, key);
  function publish(): void {
    if (ctx.signal.aborted) return;
    const current = model;
    const props = { vaultId: current?.vaultId ?? "", data: current?.tree() ?? [], expanded: [...(current?.expanded ?? [])], selection: current?.selection ?? [],
      busy: current?.busy ?? false, loading: (current?.loading ?? 0) > 0, error: current?.error ? text(current.error) : "",
      degraded: current?.degraded ? text("unwatched") : "", canPaste: !!current?.clipboard?.paths.length,
      initialDraft: current?.draft ?? { form: null, name: "" },
      onDraft: (draft: ExplorerDraft) => { if (current?.active) current.draft = draft; },
      text: Object.fromEntries(Object.keys(catalogs.en).map(key => [key, text(key)])),
      onToggle: (path: string, open: boolean) => current?.toggle(path, open),
      onSelection: (paths: string[]) => current?.select(paths),
      onBuffer: (paths: string[], cut: boolean) => current?.buffer(paths, cut),
      onCreate: (parent: string, name: string, directory: boolean) => current?.create(parent, name, directory) ?? Promise.resolve(false),
      onRename: (path: string, name: string) => current?.rename(path, name) ?? Promise.resolve(false),
      onMove: (paths: string[], destination: string) => current?.transfer(paths, destination, false) ?? Promise.resolve(false),
      onPaste: (destination: string) => current?.paste(destination) ?? Promise.resolve(false),
      onRemove: (paths: string[]) => current?.remove(paths) ?? Promise.resolve(false),
      onRefresh: () => { if (current?.active) { current.error = ""; requestRefresh(); } },
    };
    const result = registered ? sidebar.update(tabId, { title: text("title"), icon: "files", props })
      : sidebar.register({ id: tabId, title: text("title"), icon: "files", componentId: "lunaris.file-explorer", order: 10, props }, ctx.signal);
    if (!result.ok) throw new Error("Cannot register/update explorer tab.", { cause: result.error });
    registered = true;
  }
  function changed(): void {
    if (scheduled || ctx.signal.aborted) return; scheduled = true;
    // SDK renderer updates must happen outside React layout/effect callbacks.
    void Promise.resolve().then(() => {
      scheduled = false; if (ctx.signal.aborted) return;
      try { publish(); } catch (error) { logger.error(ctx.pluginId, "Cannot update explorer view", { error }); }
    });
  }
  function requestRefresh(): void {
    dirty = true;
    if (refreshing || ctx.signal.aborted) return;
    refreshing = true;
    void (async () => {
      try { while (dirty && model?.active) { dirty = false; await model.refresh(); } }
      catch (error) { if (!ctx.signal.aborted) logger.error(ctx.pluginId, "Cannot refresh explorer", { error }); }
      finally { refreshing = false; }
    })();
  }
  function switchVault(): void {
    const root = vaults.current();
    if (root?.id === model?.vaultId) return;
    const old = session; session = undefined; model = undefined; watchId = undefined;
    if (old) void old.dispose().catch(() => {});
    if (!root) { changed(); return; }
    const owner = ctx.scope.child(); session = owner;
    const current = new ExplorerModel(root.id, fs, () => !owner.signal.aborted && !ctx.signal.aborted,
      changed, (level, message, error) => { if (!ctx.signal.aborted) logger[level](ctx.pluginId, message, error === undefined ? {} : { error }); });
    model = current; changed();
    void (async () => {
      try {
        const result = await observation.watch({ vaultId: root.id, path: "" }, owner.signal);
        if (!current.active) return;
        if (result.ok) watchId = result.value;
        else { current.degraded = true; logger.warn(ctx.pluginId, "Explorer automatic refresh unavailable", { code: result.error.code, error: result.error }); }
        await current.refresh();
      } catch (error) {
        if (current.active) { current.degraded = true; logger.error(ctx.pluginId, "Cannot initialize explorer observation", { error }); await current.refresh(); }
      }
    })();
  }
  ctx.events.on(FileChanged, change => {
    if (change.vaultId === model?.vaultId && change.watchId === watchId) requestRefresh();
  });
  ctx.events.on(VaultChanged, switchVault); ctx.events.on(LocaleChanged, changed);
  publish(); switchVault();
  logger.info(ctx.pluginId, "File explorer ready", { code: "EXPLORER_READY" });
} });
