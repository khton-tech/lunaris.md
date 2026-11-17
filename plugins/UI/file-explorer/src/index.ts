import { Preparation } from "@lunaris/startup";
import { WorkspaceSidebar } from "@lunaris/workspace";
import { ActiveDocument, ActiveDocumentChanged, ActiveDocumentTransitioned } from "@lunaris/active-document";
import type { DocumentOpenOptions } from "@lunaris/active-document";
import { definePlugin } from "@lunaris/sdk";
import type { ResourceScope } from "@lunaris/sdk";
import { Logger, scopeLogger } from "@lunaris/logging";
import { ContextMenu } from "@lunaris/context-menu";
import type { MenuOpenRequest, MenuSession } from "@lunaris/context-menu";
import { Sidebar } from "@lunaris/sidebar";
import { Components } from "@lunaris/components";
import type { ComponentProps } from "@lunaris/components";
import { Config } from "@lunaris/config";
import { BeforeFileMutation, Filesystem, FilesystemObservation, FileChanged } from "@lunaris/filesystem";
import { Vault, VaultChanged } from "@lunaris/vault";
import { Localization, LocaleChanged } from "@lunaris/localization";
import { ExplorerModel } from "./model.js";
import type { ExplorerDraft } from "./model.js";
import { parentPath } from "./model.js";
import { catalogs } from "./catalog.js";
import { createVaultSwitcher } from "./vault-switcher.js";
import { createPreferences } from "./preferences.js";
import { RecentFiles } from "./recent-files.js";
import manifest from "../manifest.json" with { type: "json" };

