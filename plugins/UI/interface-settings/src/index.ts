import { definePlugin } from "@lunaris/sdk";
import type { CancellationSignal } from "@lunaris/sdk";
import { Logger } from "@lunaris/logging";
import { Config, ConfigChanged } from "@lunaris/config";
import { Settings } from "@lunaris/settings";
import { Components } from "@lunaris/components";
import type { ComponentProps, MountedComponent } from "@lunaris/components";
import { Localization, LocaleChanged } from "@lunaris/localization";
import { Themes, ThemeChanged } from "@lunaris/themes";
import { Vault, VaultChanged } from "@lunaris/vault";
import manifest from "../manifest.json" with { type: "json" };

type Key = "locale" | "theme";
interface Session { readonly vaultId: string; readonly epoch: number; revision: number; reload: boolean; loading: boolean; busy: boolean; error: string; locale: string; theme: string }
const categoryId = "lunaris.interface-settings.general";
const sectionId = "lunaris.interface-settings.preferences";
const hostRole = "lunaris.interface-settings-controls";
const catalogs = { en: { general: "General", interface: "Interface", locale: "Language", theme: "Theme",
  unavailable: "Saved choice is unavailable.", readFailed: "Cannot read preferences. Retry to load them.",
  saveFailed: "Cannot save the change. Try again.", applyFailed: "Cannot apply the selected choice.", retry: "Retry" } };

