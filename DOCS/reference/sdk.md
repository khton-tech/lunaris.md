# SDK reference (0.1 draft)

Implemented P2 exports are available from `@lunaris/sdk`. P3 implements [lifecycle and ownership](../concepts/lifecycle.md), including staged API provision. P4–P6 implement [resolution/handles](../concepts/contracts.md), [events/hooks](../concepts/dispatch.md) and [permission grants](../concepts/permissions.md). The SDK defines that boundary without importing the kernel or any platform API.

## Plugin definitions

```ts
import { definePlugin } from "@lunaris/sdk";
import manifest from "./manifest.js";

export default definePlugin({
  manifest,
  activate(ctx) {
    ctx.scope.own({ dispose() {} });
  }
});
```

`definePlugin` accepts exactly `manifest` and `activate`. The manifest is validated using the shared [manifest validator](manifest.md), copied and frozen. The definition is frozen; activation is not executed at definition time. Identity is declared only in the manifest, so a separate `id` is rejected. Invalid metadata/activation throws `LunarisError` with `MANIFEST_INVALID`, field context and manifest diagnostics as its cause.

`PluginDefinition.activate(context)` returns `void`, a `Disposable`, or a promise of either. A disposable implements `dispose(): void | Promise<void>`. Scope ownership and cancellation are implemented in P3 with behavior specified in [the boundary](core-boundary.md). A plugin's external effects still require its own cleanup.

## Typed contracts

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
```

Metadata contains a canonical ID, full strict SemVer and optional `providePermission`, `consumePermission`, and `validate(value: unknown): boolean`. Constructors validate metadata and return frozen tokens. They retain validators without executing them; The runtime validates API implementations at provision/acquisition, event input at owner/listener boundaries, and hook input/output at owner/handler boundaries. API shape parameters contain methods only, with no callable root or non-method properties. Runtime API implementations must be plain method objects; class instances/accessors/non-method properties are rejected. Context types preserve method return types, including synchronous values and promises; invocation is implemented through scoped handles.

`contractKey(token)` returns `kind:id@version`. Build metadata is retained as part of full contract identity. Runtime token identity is structural, independent of object identity or a package singleton. A private phantom type makes payloads invariant at compile time; it does not provide runtime validation or isolation.

`assertCompatibleTokens(a, b)` checks that the canonical keys and permission metadata agree. Validator function identity is deliberately excluded; each boundary uses its local validator. Call this stateless helper when the same canonical key is observed again. No shared/global token registry exists in the SDK. Token and implementation shape compatibility remains the contract author's versioning responsibility.

## Context and ownership

| Member | Public type/operation | Runtime delivery |
|---|---|---|
| Identity | readonly `pluginId`, `activationId` | P3 |
| Cancellation | `signal.aborted`, `reason`, `throwIfAborted`, abort listener add/remove | P3 |
| Scope | `scope.own(resource)`, `scope.child()`, `scope.dispose()` | P3 |
| API | `provide(token, implementation)`, `use(token)`, `optional(token)` | P4 |
| Event | `events.on(token, listener)`, `events.emit(token, payload)` | P5 |
| Hook | `hooks.register(token, handler, { priority? })`, `hooks.run(token, value)` | P5 |
| Permissions | `permissions.has(name)`, `permissions.request(name)` | P6 |

API registrations return disposables and are automatically scoped. Event payloads are shallow readonly in TypeScript; hook input and output share one waterfall type. Token parameters control inference: mismatched API implementations, event payloads and hook outputs fail typechecks. `optional` returns a possibly absent API, not a dynamically rebinding service.

`CancellationSignal` is a platform-neutral interface with zero-argument abort listeners. A native driver adapts it when a platform API requires native `AbortSignal`. Context has no host registry, grant management, native API, logger or commands. Host APIs come from `@lunaris/kernel`.

## Declaration checks and errors

`assertDeclaration(manifest, token, role)` is a public validation helper for runtime/test-host implementers. It validates the manifest using the same rules as `definePlugin`, then checks kind/ID, token version and permission declarations. Supported roles:

| Role | Declaration |
|---|---|
| `provide` | Exact advertised token version in `provides` |
| `require` | Non-optional requirement whose range includes token version |
| `optional` | Optional requirement whose range includes token version |
| `consume` | Either required or optional requirement, for event/hook operations |

Undeclared contracts or incompatible versions throw `CONTRACT_UNDECLARED`. Missing permission declarations throw `PERMISSION_DENIED`. A declared permission passes this structural check even if it has not been granted: effective grants, scope liveness and provider availability must additionally be checked by the runtime. The helper does not publish capabilities or authorize operations by itself.

`LunarisError` carries a stable `code`, copied/frozen safe `context`, message and optional native error `cause`. Context supports plugin ID, activation ID, contract ID and field path. `API_CALL_FAILED` diagnoses a provider method throw/rejection while the original thrown value still propagates to the caller. See [error categories and behavior](core-boundary.md#dispatch-and-error-categories). Raw causes are for host diagnostics and must not be exposed through inspection snapshots.

## Verification and examples

Run `npm run check -- sdk` to compile SDK/kernel, test metadata/identity/declarations, enforce package boundaries and compile positive/negative SDK fixtures. The [nine design scenarios](design-scenarios.md) compile as `packages/sdk/test/scenarios.ts`, importing only the public SDK. They are type-level scenarios, not executable lifecycle tests. P7 will turn them into separately documented example plugins after runtime gates pass.
