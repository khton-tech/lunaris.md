import { createTauriFilesystemDriver } from "@lunaris/tauri-filesystem";
createTauriFilesystemDriver();
// @ts-expect-error The bridge must return the typed filesystem result envelope.
createTauriFilesystemDriver({ request: async () => "raw native path" });
