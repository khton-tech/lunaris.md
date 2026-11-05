import { definePlugin } from "@lunaris/sdk";
import type { CancellationSignal } from "@lunaris/sdk";
import { Logger } from "@lunaris/logging";
import { Localization, LocaleChanged } from "@lunaris/localization";
import type { Messages, LocalizationResult } from "@lunaris/localization";
import { canonicalLocale, copyCatalogs, format, validName } from "./catalogs.js";
import manifest from "../manifest.json" with { type: "json" };

const ok: LocalizationResult = Object.freeze({ ok: true, value: null });
const fail = (code: "INVALID_ARGUMENT" | "ALREADY_REGISTERED" | "UNSUPPORTED_LOCALE", message: string): Extract<LocalizationResult, { ok: false }> => ({ ok: false, error: { code, message } });
interface Registration { readonly catalogs: ReadonlyMap<string, Messages>; readonly detach: () => void }

export default definePlugin({ manifest, activate(ctx) {
  const logger = ctx.use(Logger);
  logger.debug(ctx.pluginId, "Activating localization service");
  const registrations = new Map<string, Registration>();
  const warnings = new Set<string>();
  let current = "en";
  const locales = (): readonly string[] => Object.freeze([...new Set(["en", ...[...registrations.values()].flatMap(entry => [...entry.catalogs.keys()])])].sort());
  function warn(code: string, pluginId: string, key: string, parameter?: string): void {
    const identity = JSON.stringify([code, pluginId, key, parameter, current]);
    if (warnings.has(identity)) return;
    warnings.add(identity);
    logger.warn(ctx.pluginId, "Localization fallback used", { code, data: { pluginId, key, locale: current, ...(parameter ? { parameter } : {}) } });
  }
  function change(next: string): void {
    if (current === next) return;
    const previous = current;
    current = next;
    warnings.clear();
    logger.info(ctx.pluginId, "Application locale changed", { data: { previous, current } });
    void ctx.events.emit(LocaleChanged, Object.freeze({ previous, current })).catch(error => {
      if (!ctx.signal.aborted) logger.error(ctx.pluginId, "Cannot publish locale change", { code: "LOCALE_EVENT_FAILED", error });
    });
  }
  ctx.scope.own({ dispose() {
    for (const entry of registrations.values()) entry.detach();
    registrations.clear(); warnings.clear();
  } });
  ctx.provide(Localization, {
    locale: () => current,
    locales,
    setLocale(locale) {
      const next = canonicalLocale(locale);
      if (!next || !locales().includes(next)) {
        const result = fail("UNSUPPORTED_LOCALE", "The requested locale has no registered catalog.");
        logger.warn(ctx.pluginId, "Locale change declined", { code: "UNSUPPORTED_LOCALE", error: result.error });
        return result;
      }
      change(next);
      return ok;
    },
    register(pluginId, catalogs, owner) {
      const copied = copyCatalogs(catalogs);
      if (typeof pluginId !== "string" || !/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/.test(pluginId) || !copied ||
        !owner || typeof owner.aborted !== "boolean" || owner.aborted ||
        typeof owner.addEventListener !== "function" || typeof owner.removeEventListener !== "function") {
        const result = fail("INVALID_ARGUMENT", "A plugin ID, English catalog and live owner signal are required.");
        logger.error(ctx.pluginId, "Catalog registration declined", { code: "INVALID_ARGUMENT", error: result.error });
        return result;
      }
      if (registrations.has(pluginId)) {
        const result = fail("ALREADY_REGISTERED", "This plugin namespace already has a live catalog.");
        logger.error(ctx.pluginId, "Catalog registration declined", { code: "ALREADY_REGISTERED", error: result.error, data: { pluginId } });
        return result;
      }
      const signal: CancellationSignal = owner;
      const remove = () => {
        registrations.delete(pluginId);
        signal.removeEventListener("abort", remove);
        warnings.clear();
        // Owner shutdown is cleanup: never call SDK handles here. Retain the
        // selected locale across unload/reload; live catalogs fall back to English.
      };
      registrations.set(pluginId, { catalogs: copied, detach: () => signal.removeEventListener("abort", remove) });
      signal.addEventListener("abort", remove, { once: true });
      warnings.clear();
      logger.debug(ctx.pluginId, "Plugin catalog registered", { data: { pluginId, locales: [...copied.keys()] } });
      return ok;
    },
    text(pluginId, key, parameters) {
      if (!validName(pluginId) || !validName(key)) return "[invalid-message]";
      const catalogs = registrations.get(pluginId)?.catalogs;
      const primary = catalogs?.get(current);
      const english = catalogs?.get("en");
      let message = primary && Object.hasOwn(primary, key) ? primary[key] : undefined;
      if (message === undefined && english && Object.hasOwn(english, key)) {
        message = english[key];
        warn("TRANSLATION_MISSING", pluginId, key);
      }
      if (message === undefined) {
        warn("MESSAGE_MISSING", pluginId, key);
        return `[${pluginId}:${key}]`;
      }
      return format(message, parameters, name => warn("PARAMETER_MISSING", pluginId, key, name));
    },
  });
  logger.info(ctx.pluginId, "Localization service ready", { code: "LOCALIZATION_READY", data: { locale: current } });
} });
