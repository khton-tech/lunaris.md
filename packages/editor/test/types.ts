import type { EditorExtensionsApi } from "../src/index.js";
import type { CancellationSignal } from "@lunaris/sdk";
declare const api: EditorExtensionsApi;
declare const signal: CancellationSignal;
api.register({ id: "example", extension: [] }, signal);
// @ts-expect-error Contributions require an ID.
api.register({ extension: [] }, signal);
// @ts-expect-error Registration requires an owner lifetime.
api.register({ id: "example", extension: [] });
