import { ApplicationDirectory, FilesystemRoots } from "@lunaris/filesystem";
import type { FilesystemApi, FsResult, TextFile } from "@lunaris/filesystem";
import type { PluginContext } from "@lunaris/sdk";
declare const fs: FilesystemApi;
const read: Promise<FsResult<TextFile>> = fs.readText({ vaultId: "vault-1", path: "note.md" });
void read;
// @ts-expect-error A Vault ID is required; no implicit active-Vault lookup.
fs.readText({ path: "note.md" });
// @ts-expect-error Saving requires an explicit creation/replacement policy.
fs.writeText({ vaultId: "vault-1", path: "note.md" }, "text");
// @ts-expect-error Unknown write modes must not silently overwrite.
fs.writeText({ vaultId: "vault-1", path: "note.md" }, "text", { mode: "force" });
// @ts-expect-error Creating a new file cannot compare an existing version.
fs.writeText({ vaultId: "vault-1", path: "note.md" }, "text", { mode: "create", expectedVersion: "old" });

declare const ctx: PluginContext;
void ctx.use(ApplicationDirectory).openConfig(ctx.signal);
void ctx.use(FilesystemRoots).selectVault(ctx.signal);
// @ts-expect-error Application roots require lifecycle ownership.
ctx.use(ApplicationDirectory).openConfig();