/** Own Vault interface preferences independently of startup policy and presentation. */
export function createInterfaceSettings(options: { readonly defaultThemeId: string }) {
  if (typeof options.defaultThemeId !== "string" || !options.defaultThemeId) throw new TypeError("A default theme ID is required.");
  return definePlugin({ manifest, activate(ctx) {
    const logger = ctx.use(Logger); const config = ctx.use(Config); const settings = ctx.use(Settings);
    const components = ctx.use(Components); const language = ctx.use(Localization); const themes = ctx.use(Themes); const vaults = ctx.use(Vault);
    const ensure = (result: { ok: boolean; error?: unknown }) => { if (!result.ok) throw new Error("Cannot register interface preferences.", { cause: result.error }); };
    ensure(language.register(ctx.pluginId, catalogs, ctx.signal));
    // Catalogs are registered during activation. Runtime language-pack discovery is outside this contract.
    const locales = language.locales();
    let epoch = 0; let session: Session | undefined; let scheduled = false;
    const text = (key: string) => language.text(ctx.pluginId, key);
    const alive = (current: Session) => !ctx.signal.aborted && session === current && current.epoch === epoch && vaults.current()?.id === current.vaultId;
    const compatibleThemes = () => themes.list().filter(theme => theme.properties.schema === "lunaris.base-theme" && theme.properties.schemaVersion === 1);
    const available = (key: Key, value: string) => key === "locale" ? language.locales().includes(value) : compatibleThemes().some(theme => theme.id === value);
    function apply(key: Key, value: string): boolean {
      try {
        const result = key === "locale" ? language.setLocale(value) : themes.select(value);
        if (!result.ok) logger.warn(ctx.pluginId, "Cannot apply interface preference", { data: { key }, error: result.error });
        return result.ok;
      } catch (error) { logger.error(ctx.pluginId, "Interface preference application failed", { data: { key }, error }); return false; }
    }
    function baseline(): void { apply("locale", "en"); apply("theme", options.defaultThemeId); }
    function props(): ComponentProps {
      const current = session;
      const names = new Intl.DisplayNames([language.locale()], { type: "language" });
      return { fields: [
        { id: "locale", label: text("locale"), value: current?.locale ?? "en", options: locales.map(value => ({ value, label: names.of(value) ?? value })) },
        { id: "theme", label: text("theme"), value: current?.theme ?? options.defaultThemeId, options: compatibleThemes().map(theme => ({ value: theme.id, label: theme.name })) },
      ], disabled: !current || current.loading || current.busy, error: current?.error ? text(current.error) : "",
      retryLabel: text("retry"), canRetry: current?.error === "readFailed" };
    }
    function publish(): void {
      if (ctx.signal.aborted) return;
      ensure(settings.updateCategory(categoryId, { title: text("general") }));
      ensure(settings.updateSection(sectionId, { title: text("interface"), props: props() }));
    }
    function changed(): void {
      if (scheduled || ctx.signal.aborted) return; scheduled = true;
      void Promise.resolve().then(() => {
        scheduled = false; if (ctx.signal.aborted) return;
        try { publish(); } catch (error) { logger.error(ctx.pluginId, "Cannot update interface preferences", { error }); }
      });
    }
    async function load(current: Session): Promise<void> {
      if (!alive(current) || current.busy) return;
      const revision = ++current.revision;
      current.loading = true; current.error = ""; changed();
      try {
        const result = await config.read(ctx.pluginId, { scope: "vault", vaultId: current.vaultId });
        if (!alive(current) || current.revision !== revision) return;
        if (!result.ok) throw result.error;
        for (const key of ["locale", "theme"] as const) {
          const value = result.value[key]; const fallback = key === "locale" ? "en" : options.defaultThemeId;
          if (value === undefined) { current[key] = fallback; apply(key, fallback); continue; }
          if (typeof value !== "string" || !available(key, value)) {
            current.error = "unavailable"; current[key] = fallback; apply(key, fallback);
            logger.warn(ctx.pluginId, "Saved interface preference unavailable; using Vault default", { data: { key } });
          } else if (apply(key, value)) current[key] = value;
          else current.error = "applyFailed";
        }
        logger.info(ctx.pluginId, "Vault interface preferences restored");
      } catch (error) {
        if (alive(current) && current.revision === revision) { current.error = "readFailed"; logger.error(ctx.pluginId, "Cannot read Vault interface preferences", { error }); }
      } finally { if (alive(current) && current.revision === revision) { current.loading = false; changed(); } }
    }
    async function choose(current: Session, key: Key, value: string, view: CancellationSignal): Promise<void> {
      if (view.aborted || !alive(current) || current.loading || current.busy || !available(key, value) || current[key] === value) return;
      const previous = current[key]; current.busy = true; current.error = "";
      if (!apply(key, value)) { current.busy = false; current.error = "applyFailed"; changed(); return; }
      current[key] = value; changed();
      try {
        const result = await config.set(ctx.pluginId, key, value, { scope: "vault", vaultId: current.vaultId });
        if (!alive(current)) return;
        if (!result.ok) throw result.error;
        logger.info(ctx.pluginId, "Interface preference saved", { data: { key } });
      } catch (error) {
        if (alive(current)) {
          current[key] = previous; apply(key, previous); current.error = "saveFailed";
          logger.error(ctx.pluginId, "Cannot save interface preference", { data: { key }, error });
        }
      } finally { if (alive(current)) { current.busy = false; if (current.reload) { current.reload = false; void load(current); } changed(); } }
    }
    ensure(components.register({ id: hostRole, mount(target, initial, signal) {
      const owner = ctx.scope.child(); let mounted: MountedComponent | undefined; let disposed = false;
      const current = session; const context = initial.workspace as { vaultId?: string } | undefined;
      const valid = () => !disposed && !signal.aborted && !!current && alive(current) && context?.vaultId === current.vaultId;
      const onChange = (key: string, value: string) => { if (valid() && (key === "locale" || key === "theme")) void choose(current!, key, value, signal); };
      const onRetry = () => { if (valid()) void load(current!); };
      function render(next: ComponentProps): void {
        const value = { ...next, onChange, onRetry, presentation: { mode: "embedded", sizing: "content" } };
        if (mounted) { ensure(mounted.update(value)); return; }
        const result = components.mount("lunaris.settings-choices", target, value, owner.signal);
        if (!result.ok) throw new Error("Cannot mount interface preferences.", { cause: result.error });
        mounted = result.value;
      }
      function dispose(): void { if (disposed) return; disposed = true; signal.removeEventListener("abort", dispose); void owner.dispose().catch(() => {}); }
      signal.addEventListener("abort", dispose, { once: true });
      try { render(initial); } catch (error) { dispose(); throw error; }
      return { update: render, dispose };
    } }, ctx.signal));
    ensure(settings.registerCategory({ id: categoryId, title: text("general"), order: 10 }, ctx.signal));
    ensure(settings.registerSection({ id: sectionId, categoryId, title: text("interface"), componentId: hostRole, props: props() }, ctx.signal));
    function switchVault(): void {
      const vaultId = vaults.current()?.id;
      if (vaultId === session?.vaultId) return;
      epoch++; session = undefined; baseline();
      if (vaultId) { session = { vaultId, epoch, revision: 0, reload: false, loading: true, busy: false, error: "", locale: "en", theme: options.defaultThemeId }; void load(session); }
      changed();
    }
    ctx.events.on(VaultChanged, switchVault);
    ctx.events.on(LocaleChanged, changed);
    ctx.events.on(ThemeChanged, change => {
      if (session && change.kind !== "selected") { if (session.busy) session.reload = true; else void load(session); }
      changed();
    });
    ctx.events.on(ConfigChanged, change => {
      if (session && change.pluginId === ctx.pluginId && change.scope === "vault" && change.vaultId === session.vaultId && (change.key === "locale" || change.key === "theme")) {
        if (session.busy) session.reload = true; else void load(session);
      }
    });
    switchVault();
    logger.info(ctx.pluginId, "Interface settings ready");
  } });
}
