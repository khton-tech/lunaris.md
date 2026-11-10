import { definePlugin } from "@lunaris/sdk";
import { Logger, scopeLogger } from "@lunaris/logging";
import { Drafts, DraftStorage } from "@lunaris/remote";
import type { DraftKey, DraftWriteRecord } from "@lunaris/remote";
import { failure, validPath } from "@lunaris/filesystem";
import type { FsResult } from "@lunaris/filesystem";

const validKey = (key: DraftKey): boolean => !!key && (key.writerId === undefined || (typeof key.writerId === "string" && !!key.writerId)) && typeof key.server === "string" && !!key.server && typeof key.accountId === "string" && !!key.accountId &&
  typeof key.vaultId === "string" && !!key.vaultId && validPath(key.path);
export default definePlugin({ manifest: { manifestVersion: 1, id: "lunaris.drafts-provider", version: "0.1.0", engine: "^0.1.0", sdk: "^0.1.0", entry: "./dist/index.js",
  provides: [{ kind: Drafts.kind, id: Drafts.id, version: Drafts.version }], requires: [Logger, DraftStorage].map(t => ({ kind: t.kind, id: t.id, range: `^${t.version}` })),
  permissions: ["drafts.access"], optionalPermissions: [] }, activate(ctx) {
  const logger = scopeLogger(ctx.use(Logger), ctx.signal); const storage = ctx.use(DraftStorage);
  async function invoke<T>(operation: string, work: () => Promise<FsResult<T>>): Promise<FsResult<T>> {
    try { const result = await work(); if (!result.ok && !ctx.signal.aborted) logger.error(ctx.pluginId, "Local draft operation failed", { error: result.error, data: { operation } }); return result; }
    catch (error) { if (!ctx.signal.aborted) logger.error(ctx.pluginId, "Local draft storage failed", { error, data: { operation } }); return failure("IO_ERROR", "The local draft could not be persisted."); }
  }
  ctx.provide(Drafts, {
    list: key => validKey(key) ? invoke("list", () => storage.list({ ...key })) : Promise.resolve(failure("INVALID_ARGUMENT", "A stable document identity is required.")),
    load: key => validKey(key) ? invoke("load", () => storage.load({ ...key })) : Promise.resolve(failure("INVALID_ARGUMENT", "A stable document identity is required.")),
    save(record: DraftWriteRecord) {
      if (!record || !validKey(record.key) || typeof record.key.writerId !== "string" || !record.key.writerId || typeof record.text !== "string" || typeof record.expectedVersion !== "string" || typeof record.revision !== "string" || !record.revision || !Number.isSafeInteger(record.updatedAt)) return Promise.resolve(failure("INVALID_ARGUMENT", "A valid draft record is required."));
      const copy = Object.freeze({ ...record, key: Object.freeze({ ...record.key }) }); return invoke("save", () => storage.save(copy));
    },
    remove: (key, revision) => validKey(key) && typeof revision === "string" && !!revision ? invoke("remove", () => storage.remove({ ...key }, revision)) : Promise.resolve(failure("INVALID_ARGUMENT", "The acknowledged draft revision is required.")),
  });
  logger.info(ctx.pluginId, "Draft provider ready");
} });
