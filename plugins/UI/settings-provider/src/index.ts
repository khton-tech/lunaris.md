import { definePlugin, LunarisError } from "@lunaris/sdk";
import type { CancellationSignal } from "@lunaris/sdk";
import { Logger } from "@lunaris/logging";
import { Settings, SettingsChanged } from "@lunaris/settings";
import type { SettingsCategory, SettingsSection, SettingsResult } from "@lunaris/settings";
import { readCategory, readSection, record, validTitle } from "./input.js";
import manifest from "../manifest.json" with { type: "json" };

interface Entry<T> { value: T; detach(): void }
const done: SettingsResult = Object.freeze({ ok: true, value: null });
export default definePlugin({ manifest, activate(ctx) {
  const logger = ctx.use(Logger);
  const categories = new Map<string, Entry<SettingsCategory>>(); const sections = new Map<string, Entry<SettingsSection>>();
  const ordered = <T extends SettingsCategory>(entries: Map<string, Entry<T>>) => Object.freeze([...entries.values()].map(entry => entry.value).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
  const snapshot = () => Object.freeze({ categories: ordered(categories), sections: ordered(sections) });
  function notify(cleanup = false): Promise<void> {
    if (ctx.signal.aborted) return Promise.resolve();
    return ctx.events.emit(SettingsChanged, snapshot()).catch(error => {
      if (ctx.signal.aborted || (error instanceof LunarisError && error.code === "CONTRACT_UNAVAILABLE")) return;
      if (cleanup) throw error;
      logger.error(ctx.pluginId, "Cannot publish settings registry change", { error });
    });
  }
  function reject(code: "INVALID_ARGUMENT" | "ALREADY_REGISTERED" | "NOT_FOUND", message: string): SettingsResult {
    logger.warn(ctx.pluginId, message, { code }); return { ok: false, error: { code, message } };
  }
  function register<T extends SettingsCategory>(entries: Map<string, Entry<T>>, value: T | undefined, owner: CancellationSignal): SettingsResult {
    if (!value || !owner || owner.aborted !== false || typeof owner.addEventListener !== "function" || typeof owner.removeEventListener !== "function") return reject("INVALID_ARGUMENT", "A valid contribution and live owner are required.");
    if (entries.has(value.id)) return reject("ALREADY_REGISTERED", "Settings contribution is already registered.");
    const entry = { value, detach: () => owner.removeEventListener("abort", remove) };
    const remove = () => { entry.detach(); if (entries.get(value.id) !== entry) return; entries.delete(value.id); return notify(true); };
    entries.set(value.id, entry); owner.addEventListener("abort", remove, { once: true });
    logger.info(ctx.pluginId, "Settings contribution registered", { data: { id: value.id } }); void notify(); return done;
  }
  ctx.scope.own({ dispose() { for (const entry of [...categories.values(), ...sections.values()]) entry.detach(); categories.clear(); sections.clear(); } });
  ctx.provide(Settings, {
    snapshot,
    registerCategory: (input, owner) => register(categories, readCategory(input), owner),
    registerSection: (input, owner) => register(sections, readSection(input), owner),
    updateCategory(id, input) {
      const changes = record(input, ["title"]);
      if (!changes || !validTitle(changes.title)) return reject("INVALID_ARGUMENT", "A category title is required.");
      const entry = categories.get(id); if (!entry) return reject("NOT_FOUND", "Settings category is not registered.");
      entry.value = Object.freeze({ ...entry.value, title: changes.title });
      logger.debug(ctx.pluginId, "Settings category updated", { data: { id } }); void notify(); return done;
    },
    updateSection(id, input) {
      const changes = record(input, ["title", "props"]);
      const props = changes && record(changes.props === undefined ? {} : changes.props);
      if (!changes || !validTitle(changes.title) || !props) return reject("INVALID_ARGUMENT", "A section title and plain props are required.");
      const entry = sections.get(id); if (!entry) return reject("NOT_FOUND", "Settings section is not registered.");
      entry.value = Object.freeze({ ...entry.value, title: changes.title, props });
      logger.debug(ctx.pluginId, "Settings section updated", { data: { id } }); void notify(); return done;
    },
  });
  logger.info(ctx.pluginId, "Settings registry ready");
} });
