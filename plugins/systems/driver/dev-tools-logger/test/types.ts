import { createDevToolsLogger } from "@lunaris/dev-tools-logger";
createDevToolsLogger({ banner: { art: "LUNARIS", caption: "test" } });
// @ts-expect-error Native severity methods must all be available.
createDevToolsLogger({ output: { info() {} } });
