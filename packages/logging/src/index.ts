import { defineApi } from "@lunaris/sdk";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogDetails {
  readonly code?: string;
  readonly data?: unknown;
  /** Keep the original error so DevTools can inspect its stack and cause. */
  readonly error?: unknown;
}

export interface LogInput extends LogDetails {
  readonly level: LogLevel;
  /** Explicit attribution, normally the consumer's ctx.pluginId. */
  readonly source: string;
  readonly message: string;
}

export interface LogRecord extends LogInput {
  /** Unix epoch milliseconds, assigned by the logger. */
  readonly timestamp: number;
}

export interface LoggerApi {
  /** True means delivered; false means filtered, invalid, reentrant or undelivered. */
  log(input: LogInput): boolean;
  debug(source: string, message: string, details?: LogDetails): boolean;
  info(source: string, message: string, details?: LogDetails): boolean;
  warn(source: string, message: string, details?: LogDetails): boolean;
  error(source: string, message: string, details?: LogDetails): boolean;
}

export interface LogSinkApi {
  /** Synchronous delivery. Implementations must contain output failures and return false. */
  write(record: LogRecord): boolean;
}

function hasMethods(value: unknown, names: readonly string[]): boolean {
  if (value === null || typeof value !== "object") return false;
  return names.every(name => typeof Object.getOwnPropertyDescriptor(value, name)?.value === "function");
}

export const Logger = defineApi<LoggerApi>({
  id: "lunaris.logger", version: "1.0.0",
  validate: value => hasMethods(value, ["log", "debug", "info", "warn", "error"]),
});
export const LogSink = defineApi<LogSinkApi>({
  id: "lunaris.log-sink", version: "1.0.0", validate: value => hasMethods(value, ["write"]),
});

export const logLevels: Readonly<Record<LogLevel, number>> = Object.freeze({ debug: 10, info: 20, warn: 30, error: 40 });

export function isLogInput(value: unknown): value is LogInput {
  if (typeof value !== "object" || value === null) return false;
  const input = value as Partial<LogInput>;
  return typeof input.level === "string" && Object.hasOwn(logLevels, input.level) &&
    typeof input.source === "string" && input.source.trim().length > 0 &&
    typeof input.message === "string" && input.message.trim().length > 0 &&
    (input.code === undefined || typeof input.code === "string");
}

export function isLogRecord(value: unknown): value is LogRecord {
  return isLogInput(value) && "timestamp" in value && typeof value.timestamp === "number" &&
    Number.isFinite(value.timestamp) && Math.abs(value.timestamp) <= 8.64e15;
}
