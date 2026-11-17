import { Config, ConfigChanged } from "@lunaris/config";
import { LocaleChanged, Localization } from "@lunaris/localization";
import { Logger, scopeLogger } from "@lunaris/logging";
import { definePlugin } from "@lunaris/sdk";
import { Settings } from "@lunaris/settings";
import type { SettingsItemUpdate } from "@lunaris/settings";
import { DesktopBackground } from "@lunaris/window";
import manifest from "../manifest.json" with { type: "json" };

const key = "runInBackground";
const globalTarget = { scope: "global" } as const;
const catalogs = {
  en: {
    category: "Application", group: "Desktop", title: "Run in background",
    description: "Hide the main window in the system tray when closed.",
    open: "Open Lunaris", quit: "Quit", retry: "Retry",
    readFailed: "Cannot read the background setting.", writeFailed: "Cannot save the background setting.",
    applyFailed: "Cannot update the system tray.",
  },
  ru: {
    category: "Приложение", group: "Рабочий стол", title: "Работать в фоне",
    description: "При закрытии скрывать главное окно в системный трей.",
    open: "Открыть Lunaris", quit: "Выйти", retry: "Повторить",
    readFailed: "Не удалось прочитать настройку фоновой работы.", writeFailed: "Не удалось сохранить настройку фоновой работы.",
    applyFailed: "Не удалось обновить системный трей.",
  },
};

export default definePlugin({ manifest, async activate(ctx) {
  const logger = scopeLogger(ctx.use(Logger), ctx.signal);
  const config = ctx.use(Config);
  const language = ctx.use(Localization);
  const settings = ctx.use(Settings);
  const desktop = ctx.use(DesktopBackground);
  if (!desktop.supported()) {
    logger.debug(ctx.pluginId, "Desktop background settings are unavailable on this platform");
    return;
  }
  const categoryId = `${ctx.pluginId}.application`;
  const groupId = `${ctx.pluginId}.desktop`;
  const itemId = `${ctx.pluginId}.run-in-background`;
  const text = (name: keyof typeof catalogs.en) => language.text(ctx.pluginId, name);
  let saved = false;
  let applied: boolean | undefined;
  let error: "readFailed" | "writeFailed" | "applyFailed" | undefined;
  let pending = 0;
  let queue = Promise.resolve();

  function ensure(result: { ok: boolean; error?: unknown }): void {
    if (!result.ok) throw new Error("Cannot contribute desktop background settings.", { cause: result.error });
  }

  function publish(): void {
    if (ctx.signal.aborted) return;
    ensure(settings.updateCategory(categoryId, { title: text("category") }));
    ensure(settings.updateGroup(groupId, { title: text("group") }));
    ensure(settings.updateItem(itemId, item()));
  }

  function schedule(operation: () => Promise<void>): Promise<void> {
    if (ctx.signal.aborted) return Promise.resolve();
    pending++;
    const work = queue.then(async () => {
      if (ctx.signal.aborted) return;
      publish();
      await operation();
    }).catch(cause => logger.error(ctx.pluginId, "Desktop background settings operation failed", { error: cause }))
      .finally(() => {
        pending--;
        try { publish(); } catch (cause) { logger.error(ctx.pluginId, "Cannot refresh desktop background settings", { error: cause }); }
      });
    queue = work.then(() => {});
    return queue;
  }

  async function apply(refreshLabels = false): Promise<void> {
    if (ctx.signal.aborted || (saved === applied && !(refreshLabels && saved))) return;
    try {
      await desktop.configure(saved, { open: text("open"), quit: text("quit") });
      applied = saved;
      if (error === "applyFailed") error = undefined;
      logger.info(ctx.pluginId, "Desktop background preference applied", { data: { enabled: saved } });
    } catch (cause) {
      error = "applyFailed";
      logger.error(ctx.pluginId, "Cannot apply desktop background preference", { error: cause });
    }
  }

  async function load(): Promise<void> {
    const refreshLabels = error === "applyFailed";
    try {
      const stored = await config.get(ctx.pluginId, key, globalTarget);
      if (!stored.ok) throw new Error("Cannot read the global background preference.", { cause: stored.error });
      if (stored.value !== undefined && typeof stored.value !== "boolean") throw new TypeError("The background preference must be a boolean.");
      saved = stored.value === true;
      error = undefined;
    } catch (cause) {
      error = "readFailed";
      logger.error(ctx.pluginId, "Cannot read desktop background preference", { error: cause });
    }
    await apply(refreshLabels);
  }

  function item(): SettingsItemUpdate {
    return {
      type: "switch", title: text("title"), description: text("description"), layout: "inline",
      value: saved, disabled: pending > 0, ...(error ? { error: text(error) } : {}),
      ...(error === "readFailed" || error === "applyFailed" ? { retryLabel: text("retry"), onRetry: () => schedule(load) } : {}),
      onChange: (enabled, view) => {
        if (view.signal.aborted || pending || enabled === saved) return;
        return schedule(async () => {
          try {
            const result = await config.set(ctx.pluginId, key, enabled, globalTarget);
            if (!result.ok) throw new Error("Cannot save the global background preference.", { cause: result.error });
            saved = enabled;
            error = undefined;
          } catch (cause) {
            error = "writeFailed";
            logger.error(ctx.pluginId, "Cannot save desktop background preference", { error: cause });
            return;
          }
          await apply();
        });
      },
    };
  }

  ensure(language.register(ctx.pluginId, catalogs, ctx.signal));
  ensure(settings.registerCategory({ id: categoryId, title: text("category"), order: 5 }, ctx.signal));
  ensure(settings.registerGroup({ id: groupId, categoryId, title: text("group") }, ctx.signal));
  ensure(settings.registerItem({ id: itemId, groupId, ...item() }, ctx.signal));
  ctx.events.on(ConfigChanged, change => {
    if (change.scope === "global" && change.pluginId === ctx.pluginId && change.key === key) void schedule(load);
  });
  ctx.events.on(LocaleChanged, () => { void schedule(() => apply(true)); });
  await schedule(load);
  logger.info(ctx.pluginId, "Desktop background settings ready");
} });
