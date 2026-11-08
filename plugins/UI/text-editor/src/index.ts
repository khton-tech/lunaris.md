import { definePlugin } from "@lunaris/sdk";
import { Logger } from "@lunaris/logging";
import { ActiveDocument, ActiveDocumentTransitioned, BeforeActiveDocumentChange } from "@lunaris/active-document";
import { ActiveScreen } from "@lunaris/active-screen";
import { BeforeFileMutation, Filesystem, FileChanged, FilesystemSources } from "@lunaris/filesystem";
import { Drafts, ConnectionChanged } from "@lunaris/remote";
import type { FileTarget, FsFailure } from "@lunaris/filesystem";
import { Vault, BeforeVaultRelease, VaultChanged } from "@lunaris/vault";
import { Components, ComponentsChanged } from "@lunaris/components";
import type { MountedComponent } from "@lunaris/components";
import { Localization, LocaleChanged } from "@lunaris/localization";
import { Themes, ThemeChanged } from "@lunaris/themes";
import type { EditorState } from "@codemirror/state";
import { DocumentSession } from "./session.js";
import { mountEditor } from "./codemirror.js";
import manifest from "../manifest.json" with { type: "json" };

const catalogs = { en: {
  empty: "Open a Markdown file", loading: "Loading", unsupported: "This file type is not supported", saved: "Saved", unsaved: "Unsaved", saving: "Saving",
  save: "Save", retry: "Retry save", reload: "Reload from disk", discard: "Discard changes and reload", cancel: "Cancel", editor: "Markdown editor", task: "Task",
  conflict: "The file changed outside the editor. Your changes are retained.", missing: "The file was removed. Your text is retained.",
  readFailed: "Cannot read this file.", saveFailed: "Cannot save changes. Your text is retained.",
  offline: "Server unavailable. Changes are saved on this device and will be retried after reconnection.",
  draftFailed: "Local recovery could not be saved. Keep this document open until saving succeeds.",
} };
const key = (target: FileTarget) => JSON.stringify([target.vaultId, target.path]);
const inside = (target: FileTarget, parent: FileTarget) => target.vaultId === parent.vaultId && (target.path === parent.path || target.path.startsWith(parent.path + "/"));
const markdownFile = (target: FileTarget) => /\.md$/i.test(target.path);

