# SDK-only design scenarios

Status: P0 authored scenarios, compiled against the public SDK in P2 (`packages/sdk/test/scenarios.ts`, checked by `npm run check -- sdk`). These are not executable runtime plugins; P7 will add executable fixtures with individual plugin docs. Every scenario imports only `@lunaris/sdk` and shared contracts. Manifest snippets below are abbreviations of full serializable manifests, not independent identity fields.

Use the following common wrapper and manifest defaults:

```ts
import { definePlugin } from "@lunaris/sdk";
const manifest = {
  manifestVersion: 1, id: "example.hello", version: "0.1.0",
  engine: "^0.1.0", sdk: "^0.1.0", entry: "./dist/plugin.js",
  provides: [], requires: [], permissions: [], optionalPermissions: []
} as const;
export default definePlugin({ manifest, activate(ctx) {} });
```

The hello source requires three authored lines if the manifest is imported. It needs no logger, command service, host object or internal import.

Shared contracts for the remaining scenarios:

```ts
import { defineApi, defineEvent, defineHook } from "@lunaris/sdk";
export const Greeting = defineApi<{ greet(name: string): string }>({
  id: "example.greeting", version: "1.0.0"
});
export const Changed = defineEvent<{ text: string }>({
  id: "example.changed", version: "1.0.0"
});
export const Transform = defineHook<string>({
  id: "example.transform", version: "1.0.0"
});
export const Restricted = defineApi<{ read(): string }>({
  id: "example.restricted", version: "1.0.0",
  consumePermission: "example.read"
});
```

## Scenarios and gates

| Scenario | Manifest addition | Activation body / public operation | Acceptance and task |
|---|---|---|---|
| Hello | None | `ctx.scope.own({ dispose() {} });` | Activates/stops without services, <30 lines; K02.1, K03.3 |
| Provider | provides API example.greeting 1.0.0 | `ctx.provide(Greeting, { greet: name => "Hello " + name });` | Publication only after commit; K02.2, K04.1 |
| Consumer | requires API example.greeting ^1.0.0 | `const api = ctx.use(Greeting); api.greet("Lunaris");` | Provider auto-start; interchangeable implementation, sync result; K04.2–4 |
| Event | provider provides event example.changed 1.0.0; listener requires ^1.0.0 | listener: `ctx.events.on(Changed, payload => { void payload.text; });`; provider emits after activation via an exposed API callback: `await ctx.events.emit(Changed, { text: "ready" });` | No startup emission from staged provider; ordered isolated listeners and cleanup; K05.1/3 |
| Hook | owner provides hook example.transform 1.0.0; handler requires ^1.0.0 | handler: `ctx.hooks.register(Transform, text => text.trim(), { priority: 10 });`; owner invokes after activation via an exposed API callback: `await ctx.hooks.run(Transform, " text ");` | Sequential transformation, no-handler identity; K05.2/3 |
| Optional API | requires API example.greeting ^1.0.0, optional true | `ctx.optional(Greeting)?.greet("Lunaris");` | Missing provider allows start, no implicit later binding; K04.2/5 |
| Permission denial | requires API example.restricted ^1.0.0; optionalPermissions example.read | `if (await ctx.permissions.request("example.read")) ctx.use(Restricted).read();` | Host false skips operation; calling retained API after revocation fails; K06.1–3 |
| Activation failure | provides API example.greeting 1.0.0 | `ctx.provide(Greeting, { greet: name => name }); ctx.scope.own({ dispose() {} }); throw new Error("fixture failure");` | No published API, all owned resources disposed; K03.3 |
| Dependency loss | same as consumer | Retain `const api = ctx.use(Greeting)` in an owned callback, cleaned with `ctx.scope.own(...)` | Host `stop(providerId)` stops required consumer first; retained method throws after closure; K04.5 |

Event/hook owner API callbacks are ordinary declared API methods, provided with `ctx.provide`. They are called by an SDK-only consumer after startup; no test-only context escape is required. Optional and required requirements are mutually exclusive for a contract ID in a single manifest.

## Scope review

All scenarios map to specified public methods. Host-only actions (register, grants, provider selection, stop and inspection) stay in host fixtures, never plugin context. No application service is needed. Child scope ownership and cancellation use `ctx.scope.child()` and `ctx.signal`; no global timer helpers or raw native globals are added to the SDK. API definitions and the future runtime implement the boundary first; plugin implementation waits for its SDK operations to pass tests. Deferred features and their rationale are recorded in [D01–D10](../decisions/0001-core-baseline.md).
