# Editor extensions

## Deletion effects in installed packages

`EditorEffects` from `@lunaris/editor` is provided by Text Editor. Declare
`api:lunaris.editor-effects@^1.0.0` and `ui.dom`. Register an effect with
`ctx.use(EditorEffects).register({ id, onDelete }, ctx.signal)`. Use a
plugin-scoped ID and check the returned result. The returned disposable can
also release the registration before the activation ends.

For a user deletion the editor samples up to 24 visible non-whitespace
positions. The synchronous callback receives width and height in CSS pixels.
It returns up to 96 particles. Each particle selects a sample by index,
starts at fractional `x` and `y` in that sample, travels by `dx` and `dy`
in CSS pixels, and specifies `size` and `durationMs`. Allowed ranges are
0–1 for fractions, −160–160 for travel, 1–6 px for size and 50–650 ms for
duration. The editor bounds simultaneous layers, uses the active text color
and skips effects when reduced motion is requested.

The callback receives geometry only. The editor owns the overlay and its
lifetime. Unregistering the effect or closing the view clears live particles.
Callback failures are logged by Text Editor and the document transaction
continues. Programmatic updates, undo and redo do not trigger the effect.

The [Deletion Particles example](../../examples/deletion-particles/README.md)
uses this contract from an independently built LUP package.

## Trusted CodeMirror contributions

`@lunaris/editor` exports `EditorExtensions` 1.0, provided by Text Editor.
A consumer declares the `lunaris.editor-extensions` API requirement (`^1.0.0`)
and `ui.dom` permission, then calls `ctx.use(EditorExtensions)`.

```ts
const registration = ctx.use(EditorExtensions).register({
  id: `${ctx.pluginId}.preview`,
  extension: previewExtension,
  markdown: markdownConfiguration,
}, ctx.signal);
if (!registration.ok) throw new Error(registration.error.message);
```

Both contribution fields are optional individually; at least one is required.
`extension` is a CodeMirror 6 `Extension`; `markdown` is a Lezer `MarkdownConfig`.
Use the application-compatible versions (state 6.7.6, view 6.43.15,
lang-markdown 6.5.2, language 6.13.1, Lezer Markdown 1.8.1), sharing one installed
CodeMirror instance. This is deliberately an adapter-specific contract, not a
platform-independent rendering language. Only public upstream APIs are needed;
private Text Editor imports and DOM discovery are forbidden.

## Lifetime and failures

IDs are globally unique and sorted lexically, independently of activation order.
Duplicate IDs return ALREADY_REGISTERED, missing ID/contribution returns
INVALID_ARGUMENT, and an aborted provider/owner returns CANCELLED. Successful
registration returns an idempotent Disposable. Disposal or owner abort unregisters
only that contribution and detaches its abort listener. Provider shutdown releases
all registrations without further SDK calls. Contributions are shallow snapshots;
do not mutate nested configurations after registration.

Registration changes schedule the existing editor rendering pass. Current views
update in place through dedicated language/extension compartments, and future
views use the current registry snapshot. Removal leaves Markdown source editable.
No public change event is needed: the provider owns registry application.

Extensions are trusted executable plugin code. Registration validates identity
and lifetime, not the safety of arbitrary CodeMirror code. Invalid CodeMirror or
parser configurations can fail during application and are reported by existing
editor diagnostics. Extension authors must not replace document persistence,
read-only enforcement, base keymaps, language configuration, shell surfaces or
editor-owned facets, nor perform document edits as a registration side effect.
CodeMirror exceptionSink routes runtime failures to the editor Logger; plugins
also require Logger for their own meaningful operations and failures.

## Ownership and integration

Text Editor owns documents, selections, history, saving, parser assembly and
extension installation. Workspace/ActiveScreen retain geometry and surfaces;
Mantine retains the stable editor target. Contributions own only their document
syntax and presentation. Interactive product controls must mount public Mantine
roles through Components; no React/Mantine imports in consumers.

This change introduces no product controls or visual design. No callout renderer,
Mantine callout role, insertion command or callout plugin is included. Those are
subsequent work using this contract, Themes, Localization, Logger and Components.
The application host already activates Text Editor in web and desktop; no new
provider or host grants are needed. Contract integration is connected.

Targeted tests cover independent cancellation, duplicate/rejected registration,
parser/extension installation and removal, existing/new views, retained view
identity, selection, CRLF, source and undo history. Existing composed editor/host
regressions also run. Native visual acceptance of future rendered contributions
must be checked inside Workspace; these tests do not establish visual acceptance.
