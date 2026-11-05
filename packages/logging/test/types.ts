import type { LoggerApi, LogRecord } from "@lunaris/logging";
declare const logger: LoggerApi;
const delivered: boolean = logger.error("test.consumer", "Save failed", { code: "SAVE_FAILED", error: new Error("disk") });
void delivered;
// @ts-expect-error Unknown levels must not silently become info messages.
logger.log({ level: "fatal", source: "test.consumer", message: "Failure" });
// @ts-expect-error Source attribution is required.
logger.info("Only a message");
declare const record: LogRecord;
// @ts-expect-error Record metadata is immutable.
record.timestamp = 0;
