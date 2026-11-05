import { definePlugin } from "@lunaris/sdk";
import { LogSink, isLogRecord } from "@lunaris/logging";
import type { LogLevel } from "@lunaris/logging";
import { formatRecord } from "./format.js";
import manifest from "../manifest.json" with { type: "json" };

export type DevToolsOutput = Readonly<Record<LogLevel, (...args: unknown[]) => void>>;
export interface DevToolsLoggerOptions {
  readonly output?: DevToolsOutput;
  readonly banner?: { readonly art: string; readonly caption: string };
}

/** Only this driver touches the console; all inter-plugin calls use SDK contracts. */
export function createDevToolsLogger(options: DevToolsLoggerOptions = {}) {
  const output = options.output ?? console;
  const banner = options.banner ? Object.freeze({ ...options.banner }) : undefined;
  let bannerShown = false;
  return definePlugin({ manifest, activate(ctx) {
    let writing = false;
    ctx.provide(LogSink, { write(record) {
      if (writing) return false;
      writing = true;
      try {
        if (!isLogRecord(record)) return false;
        output[record.level](...formatRecord(record));
        return true;
      } catch {
        // Contain console failures before they cross the SDK API boundary.
        return false;
      } finally { writing = false; }
    } });
    if (banner && !bannerShown) {
      bannerShown = true;
      writing = true;
      try { output.info("%s\n%s", banner.art.trimEnd(), banner.caption); }
      catch { /* A startup decoration must never prevent logging or activation. */ }
      finally { writing = false; }
    }
  } });
}

export default createDevToolsLogger();