export default definePlugin({ manifest, activate(ctx) {
  const logger = ctx.use(Logger); const fs = ctx.use(Filesystem); const documents = ctx.use(ActiveDocument);
  const screens = ctx.use(ActiveScreen); const components = ctx.use(Components); const localization = ctx.use(Localization);
  const vaults = ctx.use(Vault); const themes = ctx.use(Themes);
  const drafts = ctx.permissions.has("drafts.access") ? ctx.optional(Drafts) : undefined; const sources = ctx.optional(FilesystemSources);
  const sessions = new Map<string, DocumentSession>(); const states = new Map<DocumentSession, EditorState>();
  const views = new Set<{ render(): void; removed(): void; refreshControls(): void }>();
  const screenId = `${ctx.pluginId}.screen`;
  let current: DocumentSession | null = null; let unsupported = false; let scheduled = false;
  const messages = localization.register(ctx.pluginId, catalogs, ctx.signal);
  if (!messages.ok) throw new Error("Cannot register editor messages.", { cause: messages.error });
  const text = (id: keyof typeof catalogs.en) => localization.text(ctx.pluginId, id);
  function changed(): void {
    if (scheduled || ctx.signal.aborted) return; scheduled = true;
    void Promise.resolve().then(() => {
      scheduled = false; if (ctx.signal.aborted) return;
      for (const view of views) {
        try { view.render(); } catch (error) { logger.error(ctx.pluginId, "Cannot render editor", { error }); }
      }
    });
  }
  function sessionFor(target: FileTarget): DocumentSession {
    let session = sessions.get(key(target));
    if (!session) {
      const identity = sources?.remoteIdentity(target.vaultId);
      const draftKey = () => identity?.ok ? { ...identity.value, path: session!.target.path } : null;
      session = new DocumentSession({ ...target }, fs, () => !ctx.signal.aborted && vaults.current()?.id === target.vaultId, changed,
        (level, message, error) => { if (!ctx.signal.aborted) logger[level](ctx.pluginId, message, error === undefined ? {} : { error }); }, undefined,
        drafts && identity?.ok ? {
          load: () => drafts.load(draftKey()!),
          save: (text, expectedVersion, revision) => drafts.save({ key: draftKey()!, text, expectedVersion, revision, updatedAt: Date.now() }),
          remove: revision => drafts.remove(draftKey()!, revision),
        } : undefined);
      sessions.set(key(target), session);
    }
    return session;
  }
  function choose(target: FileTarget | null): void {
    unsupported = !!target && !markdownFile(target);
    current = target && !unsupported ? sessionFor(target) : null;
    if (current && !current.loaded && !current.loading) void current.load();
    changed();
  }
  function selectScreen(): void {
    if (ctx.signal.aborted) return;
    const result = screens.select(screenId);
    if (!result.ok) logger.error(ctx.pluginId, "Cannot select editor screen", { error: result.error });
  }
  async function flushSessions(items: readonly DocumentSession[], settle: (listener: () => void) => void, allowLocalRecovery = false): Promise<FsFailure | null> {
    for (const session of items) settle(session.hold());
    for (const session of items) {
      if (session.loading) await session.load();
      const result = await session.flush();
      if (!result.ok && allowLocalRecovery && ["OFFLINE", "SERVER_UNAVAILABLE", "SESSION_EXPIRED", "UNAUTHENTICATED"].includes(result.error.code)) {
        const preserved = await session.persistDraft();
        if (preserved.ok) continue;
      }
      if (!result.ok) { if (!ctx.signal.aborted) { current = session; unsupported = false; changed(); selectScreen(); } return result.error; }
    }
    return null;
  }
  ctx.hooks.register(BeforeActiveDocumentChange, async guard => {
    if (guard.error) return guard;
    const items = [...sessions.values()].filter(session => session.dirty && session.target.vaultId === guard.previous?.vaultId);
    return { ...guard, error: await flushSessions(items, guard.onSettled, true) };
  });
  ctx.hooks.register(BeforeVaultRelease, async guard => {
    if (guard.error) return guard;
    return { ...guard, error: await flushSessions([...sessions.values()].filter(session => session.target.vaultId === guard.previous.id), guard.onSettled, true) };
  });
  if (drafts && sources && ctx.permissions.has("account.access")) ctx.events.on(ConnectionChanged, change => {
    if (change.state !== "connected") return;
    for (const session of sessions.values()) if (session.active && session.dirty && session.error && ["OFFLINE", "SERVER_UNAVAILABLE"].includes(session.error.code)) void session.flush();
  });
  ctx.hooks.register(BeforeFileMutation, async guard => {
    if (guard.error) return guard;
    const affected = [...sessions.values()].filter(session => inside(session.target, guard.source) || (!!guard.destination && inside(session.target, guard.destination)));
    const error = await flushSessions(affected, listener => guard.onSettled(() => listener()));
    if (error) return { ...guard, error };
    // Registered after unlock callbacks; all completion work is awaited before
    // the provider returns to Explorer, which then commits document identity.
    guard.onSettled(result => {
      if (!result.ok || ctx.signal.aborted) return;
      for (const session of affected) {
        if (guard.operation === "move" && guard.destination && inside(session.target, guard.source)) {
          sessions.delete(key(session.target));
          session.target = { vaultId: session.target.vaultId, path: guard.destination.path + session.target.path.slice(guard.source.path.length) };
          sessions.set(key(session.target), session);
          logger.info(ctx.pluginId, "Editor buffer relocated");
        } else if ((guard.operation === "remove" && inside(session.target, guard.source)) ||
          (guard.overwrite && guard.destination && inside(session.target, guard.destination))) {
          session.missing = guard.operation === "remove";
          if (session.missing) session.error = { code: "NOT_FOUND", message: "Document removed." };
          else { states.delete(session); void session.load(); }
        }
      }
      changed();
    });
    return guard;
  });

  const registration = components.register({ id: "lunaris.text-editor-host", mount(target, initial, signal) {
    const owner = ctx.scope.child(); let props = initial; let mounted: MountedComponent | undefined;
    let disposed = false; let editorTarget: HTMLElement | null = null;
    let taskUnavailableReported = false;
    let editor: ReturnType<typeof mountEditor> | undefined; let rendered: DocumentSession | null = null;
    const onTarget = (value: HTMLElement | null) => { editorTarget = value; };
    function clearEditor(): void { if (editor && rendered) states.set(rendered, editor.dispose()); editor = undefined; rendered = null; }
    const onSave = () => { if (!disposed && !signal.aborted && current?.active && !current.locks) void current.flush(); };
    const onReload = () => {
      if (disposed || signal.aborted || !current?.active || current.locks || current.saving) return;
      const session = current; states.delete(session); clearEditor();
      // Confirmation belongs to the Mantine role. Explicitly discarding a missing
      // draft must allow departure even though the removed file cannot be read.
      if (session.missing) session.savedText = session.text;
      void session.load(true);
    };
    function render(): void {
      if (disposed || signal.aborted || ctx.signal.aborted) return;
      const context = props.workspace as { vaultId?: string } | undefined;
      const session = current?.target.vaultId === context?.vaultId ? current : null;
      const ready = !!session?.loaded;
      const error = session?.draftError ? text("draftFailed") : session?.error ? text(session.error.code === "CONFLICT" ? "conflict" : session.missing ? "missing" : session.draftSaved && ["OFFLINE", "SERVER_UNAVAILABLE"].includes(session.error.code) ? "offline" : session.loaded ? "saveFailed" : "readFailed") : "";
      const next = { documentKey: session ? key(session.target) : "", name: session?.target.path ?? text(unsupported ? "unsupported" : "empty"),
        status: session?.loading ? text("loading") : session?.saving ? text("saving") : session?.loaded ? text(session.dirty ? "unsaved" : "saved") : "",
        error, ready, dirty: session?.dirty ?? false, busy: !!session && (session.loading || session.saving || session.locks > 0),
        saveLabel: text("save"), retryLabel: text("retry"), reloadLabel: text("reload"), discardLabel: text("discard"), cancelLabel: text("cancel"), onSave, onReload, onTarget,
        presentation: { mode: "embedded", sizing: "fill" } };
      if (mounted) {
        const result = mounted.update(next);
        if (!result.ok) { clearEditor(); mounted.dispose(); mounted = undefined; }
      }
      if (!mounted) {
        if (!components.has("lunaris.text-editor")) return;
        const result = components.mount("lunaris.text-editor", target, next, owner.signal);
        if (!result.ok) throw new Error("Cannot mount editor role.", { cause: result.error });
        mounted = result.value;
      }
      if (rendered !== session || !ready || (editor && editor.view.state.sliceDoc() !== session?.text)) clearEditor();
      if (session && ready && editorTarget) {
        if (!editor) {
          rendered = session;
          editor = mountEditor(editorTarget, session, states.get(session), themes.current(), text("editor"), onSave,
            error => { if (!ctx.signal.aborted) logger.error(ctx.pluginId, "CodeMirror operation failed", { error }); }, true, {
              label: text("task"), active: () => !disposed && !owner.signal.aborted && !ctx.signal.aborted,
              toggled(checked) { if (!ctx.signal.aborted) logger.debug(ctx.pluginId, "Task checkbox toggled", { data: { checked } }); },
              mount(target, props) {
                if (disposed || owner.signal.aborted || ctx.signal.aborted) return null;
                if (!components.has("lunaris.task-checkbox")) {
                  if (!taskUnavailableReported) logger.warn(ctx.pluginId, "Task checkbox role unavailable; retaining task syntax", { code: "TASK_CHECKBOX_UNAVAILABLE" });
                  taskUnavailableReported = true; return null;
                }
                const result = components.mount("lunaris.task-checkbox", target, props, owner.signal);
                if (result.ok) { taskUnavailableReported = false; return result.value; }
                logger.warn(ctx.pluginId, "Cannot mount task checkbox; retaining Markdown source", { error: result.error });
                return null;
              },
            });
        } else editor.update(themes.current(), text("editor"));
      }
    }
    const view = { render, refreshControls: clearEditor, removed() { clearEditor(); mounted = undefined; editorTarget = null; } };
    function dispose(): void {
      if (disposed) return; disposed = true; signal.removeEventListener("abort", dispose); views.delete(view); clearEditor();
      void owner.dispose().catch(() => {});
    }
    signal.addEventListener("abort", dispose, { once: true }); views.add(view);
    try { render(); } catch (error) { dispose(); throw error; }
    return { update(next) { props = next; render(); }, dispose };
  } }, ctx.signal);
  if (!registration.ok) throw new Error("Cannot register editor host.", { cause: registration.error });
  const screen = screens.register({ id: screenId, componentId: "lunaris.text-editor-host" }, ctx.signal);
  if (!screen.ok) throw new Error("Cannot register editor screen.", { cause: screen.error });
  ctx.events.on(ActiveDocumentTransitioned, transition => {
    if (transition.reason === "relocate" && current && transition.current && transition.previous &&
        (key(current.target) === key(transition.previous) || key(current.target) === key(transition.current))) {
      sessions.delete(key(current.target)); current.target = { ...transition.current }; sessions.set(key(current.target), current); changed(); return;
    }
    if (transition.reason === "reconcile" && current?.dirty && !transition.current) {
      current.missing = true; current.error = { code: "NOT_FOUND", message: "Document removed." }; current.cancelTimer(); changed(); return;
    }
    choose(transition.current);
    if (transition.current && (transition.reason === "open" || transition.reason === "restore")) selectScreen();
  });
  ctx.events.on(VaultChanged, () => {
    for (const [id, session] of sessions) if (session.target.vaultId !== vaults.current()?.id) { session.dispose(); sessions.delete(id); states.delete(session); }
    choose(documents.current());
  });
  ctx.events.on(FileChanged, async change => {
    // Structural completion owns authoritative moves. Watch notifications may
    // arrive during those operations; locked buffers must not reload early.
    for (const session of sessions.values()) {
      if (!session.active || session.locks || session.saving || session.loading || session.target.vaultId !== change.vaultId ||
          !change.paths.some(path => path === "" || inside(session.target, { vaultId: change.vaultId, path }))) continue;
      if (session.dirty) {
        if (change.kind === "removed") { session.missing = true; session.error = { code: "NOT_FOUND", message: "Document removed." }; session.cancelTimer(); changed(); }
      } else { states.delete(session); await session.load(); }
    }
  });
  ctx.events.on(ThemeChanged, changed); ctx.events.on(LocaleChanged, changed);
  ctx.events.on(ComponentsChanged, change => {
    if (change.componentId === "lunaris.task-checkbox") { for (const view of views) view.refreshControls(); changed(); }
    if (change.componentId === "lunaris.text-editor") { if (change.kind === "removed") for (const view of views) view.removed(); changed(); }
  });
  ctx.scope.own({ dispose() { for (const session of sessions.values()) session.dispose(); sessions.clear(); states.clear(); } });
  choose(documents.current()); if (documents.current()) selectScreen();
  logger.info(ctx.pluginId, "Text editor ready", { data: { autosaveDelay: 2000 } });
} });
