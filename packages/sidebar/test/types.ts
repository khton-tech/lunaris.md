import { Sidebar, SidebarChanged } from "@lunaris/sidebar";
import type { PluginContext } from "@lunaris/sdk";
declare const ctx: PluginContext;
const sidebar = ctx.use(Sidebar);
sidebar.register({ id: "example.files", title: "Files", icon: "files", componentId: "example.file-tree" }, ctx.signal);
sidebar.select("example.files"); sidebar.select(null);
sidebar.update("example.files", { title: "Files", icon: "folder", props: { filter: "" } });
ctx.events.on(SidebarChanged, snapshot => { const id: string | null = snapshot.activeId; void id; });
// @ts-expect-error Tab ownership is required.
sidebar.register({ id: "example.files", title: "Files", icon: "files", componentId: "example.file-tree" });
// @ts-expect-error Registry snapshots cannot be mutated.
sidebar.snapshot().tabs.push({});
// @ts-expect-error Sidebar does not own file reads.
sidebar.readFile("note.md");
