import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout, clearTimeout } from "node:timers";
import { performance } from "node:perf_hooks";
import { validateManifest } from "@lunaris/manifest";
import { definePlugin } from "@lunaris/sdk";
import type { PluginInput, PluginManifest } from "@lunaris/sdk";
import { createKernel } from "@lunaris/kernel";
import type { Kernel, KernelOptions, Scheduler } from "@lunaris/kernel";

export class LoadError extends Error {
  constructor(readonly code: string, message: string, readonly location: string, options?: ErrorOptions) {
    super(message, options); this.name = "LoadError";
  }
}
export interface LocalPlugin {
  readonly root: string;
  readonly entryPath: string;
  readonly manifest: PluginManifest;
}

function contained(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

/** Manifest/compatibility/real-path checks complete before entry evaluation. */
export async function validateLocalPlugin(inputRoot: string): Promise<LocalPlugin> {
  const location = path.resolve(inputRoot);
  try {
    const root = await realpath(location);
    if (!(await stat(root)).isDirectory()) throw new LoadError("LOAD_PATH_INVALID", "Plugin root must be a directory.", location);
    const manifestPath = await realpath(path.join(root, "manifest.json"));
    if (!contained(root, manifestPath)) throw new LoadError("LOAD_PATH_INVALID", "Manifest escapes the package root.", location);
    let input: unknown;
    try { input = JSON.parse(await readFile(manifestPath, "utf8")) as unknown; }
    catch (cause) { throw new LoadError("MANIFEST_INVALID", "Cannot parse manifest.json.", location, { cause }); }
    const result = validateManifest(input, { engineVersion: "0.1.0", sdkVersion: "0.1.0" });
    if (!result.ok) throw new LoadError(result.diagnostics[0]!.code,
      result.diagnostics.map(d => `${d.path}: ${d.message}`).join(" "), location);
    const entryPath = await realpath(path.resolve(root, result.manifest.entry));
    if (!contained(root, entryPath) || !(await stat(entryPath)).isFile()) {
      throw new LoadError("LOAD_PATH_INVALID", "Entry must be a file inside the package root.", location);
    }
    return Object.freeze({ root, entryPath, manifest: result.manifest });
  } catch (cause) {
    if (cause instanceof LoadError) throw cause;
    throw new LoadError("LOAD_PATH_INVALID", "Plugin root, manifest or built entry is missing or inaccessible.", location, { cause });
  }
}

export function createNodeScheduler(): Scheduler {
  return Object.freeze({ schedule(delayMs: number, callback: () => void) {
    if (!Number.isFinite(delayMs) || delayMs < 0) throw new Error("Invalid scheduler delay.");
    const deadline = performance.now() + delayMs;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      if (cancelled) return;
      const remaining = deadline - performance.now();
      if (remaining > 0) timer = setTimeout(tick, Math.min(remaining, 2147483647));
      else callback();
    };
    timer = setTimeout(tick, Math.min(delayMs, 2147483647));
    return () => { cancelled = true; clearTimeout(timer); };
  } });
}

export interface DevelopmentSession {
  readonly kernel: Kernel;
  readonly pluginIds: readonly string[];
  start(): Promise<void>;
  stop(): Promise<void>;
}

export async function loadLocalPlugins(roots: readonly string[], options: Omit<KernelOptions, "scheduler"> = {}): Promise<DevelopmentSession> {
  if (!roots.length) throw new LoadError("LOAD_PATH_INVALID", "At least one plugin root is required.", "");
  const checked = await Promise.all(roots.map(validateLocalPlugin));
  const ids = checked.map(item => item.manifest.id);
  if (new Set(ids).size !== ids.length) throw new LoadError("PLUGIN_DUPLICATE", "Duplicate plugin IDs in local roots.", "");
  const kernel = createKernel({ ...options, scheduler: createNodeScheduler() });
  for (const item of checked) {
    let definition;
    try {
      const entry = await import(pathToFileURL(item.entryPath).href) as { default?: unknown };
      // The factory validates this untyped JavaScript boundary without executing activation.
      definition = definePlugin(entry.default as PluginInput);
    } catch (cause) { throw new LoadError("LOAD_ENTRY_INVALID", "Entry must export a valid default plugin definition.", item.root, { cause }); }
    if (JSON.stringify(definition.manifest) !== JSON.stringify(item.manifest)) {
      throw new LoadError("MANIFEST_DRIFT", "Entry metadata differs from manifest.json; rebuild the plugin.", item.root);
    }
    kernel.register(definition);
  }
  return Object.freeze({ kernel, pluginIds: Object.freeze([...ids].sort()),
    async start() {
      try { for (const id of [...ids].sort()) await kernel.start(id); }
      catch (cause) {
        try { await kernel.stopAll(); } catch (cleanup) { throw new AggregateError([cause, cleanup], "Local startup and rollback failed."); }
        throw cause;
      }
    },
    stop: () => kernel.stopAll(),
  });
}
