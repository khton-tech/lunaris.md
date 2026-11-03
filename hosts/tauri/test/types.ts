import { HostSession, createWebviewScheduler } from "@lunaris/tauri";
import type { ApplicationDefinition, HostSnapshot } from "@lunaris/tauri";
const definition: ApplicationDefinition = { plugins: [], entrypoints: [] };
const session = new HostSession({ scheduler: createWebviewScheduler(), load: async () => definition });
session.subscribe((snapshot: HostSnapshot) => { const visible: boolean = snapshot.applicationVisible; void visible; });
// @ts-expect-error Plugin runtime contexts must not expose the privileged host registry.
const context: import("@lunaris/sdk").PluginContext = session;
void context;
// @ts-expect-error The host package has root exports only.
import "@lunaris/tauri/src/session.js";
