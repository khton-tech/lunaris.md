import type { ContextMenuApi, MenuEntry } from "@lunaris/context-menu";
import type { CancellationSignal } from "@lunaris/sdk";
declare const api: ContextMenuApi;
declare const owner: CancellationSignal;
const action: MenuEntry = { kind: "action", id: "example.action", label: "Action", icon: "copy", run(context) { void context.source; } };
api.register({ id: "example.tools", build: () => [{ kind: "group", id: "example.group", label: "Tools", children: [action] }] }, owner);
// @ts-expect-error Actions must have an execution handler.
const invalid: MenuEntry = { kind: "action", id: "example.invalid", label: "Invalid" };
void invalid;
