# Permission policy and trust

P6 separates permission requests in a manifest, host grants and current effective access. Merely declaring `permissions` or `optionalPermissions` grants nothing. A default/minimal host has no grants and no request callback; sensitive operations deny by default. A restricted test host explicitly allows selected declared names using `initialGrants`.

```ts
const kernel = createKernel({
  scheduler,
  initialGrants: {
    "example.provider": ["example.serve"]
  },
  requestPermission: async ({ pluginId, activationId, permission }) => {
    return hostPolicy(pluginId, activationId, permission);
  }
});
kernel.grant("example.consumer", "example.read");
kernel.revoke("example.consumer", "example.read");
```

The host callback owns any prompt/policy; kernel contains no UI. Requests are immutable. Initial grant lists are copied, checked against each manifest at atomic registration, and do not enable undeclared permissions. Later `grant`/`revoke` require a registered plugin and a declared name. Grants belong to plugin IDs and persist across activation restart until revoked. Inspection returns frozen sorted `effectivePermissions`; declarations remain separately visible in the manifest.

A token can require `providePermission` and `consumePermission`. Providing an API, emitting an event or invoking a hook checks provider authority. API acquisition/calls, event subscription/delivery and hook registration/execution check consumer authority and relevant provider authority. Metadata must agree between compatible tokens, so removing permission metadata from a forged token cannot bypass a real provider's contract. Existing handles snapshot metadata and recheck current grants, caller scope, selected provider activation and registration on every invocation.

`ctx.permissions.has(name)` queries a declared permission; `request(name)` is allowed only for `optionalPermissions`. It returns a boolean. Missing optional grants delegate to the host callback; simultaneous requests for the same activation/name share that callback. Callback `true` grants access only if the requesting activation is still current/open and the permission's host grant/revocation generation is unchanged. `false` denies; callback failure rejects with `PERMISSION_REQUEST_FAILED`. An older approval cannot undo a later host revocation. Closed pending requests settle denied and detach their listener; late callback results cannot grant access to a replacement activation.

Denial at an operation throws `PERMISSION_DENIED` before the privileged callback executes. Revoked event listeners are skipped and diagnosed; a revoked hook handler aborts its pipeline. Owner revocation rejects further dispatch. Validators are plugin code, so authority/lifecycle is rechecked after validation before invoking callbacks. Already-running operations/callbacks may finish: revocation cannot undo an external effect or force JavaScript termination. Drivers should use activation cancellation for cooperative shutdown where applicable.

Web and Tauri run built-in and installed plugins in one application realm. Both
receive their declared required and optional permissions in normal product
composition. The user decides which packages to enable. SDK permission checks
mediate operations performed through SDK handles. The shared JavaScript realm
and helpers launched under the user's OS account are outside that enforcement.
Confining a test kernel with selected grants exercises the gateway only.
See [Lime runtime](../reference/lime-runtime.md) and
[Native processes](../reference/native-processes.md).

`packages/kernel/test/permissions.test.mjs` includes minimal/restricted policy fixtures, denial/grant/revocation, stale approvals, provider/consumer checks, cached-method checks, dispatch revocation and in-flight behavior. Run `npm run check -- kernel`.
