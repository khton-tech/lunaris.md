import type { PluginContext, CancellationSignal } from "@lunaris/sdk";
import { Config, ConfigChanged } from "@lunaris/config";
import { Settings } from "@lunaris/settings";
import type { SettingsItemContext, SettingsItemUpdate } from "@lunaris/settings";
import { Localization, LocaleChanged } from "@lunaris/localization";
import { Vault, VaultChanged } from "@lunaris/vault";
import { Logger, scopeLogger } from "@lunaris/logging";

export interface Preferences { readonly sortDirection: "asc" | "desc"; readonly revealActiveFile: boolean }
const defaults: Preferences = Object.freeze({ sortDirection: "asc", revealActiveFile: true });
type Key = keyof Preferences;
interface Session { vaultId: string; values: Preferences; loading: boolean; busy: boolean; reload: boolean; revision: number; error: string; errorKey: Key; ready: Promise<void> }
const keys = Object.keys(defaults) as Key[];
const itemId = (key: Key) => key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
const catalogs = { en: { category: "Files", group: "Navigation", sortDirection: "File order", revealActiveFile: "Reveal the active file", asc: "Name: A–Z", desc: "Name: Z–A", invalid: "Saved value is unavailable. Using the default.", readFailed: "Cannot read preferences.", saveFailed: "Cannot save the change. Try again.", retry: "Retry" }, ru: { category: "Файлы", group: "Навигация", sortDirection: "Порядок файлов", revealActiveFile: "Раскрывать путь к открытому файлу", asc: "Имя: А–Я", desc: "Имя: Я–А", invalid: "Сохранённое значение недоступно. Используется значение по умолчанию.", readFailed: "Не удалось прочитать настройки.", saveFailed: "Не удалось сохранить изменение. Повторите попытку.", retry: "Повторить" } };

/** Own live preferences and explicit Vault persistence; rendering belongs to Settings. */
export function createPreferences(ctx: PluginContext, changed: () => void) {
  const config = ctx.use(Config); const settings = ctx.use(Settings); const vaults = ctx.use(Vault);
  const localization = ctx.use(Localization); const logger = scopeLogger(ctx.use(Logger), ctx.signal);
  const namespace = `${ctx.pluginId}.preferences`; const categoryId = `${ctx.pluginId}.settings`; const groupId = `${categoryId}.display`;
  const ensure = (result: { ok: boolean; error?: unknown }) => { if (!result.ok) throw new Error("Cannot register preferences.", { cause: result.error }); };
  ensure(localization.register(namespace, catalogs, ctx.signal));
  const text = (key: string) => localization.text(namespace, key);
  let session: Session | undefined;
  const alive = (current: Session) => !ctx.signal.aborted && session === current && vaults.current()?.id === current.vaultId;
  function valid(key: Key, value: unknown): boolean { return key === "revealActiveFile" ? typeof value === "boolean" : value === "asc" || value === "desc"; }
  function presentation(key: Key): SettingsItemUpdate {
    const current = session; const value = current?.values[key] ?? defaults[key];
    const error = current?.errorKey === key ? current.error : "";
    const common = { title: text(key), disabled: !current || current.loading || current.busy, error: error ? text(error) : "",
      ...(error === "readFailed" ? { retryLabel: text("retry"), onRetry: async (context: SettingsItemContext) => {
        if (session && !context.signal.aborted && context.vaultId === session.vaultId) await load(session);
      } } : {}),
    };
    const onChange = (value: string | boolean, context: SettingsItemContext) => choose(key, value, context.vaultId, context.signal);
    if (key === "revealActiveFile") return { ...common, type: "switch", value: value as boolean, onChange };
    return { ...common, type: "select", value: value as string, options: ["asc", "desc"].map(value => ({ value, label: text(value) })), onChange };
  }
  function publish(): void {
    if (ctx.signal.aborted) return;
    ensure(settings.updateCategory(categoryId, { title: text("category"), icon: "folder" }));
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
    } finally { if (alive(current)) { current.busy = false; if (current.reload) { current.reload = false; current.ready = load(current); } notify(); } }
  }
  ensure(settings.registerCategory({ id: categoryId, title: text("category"), icon: "folder", order: 30 }, ctx.signal));
  ensure(settings.registerGroup({ id: groupId, categoryId, title: text("group") }, ctx.signal));
  for (const [order, key] of keys.entries()) ensure(settings.registerItem({ id: `${categoryId}.${itemId(key)}`, groupId, order, ...presentation(key) }, ctx.signal));
  function switchVault(): void {
    const vaultId = vaults.current()?.id;
    if (vaultId === session?.vaultId) return;
    session = vaultId ? { vaultId, values: { ...defaults }, loading: true, busy: false, reload: false, revision: 0, error: "", errorKey: keys[0]!, ready: Promise.resolve() } : undefined;
    if (session) session.ready = load(session);
    notify();
  }
  ctx.events.on(VaultChanged, switchVault);
  ctx.events.on(LocaleChanged, publish);
  ctx.events.on(ConfigChanged, change => {
    if (session && change.pluginId === ctx.pluginId && change.scope === "vault" && change.vaultId === session.vaultId && keys.includes(change.key as Key)) {
      if (session.busy) session.reload = true; else session.ready = load(session);
    }
  });
  switchVault();
  logger.info(ctx.pluginId, "Preferences ready");
  return { current: (): Preferences => session?.values ?? defaults, ready: () => session?.ready ?? Promise.resolve(), choose };
}
