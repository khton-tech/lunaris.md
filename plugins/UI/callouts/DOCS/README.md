# Callouts

Plugin: `lunaris.callouts`; package: `@lunaris/callouts`.
Independent editor contribution through `EditorExtensions` 1.0. The shared
application composition enables it alongside Text Editor in web and desktop;
disabling the editor feature also removes this plugin.

## Usage

```markdown
> [!warning] A title
> Content with **Markdown**.
>
> > [!tip]- Nested title
> > Initially collapsed content.
```

Write a quoted block whose first line begins with `[!type]`. Optional title text
follows whitespace. `+` immediately after `]` enables initially expanded disclosure;
`-` enables initially collapsed disclosure. Without either sign the body stays open.
A header without a body is valid. Separate sibling callouts with an unquoted blank
line. Standard Markdown quote/list nesting rules apply, including lazy paragraph
continuations. Callouts inside fences, indented code, HTML or escaped source do
not become rendered callouts.

| Type | Aliases |
| --- | --- |
| note | — |
| abstract | summary, tldr |
| info | — |
| todo | — |
| tip | hint, important |
| success | check, done |
| question | help, faq |
| warning | caution, attention |
| failure | fail, missing |
| danger | error |
| bug | — |
| example | — |
| quote | cite |

Identifiers are case-insensitive. Unknown identifiers render as note while
preserving their original source. Missing titles use localized type names.
Explicit titles display as plain text; body content uses the editor's existing
Markdown presentation, including interactive tasks. Raw HTML is never injected.

Click the chevron to toggle disclosure, or the title to place the caret in its
source. Selecting the header line reveals its source for ordinary editing.
Any selection entering hidden body content temporarily reveals it, including
secondary selections. Collapse never deletes content or changes the file.
Disclosure state is local to the editor state, follows edits before the block,
and resets to the source default if its header text changes. It is not a saved
preference and is not promised across renderer/plugin removal or application restarts.

Enter continues quote prefixes, bullets, ordered lists and unchecked task markers.
An empty list item exits the list while retaining its quote; an empty quoted line
exits one quote level. Code bodies retain indentation without list continuation.
Ordinary Markdown outside a callout retains the editor's existing commands.

## Architecture, public API and ownership

- `markdown.ts`: public Lezer Markdown composite parsing, types and aliases.
- `preview.ts`: public CodeMirror state field, mapped disclosure state, direct
  layout-aware decorations and SDK-mounted header widgets.
- `commands.ts`: public CodeMirror Enter command for the custom composite.
- `index.ts`: SDK registration, localization, theme adaptation and logging.

This plugin provides no additional service API or public event. It registers one
`EditorExtensions` contribution with ID `lunaris.callouts` and its own cancellation
signal. All integration uses public SDK services; there are no private editor imports,
platform APIs, React/Mantine consumer imports or DOM ancestry detection.

Required API connections: EditorExtensions, Components, Localization, Themes and
Logger. Subscriptions: ComponentsChanged (only `lunaris.callout-header`), LocaleChanged
and ThemeChanged. Re-registering the same state field updates presentation while
preserving existing disclosure state and the editor's document/history/selection.
Unloading unregisters the contribution and leaves the original Markdown editable.

Workspace owns outer geometry and surfaces, ActiveScreen owns screen visibility,
and the existing editor role owns its stable text target. Text Editor owns sessions,
saving, selection and undo. Callouts own only parsed document line presentation and
disclosure. The shared `lunaris.callout-header` role owns the title/icon/chevron
controls; it is embedded/content, adds no panel surface and inherits document font
metrics. Optional semantic warning/success colors use accent fallback; error types
use semantic error. No fixed Obsidian palette replaces the selected product theme.

The visual reference is [Obsidian callouts](https://obsidian.md/help/callouts),
combined with existing Lunaris task-widget/quiet Mantine control conventions.
[Mantine UI buttons](https://ui.mantine.dev/category/buttons/) were consulted.
The document presentation uses public CodeMirror decorations; all interactive
controls are Mantine components supplied through Components. Titles use Lucide
icons to distinguish types even when a theme shares their accent color.

If the header role is absent or fails to mount, editable title syntax and body
remain available and degradation is logged. Role changes allow recovery. Deferred
widget actions check owner lifetime, mount identity, source and captured editor
state, preventing stale actions after edits/removal. Rendering, localization,
theme changes and toggling never write Markdown or create undo entries.

## Integration and verification

Text Editor, Mantine Components and the shared application host are connected.
Filesystem/ActiveDocument integration remains owned by Text Editor; no direct
callout persistence integration is needed. The editor's scheduled statistics pass
also tolerates dependencies retiring during contribution teardown.

Run `npm run callouts:check` for targeted plugin, UIKit, editor and affected host
checks, architectural boundaries and type fixtures. Tests cover aliases/malformed
syntax, nesting/code exclusions, disclosure mapping, multiple selections, Enter,
composed Workspace source preservation, no writes on disclosure, localization,
theme changes, focus retention, renderer replacement and plugin unloading.

Native visual acceptance is pending: in the actual Workspace check light/dark
and Luna themes, long/wrapped titles and bodies, nested disclosure, narrow/short
windows, caret movement into and out of source, keyboard focus and Enter in
lists/tasks/fences. JSDOM does not establish native layout, pointer hit testing or
appearance. Repository policy prohibits automated desktop control.

Insertion/type-picker menus, formatted title rendering, user-defined callout
styles/types, Obsidian CSS snippets and reading/export views are outside this version.

## Card presentation correction

The Owner's comparison screenshots establish the editor's existing code-block
card as the product reference. Callouts now use the same neutral currentColor
surface mix (5%), thin boundary mix (25%), horizontal gutters and 0.4em corner
radius. Start/end line decorations provide one continuous card outline; only
outside edges have vertical padding, with additional space between title and body.
Collapsed and title-only blocks carry both edges on the header. Nested content
retains depth indentation. This replaces the quote-like left stripe and removes
header-line font weight inheritance from body content.

Mantine retains ownership of header controls. Note uses the Lucide Pencil icon;
other types retain their dedicated icons. Icons take the callout's semantic accent
through the documented inherited --callout-color token (theme accent fallback).
The title remains plain text with a transparent editing button, no hover color
change, no badge surface and no native edit tooltip; the accessible edit label
and keyboard focus remain. Workspace and editor target ownership are unchanged.

Targeted composed tests compare callout/code-block corner geometry, normal body
font weight, closed-card edges, no writes on presentation, the actual Pencil path,
and transparent title styles. Native visual acceptance remains pending: compare
with the supplied code-block reference in Workspace, including hover/focus,
light/dark themes, wrapped titles, selection and nested/folded cards.
