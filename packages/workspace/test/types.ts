import { Workspace, WorkspaceChanged } from "@lunaris/workspace";
import type { WorkspaceContext } from "@lunaris/workspace";
import type { PluginContext } from "@lunaris/sdk";
declare const ctx: PluginContext;
const workspace = ctx.use(Workspace);
workspace.register({ id: "example.explorer", componentId: "example.file-tree", order: 10, props: { title: "Files" } }, ctx.signal);
workspace.update("example.explorer", { title: "Updated" });
const context: WorkspaceContext = { vaultId: "opaque-id", vaultName: "Notes" };
void context;
ctx.events.on(WorkspaceChanged, change => { const id: string = change.id; void id; });
// @ts-expect-error Registrations must have an owner.
workspace.register({ id: "example.explorer", componentId: "example.file-tree" });
// @ts-expect-error Consumers cannot mutate registry snapshots.
workspace.list().push({ id: "example.explorer", componentId: "example.file-tree" });
// @ts-expect-error Workspace owns mounting, not document persistence.
workspace.save("note.md");
