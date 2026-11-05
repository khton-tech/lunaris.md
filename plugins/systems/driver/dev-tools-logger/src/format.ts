import type { LogRecord, LogLevel } from "@lunaris/logging";

const styles: Readonly<Record<LogLevel, string>> = Object.freeze({
  debug: "color:#737373;font-weight:600",
  info: "color:#3978c6;font-weight:600",
  warn: "color:#946200;font-weight:700",
  error: "color:#d93025;font-weight:700",
});
const plain = "color:inherit;font-weight:normal";
const singleLine = (value: string): string => value.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, " ");

/** A constant format string prevents message text from injecting console directives. */
export function formatRecord(record: LogRecord): readonly unknown[] {
  const date = new Date(record.timestamp);
  const pad = (value: number, width = 2): string => String(value).padStart(width, "0");
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
  const args: unknown[] = [
    "%c%s%c %c%s%c [%s] %s%s",
    "color:#737373", time, plain,
    styles[record.level], record.level.toUpperCase().padEnd(5), plain,
    singleLine(record.source), singleLine(record.message), record.code ? ` · ${singleLine(record.code)}` : "",
  ];
  if (record.data !== undefined) args.push(record.data);
  if (record.error !== undefined) args.push(record.error);
  return args;
}
