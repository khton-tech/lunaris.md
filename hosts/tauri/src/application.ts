import type { ApplicationDefinition } from "./session.js";
import { createLogger } from "@lunaris/logger";
import { createDevToolsLogger } from "@lunaris/dev-tools-logger";
import art from "../../../resources/ascii_art.txt?raw";
import filesystem from "@lunaris/filesystem-provider";
import tauriFilesystem from "@lunaris/tauri-filesystem";
import vaultManager from "@lunaris/vault-manager";

// Reuse this definition across recovery attempts to print the banner once per page load.
const devTools = createDevToolsLogger({ banner: { art, caption: "Lunaris.md · v0.1.0 · Tauri" } });
const logger = createLogger();

/** Host composition point. Product plugins import only the public SDK. */
export function composeApplication(_target: HTMLElement): ApplicationDefinition {
  return {
    plugins: [devTools, logger, tauriFilesystem, filesystem, vaultManager],
    entrypoints: [vaultManager.manifest.id],
    grants: {
      [tauriFilesystem.manifest.id]: ["filesystem.native"],
      [filesystem.manifest.id]: ["filesystem.access", "filesystem.app-config"],
      [vaultManager.manifest.id]: ["filesystem.access"],
    },
  };
}
