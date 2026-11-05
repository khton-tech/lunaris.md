import { createLogger } from "@lunaris/logger";
createLogger({ minimumLevel: "warn" });
// @ts-expect-error Reject unsupported levels at the composition boundary.
createLogger({ minimumLevel: "silent" });
