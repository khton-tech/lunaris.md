import { definePlugin } from "@lunaris/sdk";
import { Logger, LogSink, isLogInput, logLevels } from "@lunaris/logging";
import type { LogDetails, LogInput, LogLevel, LogRecord } from "@lunaris/logging";
import manifest from "../manifest.json" with { type: "json" };

export interface LoggerOptions {
  readonly minimumLevel?: LogLevel;
}

export function createLogger(options: LoggerOptions = {}) {
  const minimum = options.minimumLevel ?? "info";
  if (!Object.hasOwn(logLevels, minimum)) throw new Error("Invalid minimum log level.");
  return definePlugin({ manifest, activate(ctx) {
    const sink = ctx.use(LogSink);
    let writing = false;
    function log(input: LogInput): boolean {
      if (writing) return false;
      writing = true;
      try {
        if (!isLogInput(input) || logLevels[input.level] < logLevels[minimum]) return false;
        const record: LogRecord = Object.freeze({
          timestamp: Date.now(), level: input.level, source: input.source, message: input.message,
          ...(input.code === undefined ? {} : { code: input.code }),
          ...(input.data === undefined ? {} : { data: input.data }),
          ...(input.error === undefined ? {} : { error: input.error }),
        });
        return sink.write(record);
      } catch {
        // Never recurse through the logger to report a failed logging attempt.
        return false;
      } finally { writing = false; }
    }
    const at = (level: LogLevel, source: string, message: string, details?: LogDetails): boolean =>
      log({ ...details, level, source, message });
    ctx.provide(Logger, {
      log,
      debug: (source, message, details) => at("debug", source, message, details),
      info: (source, message, details) => at("info", source, message, details),
      warn: (source, message, details) => at("warn", source, message, details),
      error: (source, message, details) => at("error", source, message, details),
    });
    log({ level: "info", source: ctx.pluginId, message: "Logger ready", code: "LOGGER_READY" });
  } });
}

export default createLogger();
