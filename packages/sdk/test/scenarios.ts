/** P0 scenarios compiled only against public SDK exports; runtime fixtures arrive in P7. */
import { definePlugin, defineApi, defineEvent, defineHook } from "@lunaris/sdk";
import type { PluginManifest } from "@lunaris/sdk";

function manifest(id: string, additions: Partial<PluginManifest> = {}): PluginManifest {
  return { manifestVersion: 1, id, version: "0.1.0", engine: "^0.1.0", sdk: "^0.1.0",
    entry: "./dist/plugin.js", provides: [], requires: [], permissions: [], optionalPermissions: [], ...additions };
}

export const Greeting = defineApi<{ greet(name: string): string }>({ id: "example.greeting", version: "1.0.0" });
export const Changed = defineEvent<{ text: string }>({ id: "example.changed", version: "1.0.0" });
export const Transform = defineHook<string>({ id: "example.transform", version: "1.0.0" });
export const Restricted = defineApi<{ read(): string }>({ id: "example.restricted", version: "1.0.0", consumePermission: "example.read" });
const EventControl = defineApi<{ emit(text: string): Promise<void> }>({ id: "example.event-control", version: "1.0.0" });
const HookControl = defineApi<{ run(text: string): Promise<string> }>({ id: "example.hook-control", version: "1.0.0" });

// 1. Hello: no application services, and fewer than 30 authored source lines.
export const hello = definePlugin({ manifest: manifest("example.hello"), activate(ctx) {
  const child = ctx.scope.child();
  child.own({ dispose() {} });
  ctx.signal.throwIfAborted();
} });

// 2. Provider.
export const provider = definePlugin({ manifest: manifest("example.provider", {
  provides: [{ kind: "api", id: Greeting.id, version: Greeting.version }],
}), activate(ctx) { ctx.provide(Greeting, { greet: name => `Hello ${name}` }); } });

// 3. Consumer: host selection can substitute the provider unchanged.
export const consumer = definePlugin({ manifest: manifest("example.consumer", {
  requires: [{ kind: "api", id: Greeting.id, range: "^1.0.0" }],
}), activate(ctx) { const message: string = ctx.use(Greeting).greet("Lunaris"); void message; } });

// 4. Events: the API callback cannot be called until provider activation commits.
export const eventOwner = definePlugin({ manifest: manifest("example.event-owner", {
  provides: [
    { kind: "event", id: Changed.id, version: Changed.version },
    { kind: "api", id: EventControl.id, version: EventControl.version },
  ],
}), activate(ctx) { ctx.provide(EventControl, { emit: text => ctx.events.emit(Changed, { text }) }); } });
export const eventListener = definePlugin({ manifest: manifest("example.event-listener", {
  requires: [{ kind: "event", id: Changed.id, range: "^1.0.0" }],
}), activate(ctx) { ctx.events.on(Changed, payload => { void payload.text; }); } });
export const eventCaller = definePlugin({ manifest: manifest("example.event-caller", {
  requires: [{ kind: "api", id: EventControl.id, range: "^1.0.0" }],
}), async activate(ctx) { await ctx.use(EventControl).emit("ready"); } });

// 5. Hook waterfall with a declared API trigger after activation.
export const hookOwner = definePlugin({ manifest: manifest("example.hook-owner", {
  provides: [
    { kind: "hook", id: Transform.id, version: Transform.version },
    { kind: "api", id: HookControl.id, version: HookControl.version },
  ],
}), activate(ctx) { ctx.provide(HookControl, { run: text => ctx.hooks.run(Transform, text) }); } });
export const hookHandler = definePlugin({ manifest: manifest("example.hook-handler", {
  requires: [{ kind: "hook", id: Transform.id, range: "^1.0.0" }],
}), activate(ctx) { ctx.hooks.register(Transform, async text => text.trim(), { priority: 10 }); } });

// 6. Optional bindings do not require application services or a raw registry.
export const optional = definePlugin({ manifest: manifest("example.optional", {
  requires: [{ kind: "api", id: Greeting.id, range: "^1.0.0", optional: true }],
}), activate(ctx) { ctx.optional(Greeting)?.greet("Lunaris"); } });

// 7. Host denial prevents the privileged operation.
export const permissionDenial = definePlugin({ manifest: manifest("example.permission-denial", {
  requires: [{ kind: "api", id: Restricted.id, range: "^1.0.0" }], optionalPermissions: ["example.read"],
}), async activate(ctx) { if (await ctx.permissions.request("example.read")) ctx.use(Restricted).read(); } });

// 8. Failed activation rolls back the staged provider and owned resources.
export const failing = definePlugin({ manifest: manifest("example.failing", {
  provides: [{ kind: "api", id: Greeting.id, version: Greeting.version }],
}), activate(ctx) {
  ctx.provide(Greeting, { greet: name => name });
  ctx.scope.own({ dispose() {} });
  throw new Error("fixture failure");
} });

// 9. A retained provider handle remains scoped when called from a second API.
const Forward = defineApi<{ greet(): string }>({ id: "example.forward", version: "1.0.0" });
export const dependencyLoss = definePlugin({ manifest: manifest("example.dependency-loss", {
  provides: [{ kind: "api", id: Forward.id, version: Forward.version }],
  requires: [{ kind: "api", id: Greeting.id, range: "^1.0.0" }],
}), activate(ctx) {
  const greeting = ctx.use(Greeting);
  ctx.provide(Forward, { greet: () => greeting.greet("Lunaris") });
  return { dispose() {} };
} });
