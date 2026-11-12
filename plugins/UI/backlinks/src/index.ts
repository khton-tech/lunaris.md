import { definePlugin } from "@lunaris/sdk";
import type { Disposable } from "@lunaris/sdk";
import { Backlinks, BacklinksChanged } from "@lunaris/backlinks";
import type { MentionGroup, Mention } from "@lunaris/backlinks";
import { ActiveDocument, ActiveDocumentChanged, DocumentContent } from "@lunaris/active-document";
import type { ActiveDocumentState } from "@lunaris/active-document";
import { DocumentFooters } from "@lunaris/editor";
import { Logger, scopeLogger } from "@lunaris/logging";
import { Sidebar } from "@lunaris/sidebar";
import { ActiveScreen } from "@lunaris/active-screen";
import { Components, ComponentsChanged } from "@lunaris/components";
import type { MountedComponent, ComponentProps } from "@lunaris/components";
import { Localization, LocaleChanged } from "@lunaris/localization";
import { Vault, VaultChanged } from "@lunaris/vault";
import { Config, ConfigChanged } from "@lunaris/config";
import { Settings } from "@lunaris/settings";
import { filterGroups } from "./filter.js";
import manifest from "../manifest.json" with { type: "json" };

const catalogs = {
  en: { title: "Backlinks", linked: "Linked mentions", unlinked: "Unlinked mentions", empty: "No mentions", noDocument: "Open a note", loading: "Indexing notes", degraded: "Some notes could not be indexed", refresh: "Refresh", link: "Link", filter: "Search mentions", filterToggle: "Show search filter", context: "Show more context", collapse: "Collapse results", sort: "Sort order", name: "File name (A–Z)", nameDesc: "File name (Z–A)", newest: "Modified (newest first)", oldest: "Modified (oldest first)", pin: "Open backlinks for this note", inDocument: "Backlinks in document", excluded: "Excluded paths", excludedDetail: "Comma-separated files or folders excluded from unlinked mentions.", failed: "Could not complete the action. Refresh and try again.", settings: "Backlinks", display: "Display", saveFailed: "Could not save preferences", readFailed: "Could not read preferences", hint: 'Text, "phrase", -exclude, OR, file:, path:, /regex/' },
  ru: { title: "Обратные ссылки", linked: "Связанные упоминания", unlinked: "Несвязанные упоминания", empty: "Нет упоминаний", noDocument: "Откройте заметку", loading: "Индексация заметок", degraded: "Не удалось проиндексировать часть заметок", refresh: "Обновить", link: "Связать", filter: "Поиск упоминаний", filterToggle: "Показать фильтр", context: "Показать больше контекста", collapse: "Свернуть результаты", sort: "Порядок сортировки", name: "Имя файла (А–Я)", nameDesc: "Имя файла (Я–А)", newest: "Изменение (сначала новые)", oldest: "Изменение (сначала старые)", pin: "Открыть обратные ссылки этой заметки", inDocument: "Обратные ссылки под заметкой", excluded: "Исключённые пути", excludedDetail: "Файлы или папки через запятую, исключённые из несвязанных упоминаний.", failed: "Не удалось выполнить действие. Обновите результаты и повторите.", settings: "Обратные ссылки", display: "Отображение", saveFailed: "Не удалось сохранить настройки", readFailed: "Не удалось прочитать настройки", hint: 'Текст, "фраза", -исключение, OR, file:, path:, /regex/' },
};
type Target = NonNullable<ActiveDocumentState>;
const ensure = (result: { ok: boolean; error?: unknown }) => { if (!result.ok) throw new Error("Backlinks registration failed.", { cause: result.error }); };
export default definePlugin({ manifest, activate(ctx) {
  const logger = scopeLogger(ctx.use(Logger), ctx.signal); const backlinks = ctx.use(Backlinks); const documents = ctx.use(ActiveDocument);
  const content = ctx.use(DocumentContent); const footers = ctx.use(DocumentFooters); const sidebar = ctx.use(Sidebar);
  const screens = ctx.use(ActiveScreen); const components = ctx.use(Components); const locale = ctx.use(Localization);
  const vaults = ctx.use(Vault); const config = ctx.use(Config); const settings = ctx.use(Settings);
  ensure(locale.register(ctx.pluginId, catalogs, ctx.signal));
  const text = (id: string) => locale.text(ctx.pluginId, id);
  const hostRole = "lunaris.backlinks-host"; const tabId = ctx.pluginId + ".tab"; const category = ctx.pluginId + ".settings"; const group = category + ".display";
  let inline = false; let excluded = ""; let configError = ""; let saving = false; let loading = true; let revision = 0;
  let footer: Disposable | undefined; let pinOwner = ctx.scope.child(); const pinned = new Map<string, string>();
  const views = new Set<() => void>(); let queued = false;
  const changed = () => {
    if (queued || ctx.signal.aborted) return; queued = true;
    void Promise.resolve().then(() => { queued = false; if (ctx.signal.aborted) return; for (const render of views) render(); });
  };
  function updateFooter(): void {
    if (inline && !footer) { const result = footers.register({ id: ctx.pluginId, componentId: hostRole, props: { inline: true } }, ctx.signal); ensure(result); if (result.ok) footer = result.value; }
    else if (!inline && footer) { footer.dispose(); footer = undefined; }
  }
  async function save(key: "inDocument" | "excludedPaths", value: boolean | string): Promise<void> {
    const id = vaults.current()?.id; if (!id || saving || loading || ctx.signal.aborted) return;
    saving = true; configError = ""; publishSettings();
    try {
      const result = await config.set(ctx.pluginId, key, value, { scope: "vault", vaultId: id });
      if (ctx.signal.aborted || vaults.current()?.id !== id) return;
      if (!result.ok) throw result.error;
      if (key === "inDocument") inline = value === true; else excluded = String(value);
      updateFooter(); logger.info(ctx.pluginId, "Backlink preferences updated");
    } catch (error) { if (!ctx.signal.aborted) { configError = text("saveFailed"); logger.error(ctx.pluginId, "Cannot save backlink preferences", { error }); } }
    finally { if (!ctx.signal.aborted) { saving = false; publishSettings(); changed(); } }
  }
  function publishSettings(): void {
    const disabled = loading || saving || !vaults.current();
    ensure(settings.updateCategory(category, { title: text("settings"), icon: "backlinks" }));
    ensure(settings.updateGroup(group, { title: text("display") }));
    ensure(settings.updateItem(category + ".inline", { type: "switch", title: text("inDocument"), value: inline, disabled, error: configError, onChange: value => save("inDocument", value) }));
    ensure(settings.updateItem(category + ".excluded", { type: "text", title: text("excluded"), description: text("excludedDetail"), value: excluded, disabled, error: configError, onChange: value => save("excludedPaths", value) }));
  }
  async function load(): Promise<void> {
    const id = vaults.current()?.id; const epoch = ++revision; loading = true; configError = "";
    publishSettings();
    try {
      if (id) {
        const result = await config.read(ctx.pluginId, { scope: "vault", vaultId: id });
        if (ctx.signal.aborted || epoch !== revision) return;
        if (!result.ok) throw result.error;
        inline = result.value.inDocument === true; excluded = typeof result.value.excludedPaths === "string" ? result.value.excludedPaths : "";
      } else { inline = false; excluded = ""; }
      updateFooter();
    } catch (error) { if (!ctx.signal.aborted && epoch === revision) { configError = text("readFailed"); logger.error(ctx.pluginId, "Cannot load backlink preferences", { error }); } }
    finally { if (!ctx.signal.aborted && epoch === revision) { loading = false; publishSettings(); changed(); } }
  }
  function pin(target: Target): void {
    const key = JSON.stringify(target); let id = pinned.get(key);
    if (!id) { id = ctx.pluginId + ".pinned-" + pinned.size; ensure(screens.register({ id, componentId: hostRole, props: { pinned: target, tabTitle: text("title") + " · " + target.path.replace(/\.md$/i, "") } }, pinOwner.signal)); pinned.set(key, id); }
    ensure(screens.select(id)); logger.info(ctx.pluginId, "Opened backlinks for a fixed note");
  }
  ensure(components.register({ id: hostRole, mount(target, initial, signal) {
    let props = initial; let mounted: MountedComponent | undefined; let disposed = false; let busy = false; let error = "";
    let query = ""; let sort = "name"; let more = false; let collapse = false; let filterVisible = false;
    const alive = () => !disposed && !signal.aborted && !ctx.signal.aborted;
    async function run(action: () => Promise<unknown>): Promise<void> {
      if (!alive() || busy) return; busy = true; error = ""; render();
      try { const result = await action() as { ok?: boolean; error?: unknown } | undefined; if (result?.ok === false) throw result.error; }
      catch (cause) { if (alive()) { error = text("failed"); logger.warn(ctx.pluginId, "Backlink action failed", { error: cause }); } }
      finally { if (alive()) { busy = false; render(); } }
    }
    function render(): void {
      if (!alive()) return;
      const selected = (props.pinned ?? props.document ?? documents.current()) as ActiveDocumentState;
      const note = selected?.vaultId === vaults.current()?.id ? selected : null;
      const snapshot = note ? backlinks.query(note, excluded.split(",").map(p => p.trim()).filter(Boolean)) : null;
      const mapGroups = (groups: readonly MentionGroup[], unlinked: boolean) => filterGroups(groups, filterVisible ? query : "", sort).map(group => ({
        id: group.source.path, title: group.source.path.replace(/\.md$/i, ""), count: group.mentions.length,
        mentions: group.mentions.map((m: Mention) => {
          const start = more ? m.contextFrom : Math.max(m.contextFrom, m.from - 80);
          const end = more ? m.contextTo : Math.min(m.contextTo, m.to + 100);
          return { id: String(m.from), before: (start > m.contextFrom ? "…" : "") + group.text.slice(start, m.from), match: group.text.slice(m.from, m.to), after: group.text.slice(m.to, end) + (end < m.contextTo ? "…" : ""), line: m.line,
            onOpen: () => { void run(() => content.reveal(group.source, m, group.text)); },
            ...(unlinked && note ? { onLink: () => { void run(() => backlinks.link(note, group.source, m, group.text)); } } : {}) };
        }),
      }));
      const next: ComponentProps = {
        title: text("title"), note: note?.path.replace(/\.md$/i, "") ?? "", inline: props.inline === true,
        labels: Object.fromEntries(Object.keys(catalogs.en).map(key => [key, text(key)])),
        status: !note ? text("noDocument") : snapshot?.state === "loading" ? text("loading") : snapshot?.state === "degraded" ? text("degraded") : "",
        error: error || configError, busy, linked: mapGroups(snapshot?.linked ?? [], false), unlinked: mapGroups(snapshot?.unlinked ?? [], true),
        query, sort, more, collapse, filterVisible, inDocument: inline, preferencesDisabled: saving || loading,
        onQuery: (value: string) => { query = value; render(); }, onSort: (value: string) => { sort = value; render(); },
        onContext: () => { more = !more; render(); }, onCollapse: () => { collapse = !collapse; render(); }, onFilter: () => { filterVisible = !filterVisible; render(); },
        onRefresh: () => { void run(() => backlinks.refresh()); }, onPin: () => { if (note) pin(note); }, onInline: () => { void save("inDocument", !inline); },
        presentation: props.presentation ?? { mode: "embedded", sizing: "fill" },
      };
      if (mounted) { const result = mounted.update(next); if (!result.ok) { mounted.dispose(); mounted = undefined; logger.error(ctx.pluginId, "Cannot update backlinks view", { error: result.error }); } }
      if (!mounted && components.has("lunaris.backlinks")) { const result = components.mount("lunaris.backlinks", target, next, signal); ensure(result); if (result.ok) mounted = result.value; }
    }
    function dispose(): void { if (disposed) return; disposed = true; views.delete(render); signal.removeEventListener("abort", dispose); mounted?.dispose(); }
    signal.addEventListener("abort", dispose, { once: true }); views.add(render); render();
    return { update(next) { props = next; render(); }, dispose };
  } }, ctx.signal));
  ensure(sidebar.register({ id: tabId, title: text("title"), icon: "backlinks", componentId: hostRole, order: 30 }, ctx.signal));
  ensure(settings.registerCategory({ id: category, title: text("settings"), icon: "backlinks", order: 45 }, ctx.signal));
  ensure(settings.registerGroup({ id: group, categoryId: category, title: text("display") }, ctx.signal));
  ensure(settings.registerItem({ id: category + ".inline", groupId: group, type: "switch", title: text("inDocument"), value: false, onChange: value => save("inDocument", value) }, ctx.signal));
  ensure(settings.registerItem({ id: category + ".excluded", groupId: group, type: "text", title: text("excluded"), value: "", onChange: value => save("excludedPaths", value) }, ctx.signal));
  ctx.events.on(BacklinksChanged, changed); ctx.events.on(ActiveDocumentChanged, changed);
  ctx.events.on(ComponentsChanged, event => { if (event.componentId === "lunaris.backlinks") changed(); });
  ctx.events.on(LocaleChanged, () => { ensure(sidebar.update(tabId, { title: text("title"), icon: "backlinks" })); publishSettings(); changed(); });
  ctx.events.on(ConfigChanged, event => { if (event.pluginId === ctx.pluginId && !saving) void load(); });
  ctx.events.on(VaultChanged, () => { void pinOwner.dispose(); pinOwner = ctx.scope.child(); pinned.clear(); inline = false; excluded = ""; updateFooter(); void load(); });
  void load(); logger.info(ctx.pluginId, "Backlinks panel ready");
} });
