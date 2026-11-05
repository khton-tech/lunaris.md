import { definePlugin, LunarisError } from "@lunaris/sdk";
import { Logger } from "@lunaris/logging";
import { Themes, ThemeChanged } from "@lunaris/themes";
import type { ThemeDefinition, ThemeResult, ThemeErrorCode, ThemeChange } from "@lunaris/themes";
import { copyTheme, isThemeId } from "./definition.js";
import manifest from "../manifest.json" with { type: "json" };

const ok: ThemeResult = Object.freeze({ ok: true, value: null });
interface Registration { theme: ThemeDefinition; readonly detach: () => void }

export default definePlugin({ manifest, activate(ctx) {
  const logger = ctx.use(Logger);
  const registrations = new Map<string, Registration>();
  let selected: string | null = null;
  function reject(code: ThemeErrorCode, message: string): ThemeResult {
    logger.warn(ctx.pluginId, message, { code });
    return { ok: false, error: { code, message } };
  }
  function notify(kind: ThemeChange["kind"], themeId: string | null, previous = selected, cleanup = false): Promise<void> {
    // An engine may stop while this provider is still alive. Only use this
    // provider's SDK context, and never publish after its own scope closes.
    if (ctx.signal.aborted) return Promise.resolve();
    const change: ThemeChange = Object.freeze({ kind, themeId, previous, current: selected });
    // Required providers can already be stopping during owner cleanup.
    if (!cleanup) logger.info(ctx.pluginId, "Theme registry changed", { data: change });
    return ctx.events.emit(ThemeChanged, change).catch(error => {
      if (ctx.signal.aborted || (error instanceof LunarisError && error.code === "CONTRACT_UNAVAILABLE")) return;
      // Abort-listener failures go to independent kernel diagnostics, not Logger.
      if (cleanup) throw error;
      logger.error(ctx.pluginId, "Cannot publish theme change", { code: "THEME_EVENT_FAILED", error });
    });
  }
  ctx.scope.own({ dispose() {
    for (const entry of registrations.values()) entry.detach();
    registrations.clear(); selected = null;
  } });
  ctx.provide(Themes, {
    get: id => registrations.get(id)?.theme,
    list: () => Object.freeze([...registrations.values()].map(entry => entry.theme).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    current: () => selected === null ? null : registrations.get(selected)?.theme ?? null,
    register(theme, owner) {
      const copied = copyTheme(theme);
      if (!copied || !owner || owner.aborted !== false || typeof owner.addEventListener !== "function" || typeof owner.removeEventListener !== "function") {
        return reject("INVALID_ARGUMENT", "A valid theme description and live owner signal are required.");
      }
      if (registrations.has(copied.id)) return reject("ALREADY_REGISTERED", "The theme ID is already registered.");
      const remove = () => {
        const previous = selected;
        registrations.delete(copied.id); owner.removeEventListener("abort", remove);
        if (selected === copied.id) selected = null;
        return notify("removed", copied.id, previous, true);
      };
      registrations.set(copied.id, { theme: copied, detach: () => owner.removeEventListener("abort", remove) });
      owner.addEventListener("abort", remove, { once: true });
      void notify("registered", copied.id);
      return ok;
    },
    update(theme) {
      const copied = copyTheme(theme);
      if (!copied) return reject("INVALID_ARGUMENT", "A valid theme description is required.");
      const entry = registrations.get(copied.id);
      if (!entry) return reject("NOT_FOUND", "The theme is not registered.");
      entry.theme = copied;
      void notify("updated", copied.id);
      return ok;
    },
    select(id) {
      if (id !== null && !isThemeId(id)) return reject("INVALID_ARGUMENT", "A theme ID or null is required.");
      if (id !== null && !registrations.has(id)) return reject("NOT_FOUND", "The theme is not registered.");
      if (selected === id) return ok;
      const previous = selected; selected = id;
      void notify("selected", id, previous);
      return ok;
    },
  });
  logger.info(ctx.pluginId, "Theme provider ready", { code: "THEMES_READY" });
} });
