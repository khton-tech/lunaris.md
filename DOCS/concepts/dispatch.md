# APIs, events and hooks

Use APIs for typed request/response methods, events for notifications, hooks for a sequential transformation. All use SDK tokens and manifest declarations; do not implement a second registry in plugin code.

The event/hook owner advertises `provides`; subscribers/handlers declare `requires`. Owner endpoints commit with activation. Register listeners during activation; emit/run after activation, commonly from a declared API method. Emitting/running a staged endpoint fails `CONTRACT_UNAVAILABLE`. Listeners/handlers are automatically owned, independently disposable and hidden until their consumer commits.

Events snapshot subscriptions in registration order and await listeners sequentially. Removing a pending listener skips it; new listeners wait for the next emission. Listener validation/failure is isolated and diagnosed as `EVENT_LISTENER_FAILED`; owner validation/authorization/cancellation rejects emission. Nested emissions execute immediately with a fresh snapshot. Event payloads are readonly by type, without runtime deep cloning.

Hooks snapshot handlers, sorting ascending finite numeric priority (default 0), then stable plugin ID and registration order. Each handler receives the prior output. No handlers returns input. Validate input and each output with locally supplied validators; invalid output or handler failure diagnoses `HOOK_FAILED` and aborts with the original cause. Nested runs are independent pipelines. Avoid recursive application loops in either primitive.

Before each callback recheck caller/owner lifecycle, binding, declarations and permissions. Closed/unsubscribed consumers are skipped. Owner stop cancels subsequent callbacks; an already-running callback may settle and its external effects cannot be undone. Removed registrations immediately release their ownership slot. Provider replacement never silently rebinds old registrations.

The compiled SDK-only recipes in `packages/sdk/test/scenarios.ts` demonstrate `ctx.events.on/emit` and `ctx.hooks.register/run` triggered through ordinary APIs. Runtime ordering, nested dispatch, validator failure, staging and cancellation are covered by `packages/kernel/test/dispatch.test.mjs`. Run `npm run check -- kernel`.
