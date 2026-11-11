import { WorkspaceSidebar } from "@lunaris/workspace";
import { ActiveDocument, ActiveDocumentChanged } from "@lunaris/active-document";
import { definePlugin } from "@lunaris/sdk";
import type { ResourceScope } from "@lunaris/sdk";
import { Logger, scopeLogger } from "@lunaris/logging";
import { ContextMenu } from "@lunaris/context-menu";
import type { MenuOpenRequest, MenuSession } from "@lunaris/context-menu";
import { Sidebar } from "@lunaris/sidebar";
import { Filesystem, FilesystemObservation, FileChanged } from "@lunaris/filesystem";
import { Vault, VaultChanged } from "@lunaris/vault";
import { Localization, LocaleChanged } from "@lunaris/localization";
import { ExplorerModel } from "./model.js";
import type { ExplorerDraft } from "./model.js";
import { catalogs } from "./catalog.js";
import { createVaultSwitcher } from "./vault-switcher.js";
import { createPreferences } from "./preferences.js";
import manifest from "../manifest.json" with { type: "json" };

export default definePlugin({ manifest, activate(ctx) {
  const navigation = ctx.optional(WorkspaceSidebar);
  const logger = scopeLogger(ctx.use(Logger), ctx.signal); const sidebar = ctx.use(Sidebar); const fs = ctx.use(Filesystem);
  const documents = ctx.use(ActiveDocument);
  const menus = ctx.use(ContextMenu); let menu: MenuSession | undefined;
  const observation = ctx.use(FilesystemObservation); const vaults = ctx.use(Vault); const localization = ctx.use(Localization);
  const messages = localization.register(ctx.pluginId, catalogs, ctx.signal);
  if (!messages.ok) throw new Error("Cannot register explorer localization.", { cause: messages.error });
  const tabId = `${ctx.pluginId}.files`; let registered = false; let scheduled = false;
  let session: ResourceScope | undefined; let model: ExplorerModel | undefined; let watchId: string | undefined;
  let refreshing = false; let dirty = false;
  const text = (key: string) => localization.text(ctx.pluginId, key);
  const switcher = createVaultSwitcher(ctx, changed);
  const preferences = createPreferences(ctx, changed);
  let revealEnabled = true;
  function publish(): void {
    if (ctx.signal.aborted) return;
    menu?.dispose(); menu = undefined;
    const current = model;
    if (current) current.sortDirection = preferences.current().sortDirection;
    const reveal = preferences.current().revealActiveFile;
    if (reveal !== revealEnabled) {
      revealEnabled = reveal;
      if (reveal) void revealActive().catch(error => { if (!ctx.signal.aborted) logger.error(ctx.pluginId, "Cannot reveal active document", { error }); });
    }
    const active = documents.current();
    const props = { activePath: active?.vaultId === current?.vaultId ? active?.path ?? null : null,
      onOpen: (path: string) => openDocument(current, path), supportedExtensions: ["md"], vaultId: current?.vaultId ?? "", data: current?.tree() ?? [], expanded: [...(current?.expanded ?? [])], selection: current?.selection ?? [],
      busy: current?.busy ?? false, loading: (current?.loading ?? 0) > 0, error: current?.error ? text(current.error) : "",
      degraded: current?.degraded ? text("unwatched") : "", canPaste: !!current?.clipboard?.paths.length,
      initialDraft: current?.draft ?? { form: null, name: "" },
      vaultSwitcher: switcher.snapshot(),
      sortDirection: current?.sortDirection ?? "asc", expanding: current?.expanding ?? false,
      onSort: (direction: "asc" | "desc") => { if (current?.active && current === model && !current.busy) return preferences.choose("sortDirection", direction, current.vaultId); },
      onExpandAll: () => current?.expandAll() ?? Promise.resolve(),
      onDraft: (draft: ExplorerDraft) => { if (current?.active) current.draft = draft; },
      text: Object.fromEntries(Object.keys(catalogs.en).map(key => [key, text(key)])),
      onToggle: (path: string, open: boolean) => current?.toggle(path, open),
      onSelection: (paths: string[]) => current?.select(paths),
      onBuffer: (paths: string[], cut: boolean) => current?.buffer(paths, cut),
      onCreate: async (parent: string, name: string, directory: boolean) => { const result = await (current?.create(parent, name, directory) ?? false); if (result && !directory) await openDocument(current, parent ? parent + "/" + name : name); return result; },
      onRename: (path: string, name: string) => current?.rename(path, name) ?? Promise.resolve(false),
      onMove: (paths: string[], destination: string) => current?.transfer(paths, destination, false) ?? Promise.resolve(false),
      onPaste: (destination: string) => current?.paste(destination) ?? Promise.resolve(false),
      onRemove: async (paths: string[]) => { const result = await (current?.remove(paths) ?? false); if (current?.active) await documents.reconcile(); return result; },
      onRefresh: () => { if (current?.active) { current.error = ""; requestRefresh(); } },
      onContextMenu: (request: Omit<MenuOpenRequest, "context"> & { readonly path: string | null; readonly kind: string; readonly selection: readonly string[]; readonly destination: string }) => {
        if (!current?.active || current !== model || !session) return;
        const selection = Object.freeze([...request.selection]);
        const result = menus.open({ target: request.target, x: request.x, y: request.y, label: text("title"), entries: request.entries ?? [],
          context: { source: ctx.pluginId, target: request.kind,
            data: { vaultId: current.vaultId, path: request.path, selection, destination: request.destination } },
        }, session.signal);
        if (result.ok) { menu = result.value; return menu; }
        else logger.warn(ctx.pluginId, "Cannot open explorer context menu", { code: result.error.code });
      },
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
      try { while (dirty && model?.active) { dirty = false; const current = model; await current.refresh(true); if (current.active && current === model && !current.busy) await documents.reconcile(); } }
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
      changed, (level, message, error) => { if (!ctx.signal.aborted) logger[level](ctx.pluginId, message, error === undefined ? {} : { error }); },
      async (source, destination) => { if (current.active) { const result = await documents.relocate({ vaultId: root.id, path: source }, { vaultId: root.id, path: destination }); if (!result.ok && current.active) logger.warn(ctx.pluginId, "Cannot relocate active document", { error: result.error }); } });
    model = current; changed();
    void (async () => {
      try {
        await preferences.ready();
        if (!current.active) return;
        const result = await observation.watch({ vaultId: root.id, path: "" }, owner.signal);
        if (!current.active) return;
        if (result.ok) watchId = result.value;
        else { current.degraded = true; logger.warn(ctx.pluginId, "Explorer automatic refresh unavailable", { code: result.error.code, error: result.error }); }
        await current.refresh(); await revealActive();
      } catch (error) {
        if (current.active) { current.degraded = true; logger.error(ctx.pluginId, "Cannot initialize explorer observation", { error }); await current.refresh(); }
      }
    })();
  }
  async function openDocument(current: ExplorerModel | undefined, path: string): Promise<void> {
    if (!current?.active || current !== model || current.busy) return;
    const result = await documents.open({ vaultId: current.vaultId, path });
    if (result.ok && current.active && current === model && !ctx.signal.aborted) navigation?.close();
    if (!result.ok && current.active) { current.error = result.error.code; changed(); logger.warn(ctx.pluginId, "Cannot open explorer document", { error: result.error }); }
  }
  async function revealActive(): Promise<void> {
    await preferences.ready();
    if (ctx.signal.aborted || !preferences.current().revealActiveFile) return;
    const active = documents.current(); const current = model;
    if (!active || !current?.active || active.vaultId !== current.vaultId) return;
    const segments = active.path.split("/"); segments.pop(); let parent = "";
    for (const segment of segments) {
      if (!current.active || current !== model || !preferences.current().revealActiveFile || documents.current()?.vaultId !== active.vaultId || documents.current()?.path !== active.path) return;
      parent = parent ? parent + "/" + segment : segment;
      current.expanded.add(parent);
      if (!current.directories.has(parent)) await current.load(parent);
    }
    changed();
  }
  ctx.events.on(ActiveDocumentChanged, () => { changed(); void revealActive().catch(error => { if (!ctx.signal.aborted) logger.error(ctx.pluginId, "Cannot reveal active document", { error }); }); });
  ctx.events.on(FileChanged, change => {
    if (change.vaultId === model?.vaultId && change.watchId === watchId) requestRefresh();
  });
  ctx.events.on(VaultChanged, switchVault); ctx.events.on(LocaleChanged, changed);
  publish(); switchVault();
  logger.info(ctx.pluginId, "File explorer ready", { code: "EXPLORER_READY" });
} });
