import { isSdkUnavailable, type PluginContext, type CancellationSignal } from "@lunaris/sdk";
import { Config, ConfigChanged } from "@lunaris/config";
import { Settings } from "@lunaris/settings";
import type { SettingsItemContext, SettingsItemUpdate } from "@lunaris/settings";
import { Localization, LocaleChanged } from "@lunaris/localization";
import { Vault, VaultChanged } from "@lunaris/vault";
import { Logger, scopeLogger } from "@lunaris/logging";
import { Themes, ThemeChanged } from "@lunaris/themes";

export interface Preferences { readonly fontSize: string; readonly lineHeight: string; readonly textWidth: string; readonly wrapLines: boolean }
export const defaults: Preferences = Object.freeze({ fontSize: "theme", lineHeight: "theme", textWidth: "698", wrapLines: true });
const textWidths = ["640", "698", "780", "960", "full"];
type Key = keyof Preferences;
interface Session { vaultId: string; values: Preferences; previewWidth?: string | undefined; loading: boolean; busy: boolean; reload: boolean; revision: number; error: string; errorKey: Key; ready: Promise<void> }
const keys = Object.keys(defaults) as Key[];
const itemId = (key: Key) => key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
const catalogs = { en: { category: "Editor", group: "Display", fontSize: "Font size", lineHeight: "Line spacing", textWidth: "Text width", textWidthDetail: "Limits the column when wrapping is on and the editor is wider than this value.", wrapLines: "Wrap long lines", full: "Full width", invalid: "Saved value is unavailable. Using the default.", readFailed: "Cannot read preferences.", saveFailed: "Cannot save the change. Try again.", retry: "Retry" }, ru: { category: "Редактор", group: "Отображение", fontSize: "Размер шрифта", lineHeight: "Межстрочный интервал", textWidth: "Ширина текста", textWidthDetail: "Ограничивает ширину колонки, когда включён перенос строк и редактор шире выбранного значения.", wrapLines: "Переносить длинные строки", full: "На всю ширину", invalid: "Сохранённое значение недоступно. Используется значение по умолчанию.", readFailed: "Не удалось прочитать настройки.", saveFailed: "Не удалось сохранить изменение. Повторите попытку.", retry: "Повторить" } };

