import { definePlugin, LunarisError } from "@lunaris/sdk";
import { Logger, scopeLogger } from "@lunaris/logging";
import { Workspace, WorkspaceChanged } from "@lunaris/workspace";
import type { WorkspaceContent, WorkspaceResult, WorkspaceChange } from "@lunaris/workspace";
import { readContent, readProps } from "./input.js";
import manifest from "../manifest.json" with { type: "json" };

interface Entry { content: Required<WorkspaceContent>; readonly detach: () => void }
const done: WorkspaceResult = Object.freeze({ ok: true, value: null });

export default definePlugin({ manifest, activate(ctx) {
  const logger = scopeLogger(ctx.use(Logger), ctx.signal); const entries = new Map<string, Entry>();
  function notify(kind: WorkspaceChange["kind"], id: string, cleanup = false): Promise<void> {
    if (ctx.signal.aborted) return Promise.resolve();
    // Publish only through this provider's live context. Dispatch skips stopping
    // consumers; owner cleanup never calls another service or renderer directly.
    return ctx.events.emit(WorkspaceChanged, Object.freeze({ kind, id })).catch(error => {
      if (ctx.signal.aborted || (error instanceof LunarisError && error.code === "CONTRACT_UNAVAILABLE")) return;
      if (cleanup) throw error;
      logger.error(ctx.pluginId, "Cannot publish workspace change", { code: "WORKSPACE_EVENT_FAILED", error });
    });
  }
  function reject(code: "INVALID_ARGUMENT" | "ALREADY_REGISTERED" | "REGION_OCCUPIED" | "NOT_FOUND", message: string): WorkspaceResult {
    logger.warn(ctx.pluginId, message, { code });
    return { ok: false, error: { code, message } };
  }
  ctx.scope.own({ dispose() { for (const entry of entries.values()) entry.detach(); entries.clear(); } });
  ctx.provide(Workspace, {
    list: () => Object.freeze([...entries.values()].map(entry => entry.content).sort((a, b) => a.order - b.order)),
    register(input, owner) {
      const content = readContent(input);
      if (!content || !owner || owner.aborted !== false || typeof owner.addEventListener !== "function" || typeof owner.removeEventListener !== "function") {
        return reject("INVALID_ARGUMENT", "Valid workspace content and a live owner are required.");
      }
      if (entries.has(content.id)) return reject("ALREADY_REGISTERED", "Workspace content is already registered.");
      if (content.region !== "main" && [...entries.values()].some(entry => entry.content.region === content.region)) return reject("REGION_OCCUPIED", "The workspace region already has an owner.");
      const remove = () => {
        owner.removeEventListener("abort", remove); entries.delete(content.id);
        return notify("removed", content.id, true);
      };
      entries.set(content.id, { content, detach: () => owner.removeEventListener("abort", remove) });
      owner.addEventListener("abort", remove, { once: true });
      logger.info(ctx.pluginId, "Workspace content registered", { code: "WORKSPACE_CONTENT_REGISTERED", data: { id: content.id, componentId: content.componentId } });
      void notify("registered", content.id); return done;
    },
    update(id, input) {
      const props = readProps(input);
      if (!props) return reject("INVALID_ARGUMENT", "Plain props without the reserved workspace key are required.");
      const entry = entries.get(id);
      if (!entry) return reject("NOT_FOUND", "Workspace content is not registered.");
      entry.content = Object.freeze({ ...entry.content, props });
      logger.debug(ctx.pluginId, "Workspace content updated", { data: { id } });
      void notify("updated", id); return done;
    },
  });
  logger.info(ctx.pluginId, "Workspace content provider ready", { code: "WORKSPACE_PROVIDER_READY" });
} });
