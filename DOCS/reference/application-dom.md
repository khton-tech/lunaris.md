# Application DOM

`ApplicationDom` from `@lunaris/components` exposes the live product DOM on
Web and desktop. Add `api:lunaris.application-dom@^1.0.0` to `requires` and
`ui.dom` to `permissions`. The component provider supplies the same API to
built-in and installed plugins. Use a DOM TypeScript library in the author project.

`ctx.use(ApplicationDom).root()` returns the existing product root as an
`HTMLElement`, or `undefined` when no application surface is available.
The result is a live node. Query it with browser DOM APIs to find elements that
the current renderer already created. There is no manifest declaration or
registration for an insertion point. Host recovery chrome sits outside this
product root.

Use [Views](views.md) when rendering new screens and shared controls. Use
ApplicationDom when the task is to extend or change existing rendered elements.
Preserve the layout and surface owned by the existing container. Scope styles
to your own nodes. For elements that the renderer can recreate, observe only the
required subtree and make attachment idempotent.

Register cleanup with `ctx.scope.own({ dispose })` before applying changes.
Remove owned nodes, listeners and observers, and restore any existing attributes
that your plugin changed. The SDK revokes access to its API handle on stop.
It cannot revoke raw DOM references or undo arbitrary mutations. Do not use
those references after activation ends.

[Drema](../../examples/drema/DOCS/README.md) finds the existing status bar,
adds an image built from a packaged asset, reattaches after a rerender and
removes its changes on stop. Its selector follows the standard Mantine renderer.
Selectors tied to rendered markup can need updates after a renderer change.
