import { Workspace, WorkspaceChanged } from "@lunaris/workspace";
import type { WorkspaceContext } from "@lunaris/workspace";
import type { PluginContext } from "@lunaris/sdk";
declare const ctx: PluginContext;
const workspace = ctx.use(Workspace);
workspace.register({ id: "example.explorer", componentId: "example.file-tree", order: 10, props: { title: "Files" } }, ctx.signal);
workspace.update("example.explorer", { title: "Updated" });
workspace.register({ id: "example.sidebar", componentId: "example.rail", region: "left-rail" }, ctx.signal);
workspace.register({ id: "example.panel", componentId: "example.panel-content", region: "left-panel", onDismiss() {} }, ctx.signal);
// @ts-expect-error Workspace regions are explicit SDK contracts.
workspace.register({ id: "example.unknown", componentId: "example.content", region: "private-slot" }, ctx.signal);
const context: WorkspaceContext = { vaultId: "opaque-id", vaultName: "Notes" };
void context;
ctx.events.on(WorkspaceChanged, change => { const id: string = change.id; void id; });
// @ts-expect-error Registrations must have an owner.
workspace.register({ id: "example.explorer", componentId: "example.file-tree" });
// @ts-expect-error Consumers cannot mutate registry snapshots.
workspace.list().push({ id: "example.explorer", componentId: "example.file-tree" });
// @ts-expect-error Workspace owns mounting, not document persistence.
workspace.save("note.md");