/** Own live preferences and explicit Vault persistence; rendering belongs to Settings. */
export function createPreferences(ctx: PluginContext, changed: () => void) {
  const config = ctx.use(Config); const settings = ctx.use(Settings); const vaults = ctx.use(Vault);
  const themes = ctx.use(Themes);
  const localization = ctx.use(Localization); const logger = scopeLogger(ctx.use(Logger), ctx.signal);
  const namespace = `${ctx.pluginId}.preferences`; const categoryId = `${ctx.pluginId}.settings`; const groupId = `${categoryId}.display`;
  const ensure = (result: { ok: boolean; error?: unknown }) => { if (!result.ok) throw new Error("Cannot register preferences.", { cause: result.error }); };
  ensure(localization.register(namespace, catalogs, ctx.signal));
  const text = (key: string) => localization.text(namespace, key);
  let session: Session | undefined;
  function alive(current: Session): boolean {
    if (ctx.signal.aborted || session !== current) return false;
    try { return vaults.current()?.id === current.vaultId; }
    catch (error) { if (isSdkUnavailable(error)) return false; throw error; }
  }
  function startLoad(current: Session): void {
    current.ready = load(current);
    // Observe background work while preserving its rejection for explicit awaiters.
    void current.ready.catch(error => {
      if (!isSdkUnavailable(error)) logger.error(ctx.pluginId, "Background preference load failed", { error });
    });
  }
  function valid(key: Key, value: unknown): boolean {
    if (key === "wrapLines") return typeof value === "boolean";
    if (typeof value !== "string") return false;
    if (key === "textWidth") return value === "full" || (String(Number(value)) === value && Number.isInteger(Number(value)) && Number(value) >= 320 && Number(value) <= 1920);
    if (value === "theme") return true;
    const number = Number(value);
    return value === String(number) && Number.isFinite(number) && (key === "fontSize"
      ? number >= 8 && number <= 96 && Number.isInteger(number)
      : number >= 1 && number <= 3 && Math.abs(number * 10 - Math.round(number * 10)) < 1e-8);
  }
  function presentation(key: Key): SettingsItemUpdate {
    const current = session; const value = current?.values[key] ?? defaults[key];
    const error = current?.errorKey === key ? current.error : "";
    const common = { title: text(key), disabled: !current || current.loading || current.busy, error: error ? text(error) : "",
      ...(error === "readFailed" ? { retryLabel: text("retry"), onRetry: async (context: SettingsItemContext) => {
        if (session && !context.signal.aborted && context.vaultId === session.vaultId) await load(session);
      } } : {}),
    };
    const onChange = (value: string | boolean, context: SettingsItemContext) => choose(key, value, context.vaultId, context.signal);
    if (key === "wrapLines") return { ...common, type: "switch", value: value as boolean, onChange };
    if (key === "fontSize" || key === "lineHeight") {
      const typography = themes.current()?.properties.typography as Record<string, unknown> | undefined;
      const fallback = key === "fontSize" ? 14 : 1.6;
      const inherited = typography?.[key];
      const effective = value === "theme" ? typeof inherited === "number" && Number.isFinite(inherited) && inherited > 0 ? inherited : fallback : Number(value);
      return { ...common, type: "slider", value: effective, min: Math.min(key === "fontSize" ? 12 : 1.2, effective),
        max: Math.max(key === "fontSize" ? 32 : 2, effective), step: key === "fontSize" ? 1 : 0.1,
        ...(key === "fontSize" ? { unit: "px" } : {}),
        onChange: (value, context) => choose(key, String(Number(value.toFixed(key === "fontSize" ? 0 : 1))), context.vaultId, context.signal),
      };
    }
    const widths = textWidths.includes(value as string) ? textWidths : [...textWidths.slice(0, -1), value as string, "full"];
    const options = widths.map(value => ({ value, label: value === "full" ? text(value) : `${value} px` }));
    return { ...common, description: text("textWidthDetail"), type: "select", value: value as string, options, onChange };
  }
  function publish(): void {
    if (ctx.signal.aborted) return;
    ensure(settings.updateCategory(categoryId, { title: text("category"), icon: "editor" }));
    ensure(settings.updateGroup(groupId, { title: text("group") }));
    for (const key of keys) ensure(settings.updateItem(`${categoryId}.${itemId(key)}`, presentation(key)));
  }
  function notify(): void { publish(); changed(); }
  async function load(current: Session): Promise<void> {
    if (!alive(current) || current.busy) return;
    const revision = ++current.revision; current.loading = true; current.error = ""; publish();
    try {
      const result = await config.read(ctx.pluginId, { scope: "vault", vaultId: current.vaultId });
      if (!alive(current) || revision !== current.revision) return;
      if (!result.ok) throw result.error;
      const values = { ...defaults };
      for (const key of keys) {
        const value = result.value[key];
        if (value === undefined) continue;
        if (valid(key, value)) Object.assign(values, { [key]: value });
        else { current.error = "invalid"; current.errorKey = key; logger.warn(ctx.pluginId, "Invalid saved preference; using default", { data: { key } }); }
      }
      current.values = values;
      logger.info(ctx.pluginId, "Vault preferences restored");
    } catch (error) {
      if (alive(current) && revision === current.revision) { current.error = "readFailed"; current.errorKey = keys[0]!; logger.error(ctx.pluginId, "Cannot read preferences", { error }); }
    } finally { if (alive(current) && revision === current.revision) { current.loading = false; notify(); } }
  }
  async function choose(key: Key, value: string | boolean, vaultId: string, signal: CancellationSignal = ctx.signal): Promise<void> {
    const current = session;
    if (signal.aborted || !current || !alive(current) || vaultId !== current.vaultId || current.loading || current.busy || !valid(key, value) || current.values[key] === value) return;
    const previous = current.values; current.busy = true; current.error = ""; current.errorKey = key;
    current.values = { ...previous, [key]: value }; notify();
    try {
      const result = await config.set(ctx.pluginId, key, value, { scope: "vault", vaultId: current.vaultId });
      if (!alive(current)) return;
      if (!result.ok) throw result.error;
      logger.info(ctx.pluginId, "Preference saved", { data: { key } });
    } catch (error) {
      if (alive(current)) { current.values = previous; current.error = "saveFailed"; logger.error(ctx.pluginId, "Cannot save preference", { data: { key }, error }); }
    } finally { if (alive(current)) { current.busy = false; if (current.reload) { current.reload = false; startLoad(current); } notify(); } }
  }
  ensure(settings.registerCategory({ id: categoryId, title: text("category"), icon: "editor", order: 20 }, ctx.signal));
  ensure(settings.registerGroup({ id: groupId, categoryId, title: text("group") }, ctx.signal));
  for (const [order, key] of keys.entries()) ensure(settings.registerItem({ id: `${categoryId}.${itemId(key)}`, groupId, order, ...presentation(key) }, ctx.signal));
  function switchVault(): void {
    const vaultId = vaults.current()?.id;
    if (vaultId === session?.vaultId) return;
    session = vaultId ? { vaultId, values: { ...defaults }, loading: true, busy: false, reload: false, revision: 0, error: "", errorKey: keys[0]!, ready: Promise.resolve() } : undefined;
    if (session) startLoad(session);
    notify();
  }
  ctx.events.on(VaultChanged, switchVault);
  ctx.events.on(LocaleChanged, publish);
  ctx.events.on(ThemeChanged, publish);
  ctx.events.on(ConfigChanged, change => {
    if (session && change.pluginId === ctx.pluginId && change.scope === "vault" && change.vaultId === session.vaultId && keys.includes(change.key as Key)) {
      if (session.busy) session.reload = true; else startLoad(session);
    }
  });
  switchVault();
  logger.info(ctx.pluginId, "Preferences ready");
  function resizeWidth(width: number, phase: "preview" | "commit" | "cancel", vaultId: string): void {
    const current = session;
    if (!current || !alive(current) || current.vaultId !== vaultId) return;
    if (phase === "cancel") { current.previewWidth = undefined; changed(); return; }
    if (current.loading || current.busy || !current.values.wrapLines || !valid("textWidth", String(width))) return;
    current.previewWidth = phase === "preview" ? String(width) : undefined;
    if (phase === "preview") changed();
    else { void choose("textWidth", String(width), vaultId); changed(); }
  }
  return { current: (): Preferences => session?.previewWidth ? { ...session.values, textWidth: session.previewWidth } : session?.values ?? defaults,
    canResize: () => !!session && !session.loading && !session.busy && session.values.wrapLines,
    widthError: () => session?.errorKey === "textWidth" && session.error ? text(session.error) : "",
    resizeWidth, ready: () => session?.ready ?? Promise.resolve(),
    async prepare() {
      if (ctx.signal.aborted) return;
      try { switchVault(); } catch (error) { if (!isSdkUnavailable(error)) throw error; }
      await session?.ready;
    }, choose };
}
