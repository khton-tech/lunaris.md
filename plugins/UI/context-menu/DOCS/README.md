# Context menu provider

The plugin provides `api:lunaris.context-menu@1.0.0` through the public
`@lunaris/context-menu` contract. It owns contribution registration, context-based
tree construction, one-shot action sessions and the document overlay.

API methods: `register(contribution, owner)`, `resolve(context, owner, entries?)`
and `open(request, owner)`. It requires Logger, Components, ComponentsChanged
and `ui.dom`, subscribes to ComponentsChanged to release a removed renderer,
and emits no events. All registrations and sessions follow SDK owner signals;
cleanup uses independently disposable resources without SDK calls.

Mantine supplies the `lunaris.context-menu` role. File Explorer supplies its
invocation context and built-in actions; other plugins contribute through the
same public API. Tauri wires the provider and grants its permission. Required
integration is complete.

See the [API reference](../../../../DOCS/reference/context-menu.md) for usage,
data/ownership rules, errors, the File Explorer context and verification.