export default definePlugin({ manifest, async activate(ctx) {
  const navigation = ctx.optional(WorkspaceSidebar);
  const components = ctx.permissions.has("ui.dom") ? ctx.optional(Components) : undefined;
  const logger = scopeLogger(ctx.use(Logger), ctx.signal); const sidebar = ctx.use(Sidebar); const fs = ctx.use(Filesystem);
  const documents = ctx.use(ActiveDocument); const config = ctx.use(Config);
  const menus = ctx.use(ContextMenu); let menu: MenuSession | undefined;
  const observation = ctx.use(FilesystemObservation); const vaults = ctx.use(Vault); const localization = ctx.use(Localization);
  const messages = localization.register(ctx.pluginId, catalogs, ctx.signal);
  if (!messages.ok) throw new Error("Cannot register explorer localization.", { cause: messages.error });
  const tabId = `${ctx.pluginId}.files`; let registered = false; let scheduled = false;
  let session: ResourceScope | undefined; let model: ExplorerModel | undefined; let watchId: string | undefined;
  let recentFiles: RecentFiles | undefined;
  const emptyViews = new Set<() => void>();
  let refreshing = false; let refreshEpoch = 0; let fullRefresh = false; let reconcile = false; const pendingDirectories = new Set<string>(); let ready = Promise.resolve();
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
      onOpen: async (path: string) => { await openDocument(current, path); }, supportedExtensions: ["md"], vaultId: current?.vaultId ?? "", data: current?.tree() ?? [], expanded: [...(current?.expanded ?? [])], selection: current?.selection ?? [],
      onCreateUntitled: async () => {
        if (current?.active && current === model && !current.loading && !current.draft.form) await createUntitled(current, { editTitle: true });
      },
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
      onCreate: async (parent: string, name: string, directory: boolean) => {
        const result = await (current?.create(parent, name, directory) ?? false);
        // The confirmed file replaces its draft before document loading/persistence.
        if (result && !directory) void openDocument(current, parent ? parent + "/" + name : name).catch(error => {
          if (current?.active) { current.error = "IO_ERROR"; changed(); logger.error(ctx.pluginId, "Cannot open created document", { error }); }
        });
        return result;
      },
      onRename: (path: string, name: string) => current?.rename(path, name) ?? Promise.resolve(false),
      onMove: (paths: string[], destination: string) => current?.transfer(paths, destination, false) ?? Promise.resolve(false),
      onPaste: (destination: string) => current?.paste(destination) ?? Promise.resolve(false),
      onRemove: async (paths: string[]) => { const result = await (current?.remove(paths) ?? false); if (current?.active) await documents.reconcile(); return result; },
      onRefresh: () => { if (current?.active) requestRefresh(); },
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
      drainRefresh();
    });
  }
  function requestRefresh(paths?: readonly string[], validate = true): void {
    if (paths === undefined) fullRefresh = true;
    else for (const path of paths) pendingDirectories.add(path);
    reconcile ||= validate;
    // Coalesce same-turn native notifications before starting directory reads.
    void Promise.resolve().then(drainRefresh);
  }
  function drainRefresh(): void {
    if (refreshing || ctx.signal.aborted || !model?.active || model.busy || (!fullRefresh && !pendingDirectories.size && !reconcile)) return;
    refreshing = true;
    const epoch = refreshEpoch;
    void (async () => {
      try {
        while (epoch === refreshEpoch && model?.active && !model.busy && (fullRefresh || pendingDirectories.size || reconcile)) {
          const current: ExplorerModel = model; const paths = fullRefresh ? undefined : [...pendingDirectories]; const validate = reconcile;
          fullRefresh = false; pendingDirectories.clear(); reconcile = false;
          const completed = paths !== undefined && !paths.length ? true : await current.refresh(true, paths);
          if (!completed && current.active && current === model) { requestRefresh(paths, validate); continue; }
          if (validate && current.active && current === model && !current.busy) await documents.reconcile();
        }
      }
      catch (error) { if (!ctx.signal.aborted) logger.error(ctx.pluginId, "Cannot refresh explorer", { error }); }
      finally { if (epoch === refreshEpoch) refreshing = false; }
    })();
  }
  function switchVault(): void {
    const root = vaults.current();
    if (root?.id === model?.vaultId) return;
    const old = session; session = undefined; model = undefined; watchId = undefined; recentFiles = undefined; ready = Promise.resolve();
    refreshEpoch++; refreshing = false;
    fullRefresh = false; pendingDirectories.clear(); reconcile = false;
    if (old) void old.dispose().catch(() => {});
    if (!root) { changed(); return; }
    const owner = ctx.scope.child(); session = owner;
    const current = new ExplorerModel(root.id, fs, () => !owner.signal.aborted && !ctx.signal.aborted,
      changed, (level, message, error) => { if (!ctx.signal.aborted) logger[level](ctx.pluginId, message, error === undefined ? {} : { error }); },
      async (source, destination) => { if (current.active) { const result = await documents.relocate({ vaultId: root.id, path: source }, { vaultId: root.id, path: destination }); if (!result.ok && current.active) logger.warn(ctx.pluginId, "Cannot relocate active document", { error: result.error }); } });
    model = current; changed();
    if (components) {
      recentFiles = new RecentFiles(root.id, config, ctx.pluginId, () => current.active && model === current,
        () => { for (const render of emptyViews) render(); },
        (message, error) => logger.warn(ctx.pluginId, message, { error }));
      const active = documents.current();
      if (active?.vaultId === root.id) recentFiles.record(active.path);
    }
    ready = (async () => {
      try {
        await preferences.prepare();
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
  async function openDocument(current: ExplorerModel | undefined, path: string, options?: DocumentOpenOptions) {
    if (!current?.active || current !== model || current.busy) return;
    const target = { vaultId: current.vaultId, path };
    const drawerWasOpen = options?.editTitle && navigation?.isOpen();
    // Let the editor accept focus when the committed open requests title editing.
    if (drawerWasOpen) navigation?.close();
    let opened = false;
    try {
      const result = await (options ? documents.open(target, options) : documents.open(target));
      opened = result.ok;
      if (opened && current.active && current === model && !drawerWasOpen) navigation?.close();
      if (!result.ok && current.active) { current.error = result.error.code; changed(); logger.warn(ctx.pluginId, "Cannot open explorer document", { error: result.error }); }
      return result;
    } finally {
      if (drawerWasOpen && !opened && current.active && current === model) navigation?.open();
    }
  }
  async function createUntitled(current: ExplorerModel, options?: DocumentOpenOptions, live = () => current.active): Promise<boolean> {
    try {
      const path = await current.createUntitled(text("unnamedFile"));
      if (path && live()) return (await openDocument(current, path, options))?.ok ?? false;
    } catch (error) {
      if (current.active) {
        current.error = "IO_ERROR"; changed();
        logger.error(ctx.pluginId, "Cannot create or open unnamed document", { error });
      }
    }
    return false;
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
  let previousDocument = documents.current();
  ctx.events.on(ActiveDocumentChanged, () => {
    const active = documents.current();
    const previous = previousDocument; previousDocument = active;
    // Retire a single old document selection, preserving deliberate operation selections.
    if (model?.active && previous?.vaultId === model.vaultId &&
        (active?.vaultId !== previous.vaultId || active?.path !== previous.path) &&
        model.selection.length === 1 && model.selection[0] === previous.path) model.select([]);
    changed();
    void revealActive().catch(error => { if (!ctx.signal.aborted) logger.error(ctx.pluginId, "Cannot reveal active document", { error }); });
  });
  ctx.events.on(ActiveDocumentTransitioned, ({ current, reason }) => {
    if (current && recentFiles?.vaultId === current.vaultId && (reason === "open" || reason === "restore")) recentFiles.record(current.path);
  });
  ctx.hooks.register(BeforeFileMutation, change => {
    const recent = recentFiles;
    if (recent && !change.error && change.operation !== "copy") {
      change.onSettled(result => { if (result.ok && recentFiles === recent) recent.fileMutated(change); });
    }
    return change;
  });
  ctx.events.on(FileChanged, change => {
    const current = model;
    if (!current?.active || change.vaultId !== current.vaultId || change.watchId !== watchId) return;
    if (change.kind === "removed" || (change.kind === "rescan" && emptyViews.size > 0)) {
      recentFiles?.verify(fs, change.paths.length ? change.paths : undefined);
    }
    if (change.kind === "rescan" || !change.paths.length) { requestRefresh(); return; }
    const directories = new Set<string>();
    const active = documents.current();
    const validate = change.kind !== "modified" && active?.vaultId === current.vaultId && change.paths.some(path =>
      !path || active.path === path || active.path.startsWith(path + "/"));
    for (const path of change.paths) {
      const parent = parentPath(path);
      const entry = current.directories.get(parent)?.find(item => item.path === path);
      // Hidden directory subtrees and file contents do not change this role's view.
      if (path.split("/").slice(0, -1).some(segment => segment.startsWith(".")) ||
        (entry?.kind === "directory" && path.split("/").at(-1)?.startsWith("."))) continue;
      if (change.kind === "modified" && entry?.kind === "file") continue;
      if (current.directories.has(parent)) directories.add(parent);
      if (current.directories.has(path)) directories.add(path);
    }
    if (directories.size || validate) requestRefresh([...directories], validate);
  });
  ctx.events.on(VaultChanged, switchVault); ctx.events.on(LocaleChanged, changed);
  publish(); switchVault();
  const emptyActions = components?.register({ id: "lunaris.file-explorer-empty", mount(target, initial, signal) {
    let props = initial; let busy = false; let error = "";
    const onCreate = () => void run();
    const onOpen = (path: string) => void run(path);
    const recent = () => recentFiles?.vaultId === props.vaultId ? recentFiles : undefined;
    const presentation = () => ({
      title: "", detail: error ? text(error) : "", presentation: props.presentation,
      actions: { createLabel: props.createLabel, busy, onCreate },
      recent: { label: props.recentLabel, busy, onOpen, paths: recent()?.paths ?? [] },
    });
    const result = components.mount("lunaris.workspace-empty", target, presentation(), signal);
    if (!result.ok) throw new Error("Cannot mount empty workspace file actions.", { cause: result.error });
    const mounted = result.value;
    function render(): void {
      if (signal.aborted) return;
      const result = mounted.update(presentation());
      if (!result.ok) logger.warn(ctx.pluginId, "Cannot update empty workspace file actions", { error: result.error });
    }
    async function run(path?: string): Promise<void> {
      const current = model;
      if (!current?.active || signal.aborted || current.vaultId !== props.vaultId || busy || current.busy) return;
      const live = () => !signal.aborted && current.active && current === model;
      busy = true; error = ""; render();
      try {
        if (path === undefined) {
          if (!await createUntitled(current, undefined, live)) error = current.error || "IO_ERROR";
        } else {
          const result = await openDocument(current, path);
          if (live() && result && !result.ok) {
            error = result.error.code;
            if (["NOT_FOUND", "NOT_DIRECTORY", "NOT_FILE", "INVALID_ARGUMENT"].includes(error)) recent()?.forget(path);
          }
        }
      } catch (failure) {
        if (live()) { error = "IO_ERROR"; logger.error(ctx.pluginId, "Cannot complete empty workspace file action", { error: failure }); }
      } finally { busy = false; render(); }
    }
    emptyViews.add(render);
    recent()?.verify(fs);
    return { update(next: ComponentProps) { props = next; render(); }, dispose() { emptyViews.delete(render); } };
  } }, ctx.signal);
  if (emptyActions && !emptyActions.ok) throw new Error("Cannot register empty workspace file actions.", { cause: emptyActions.error });
  await ctx.optional(Preparation)?.register({ id: ctx.pluginId, phase: "content", async prepare() { switchVault(); await ready; } }, ctx.signal);
  logger.info(ctx.pluginId, "File explorer ready", { code: "EXPLORER_READY" });
} });
