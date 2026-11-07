import { definePlugin, LunarisError } from "@lunaris/sdk";
import { Logger } from "@lunaris/logging";
import { Vault, VaultChanged } from "@lunaris/vault";
import { ActiveScreen, ActiveScreenChanged } from "@lunaris/active-screen";
import type { ScreenDefinition, ScreenResult } from "@lunaris/active-screen";
import { readProps, readScreen } from "./input.js";
import manifest from "../manifest.json" with { type: "json" };

const done: ScreenResult = Object.freeze({ ok: true, value: null });
export default definePlugin({ manifest, activate(ctx) {
  const logger = ctx.use(Logger);
  const vaults = ctx.use(Vault); let vaultId = vaults.current()?.id ?? null;
  const entries = new Map<string, { screen: ScreenDefinition; detach(): void }>();
  let activeId: string | null = null;
  const committedSnapshot = () => Object.freeze({ screens: Object.freeze([...entries.values()].map(entry => entry.screen)), activeId });
  const snapshot = () => { synchronizeVault(); return committedSnapshot(); };
  function synchronizeVault(): void {
    const currentId = vaults.current()?.id ?? null;
    if (currentId === vaultId) return;
    vaultId = currentId;
    if (activeId === null) return;
    activeId = null;
    logger.info(ctx.pluginId, "Active screen reset for Vault transition"); void notify();
  }
  function notify(cleanup = false): Promise<void> {
    if (ctx.signal.aborted) return Promise.resolve();
    return ctx.events.emit(ActiveScreenChanged, committedSnapshot()).catch(error => {
      if (ctx.signal.aborted || (error instanceof LunarisError && error.code === "CONTRACT_UNAVAILABLE")) return;
      if (cleanup) throw error;
      logger.error(ctx.pluginId, "Cannot publish active screen change", { error });
    });
  }
  function reject(code: "INVALID_ARGUMENT" | "ALREADY_REGISTERED" | "NOT_FOUND", message: string): ScreenResult {
    logger.warn(ctx.pluginId, message, { code }); return { ok: false, error: { code, message } };
  }
  function select(id: string | null): ScreenResult {
    synchronizeVault();
    if (id !== null && typeof id !== "string") return reject("INVALID_ARGUMENT", "A screen ID or null is required.");
    if (id !== null && !entries.has(id)) return reject("NOT_FOUND", "Screen is not registered.");
    if (activeId === id) return done;
    activeId = id;
    logger.info(ctx.pluginId, "Active screen changed", { data: { id } });
    void notify(); return done;
  }
  ctx.scope.own({ dispose() { for (const entry of entries.values()) entry.detach(); entries.clear(); activeId = null; } });
  ctx.events.on(VaultChanged, synchronizeVault);
  ctx.provide(ActiveScreen, {
    snapshot, select,
    register(input, owner) {
      const screen = readScreen(input);
      if (!screen || !owner || owner.aborted !== false || typeof owner.addEventListener !== "function" || typeof owner.removeEventListener !== "function") return reject("INVALID_ARGUMENT", "A valid screen and live owner are required.");
      if (entries.has(screen.id)) return reject("ALREADY_REGISTERED", "Screen is already registered.");
      const entry = { screen, detach: () => owner.removeEventListener("abort", remove) };
      const remove = () => {
        entry.detach();
        if (entries.get(screen.id) !== entry) return;
        entries.delete(screen.id); if (activeId === screen.id) activeId = null;
        return notify(true);
      };
      entries.set(screen.id, entry); owner.addEventListener("abort", remove, { once: true });
      logger.info(ctx.pluginId, "Screen registered", { data: { id: screen.id, componentId: screen.componentId } });
      void notify(); return done;
    },
    update(id, input) {
      const props = readProps(input);
      if (!props) return reject("INVALID_ARGUMENT", "Plain screen props without workspace are required.");
      const entry = entries.get(id);
      if (!entry) return reject("NOT_FOUND", "Screen is not registered.");
      entry.screen = Object.freeze({ ...entry.screen, props });
      logger.debug(ctx.pluginId, "Screen updated", { data: { id } }); void notify(); return done;
    },
  });
  logger.info(ctx.pluginId, "Active screen provider ready");
} });
