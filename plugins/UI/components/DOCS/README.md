# Component provider

Purpose: register shared UI components from component set plugins and let other
plugins render them by role ID, so the interface stays consistent. Provides
`api:lunaris.components@1.0.0` (`register`, `has`, `list`, `mount`) and
`event:lunaris.components-changed@1.0.0` (`registered`/`removed`). Requires Logger
and the `ui.dom` permission. Subscribes to no SDK events.

Component sets import `Components` from `@lunaris/components` and register
`{ id, mount }` with a live owner signal. Consumers call
`mount(id, target, props, owner)` and receive a handle with `update` and `dispose`.
Removing a component or stopping the provider disposes its live instances.

No components, styles or theme logic are included; those belong to component sets
such as the initial [LunarisComponentsKit](../../components-kit/DOCS/README.md).
See [the full contract and lifecycle rules](../../../../DOCS/reference/components.md).
Run `npm run components:check` from the repository root.
