import { definePlugin } from "@lunaris/sdk";
import { Logger } from "@lunaris/logging";
import { Config } from "@lunaris/config";
import { Vault, VaultChanged } from "@lunaris/vault";
import { Filesystem, validTarget, validPath } from "@lunaris/filesystem";
import type { FileTarget, FsResult } from "@lunaris/filesystem";
import { ActiveDocument, ActiveDocumentChanged } from "@lunaris/active-document";
import type { ActiveDocumentState } from "@lunaris/active-document";
import manifest from "../manifest.json" with { type: "json" };
const ok = (): FsResult<null> => ({ ok: true, value: null });
const fail = (code: "INVALID_ARGUMENT" | "CANCELLED", message: string): FsResult<null> => ({ ok: false, error: { code, message } });
export default definePlugin({ manifest, async activate(ctx) {
  const logger = ctx.use(Logger); const config = ctx.use(Config); const vaults = ctx.use(Vault); const fs = ctx.use(Filesystem);
  let current: ActiveDocumentState = null; let epoch = 0; let queue: Promise<unknown> = Promise.resolve();
  const live = (version: number, vaultId?: string) => !ctx.signal.aborted && epoch === version && (!vaultId || vaults.current()?.id === vaultId);
  function publish(next: ActiveDocumentState) {
    if (current?.vaultId === next?.vaultId && current?.path === next?.path) return;
    current = next ? Object.freeze({ ...next }) : null;
    logger.info(ctx.pluginId, "Active document changed", { data: { active: !!current } });
    void ctx.events.emit(ActiveDocumentChanged, Object.freeze({ current })).catch(error => {
      if (!ctx.signal.aborted) logger.error(ctx.pluginId, "Cannot publish active document", { error });
    });
  }
  function enqueue(work: () => Promise<FsResult<null>>): Promise<FsResult<null>> {
    const result = queue.then(work).catch(error => {
      if (!ctx.signal.aborted) logger.error(ctx.pluginId, "Active document operation failed", { error });
      return { ok: false as const, error: { code: "IO_ERROR" as const, message: "Active document operation failed." } };
    });
    queue = result; return result;
  }
  async function persist(vaultId: string, path: string | null, version: number) {
    if (!live(version, vaultId)) return;
    const result = path === null ? await config.remove(ctx.pluginId, "path", { scope: "vault", vaultId }) : await config.set(ctx.pluginId, "path", path, { scope: "vault", vaultId });
    if (live(version, vaultId) && !result.ok) logger.warn(ctx.pluginId, "Cannot persist active document; session remains usable", { error: result.error });
  }
  async function select(target: FileTarget, version: number): Promise<FsResult<null>> {
    if (!live(version, target.vaultId)) return fail("CANCELLED", "Vault session changed.");
    const result = await fs.stat(target);
    if (!live(version, target.vaultId)) return fail("CANCELLED", "Vault session changed.");
    if (!result.ok) { logger.warn(ctx.pluginId, "Cannot activate document", { error: result.error }); return result; }
    if (result.value.kind !== "file") return fail("INVALID_ARGUMENT", "A regular file is required.");
    publish(target); await persist(target.vaultId, target.path, version); return ok();
  }
  function switchVault() {
    const version = ++epoch; const root = vaults.current(); publish(null);
    return enqueue(async () => {
      if (!root || !live(version, root.id)) return ok();
      const saved = await config.get(ctx.pluginId, "path", { scope: "vault", vaultId: root.id });
      if (!live(version, root.id)) return ok();
      if (!saved.ok) { logger.warn(ctx.pluginId, "Cannot restore active document", { error: saved.error }); return ok(); }
      if (saved.value === undefined) return ok();
      if (!validPath(saved.value)) { logger.warn(ctx.pluginId, "Invalid saved active document path"); return ok(); }
      const result = await select({ vaultId: root.id, path: saved.value }, version);
      if (live(version, root.id) && !result.ok && ["NOT_FOUND", "NOT_DIRECTORY", "INVALID_ARGUMENT"].includes(result.error.code)) await persist(root.id, null, version);
      return ok();
    });
  }
  ctx.provide(ActiveDocument, {
    current: () => current,
    open(target) {
      if (!validTarget(target)) return Promise.resolve(fail("INVALID_ARGUMENT", "A Vault-relative file target is required."));
      const version = epoch; const copy = { ...target }; return enqueue(() => select(copy, version));
    },
    close() {
      const version = epoch; const root = vaults.current();
      return enqueue(async () => { if (!live(version)) return fail("CANCELLED", "Vault session changed."); publish(null); if (root) await persist(root.id, null, version); return ok(); });
    },
    relocate(source, destination) {
      if (!validTarget(source) || !validTarget(destination) || source.vaultId !== destination.vaultId) return Promise.resolve(fail("INVALID_ARGUMENT", "Same-Vault move targets are required."));
      const from = { ...source }; const to = { ...destination }; const version = epoch;
      return enqueue(async () => {
        if (!live(version, from.vaultId)) return fail("CANCELLED", "Vault session changed.");
        if (!current || current.vaultId !== from.vaultId || !(current.path === from.path || current.path.startsWith(from.path + "/"))) return ok();
        return select({ vaultId: to.vaultId, path: to.path + current.path.slice(from.path.length) }, version);
      });
    },
    reconcile() {
      const version = epoch;
      return enqueue(async () => {
        const target = current; if (!target || !live(version, target.vaultId)) return ok();
        const result = await fs.stat(target);
        if (!live(version, target.vaultId)) return ok();
        if ((!result.ok && ["NOT_FOUND", "NOT_DIRECTORY"].includes(result.error.code)) || (result.ok && result.value.kind !== "file")) {
          publish(null); await persist(target.vaultId, null, version);
        } else if (!result.ok) { logger.warn(ctx.pluginId, "Cannot validate active document; retaining state", { error: result.error }); return result; }
        return ok();
      });
    },
  });
  ctx.events.on(VaultChanged, async () => { await switchVault(); });
  await switchVault();
  if (!ctx.signal.aborted) logger.info(ctx.pluginId, "Active document provider ready");
} });
