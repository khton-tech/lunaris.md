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

This milestone trusts locally supplied code in a single JavaScript realm. These checks protect mediated SDK operations; plugins can still access ambient globals or return unmediated objects if their contract authors permit it. Types, source import checks and frozen facades do not isolate hostile code. Worker/process isolation, remote packages and native capabilities need separate designs and remain deferred. No capability with a sensitive token operation is released outside this gateway.

`packages/kernel/test/permissions.test.mjs` includes minimal/restricted policy fixtures, denial/grant/revocation, stale approvals, provider/consumer checks, cached-method checks, dispatch revocation and in-flight behavior. Run `npm run check -- kernel`.
