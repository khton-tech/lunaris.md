import { loadLocalPlugins } from "@lunaris/development";
const session = await loadLocalPlugins(["."]);
await session.stop();
// @ts-expect-error The local host exposes root exports only.
import "@lunaris/development/src/index.js";
