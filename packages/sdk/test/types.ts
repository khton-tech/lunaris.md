import type { Disposable, PluginManifest } from "@lunaris/sdk";
// @ts-expect-error Private package paths must not resolve.
import type { Disposable as PrivateDisposable } from "@lunaris/sdk/src/index.js";

const resource: Disposable = { async dispose() {} };
void resource;
// @ts-expect-error Disposers must return void or Promise<void>.
const invalid: Disposable = { dispose: () => "unreleased" };
declare const manifest: PluginManifest;
// @ts-expect-error The context cannot turn manifest metadata mutable.
manifest.permissions.push("example.write");
void invalid;

import { defineApi, defineEvent, defineHook, definePlugin } from "@lunaris/sdk";
import type { ApiToken, EventToken, HookToken, PluginContext } from "@lunaris/sdk";
declare const ctx: PluginContext;
const api = defineApi<{ greet(name: string): string }>({ id: "example.greeting", version: "1.0.0" });
const asynchronous = defineApi<{ run(): Promise<number> }>({ id: "example.async", version: "1.0.0" });
const event = defineEvent<{ text: string }>({ id: "example.changed", version: "1.0.0" });
const hook = defineHook<string>({ id: "example.transform", version: "1.0.0" });
ctx.provide(api, { greet: name => name });
const syncResult: string = ctx.use(api).greet("Lunaris");
const asyncResult: Promise<number> = ctx.use(asynchronous).run();
ctx.hooks.register(hook, async text => text.trim());
ctx.events.on(event, payload => {
  // @ts-expect-error Event payloads are readonly.
  payload.text = "changed";
});
// @ts-expect-error Provider return type must match its token.
ctx.provide(api, { greet: () => 42 });
// @ts-expect-error Provider arguments must match its token.
ctx.provide(api, { greet: (name: number) => String(name) });
// @ts-expect-error Consumer methods retain argument types.
ctx.use(api).greet(42);
// @ts-expect-error Optional APIs can be absent.
ctx.optional(api).greet("Lunaris");
// @ts-expect-error Hook outputs cannot widen the declared payload.
ctx.hooks.register(hook, () => 42);
// @ts-expect-error Hook inputs cannot widen the declared payload.
ctx.hooks.run(hook, 42);
// @ts-expect-error Event payload must match its token.
ctx.events.emit(event, { text: 42 });
// @ts-expect-error API tokens cannot become event tokens.
ctx.events.on(api, () => {});
// @ts-expect-error Payload types are invariant even for structurally related tokens.
const widerEvent: EventToken<{ text: string | number }> = event;
// @ts-expect-error Hook tokens retain their waterfall type.
const widerHook: HookToken<string | number> = hook;
// @ts-expect-error API contracts expose methods only.
defineApi<{ value: string }>({ id: "example.invalid", version: "1.0.0" });
// @ts-expect-error Callable API roots are unsupported.
defineApi<() => string>({ id: "example.invalid", version: "1.0.0" });
// @ts-expect-error Definition metadata cannot repeat identity outside manifest.
definePlugin({ manifest, id: "example.drift", activate() {} });
// @ts-expect-error Host management never leaks into plugin context.
ctx.register({});
// @ts-expect-error There is no mandatory logger in the kernel context.
ctx.log.info("hello");
// @ts-expect-error Host grants cannot be changed by plugins.
ctx.permissions.grant("example.read");
// @ts-expect-error API token shapes cannot be widened independently of implementations.
const widerApi: ApiToken<{ greet(name: string): string | number }> = api;
void [syncResult, asyncResult, widerApi, widerEvent, widerHook];
