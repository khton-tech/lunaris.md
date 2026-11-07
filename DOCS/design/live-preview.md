# Live Preview Markdown foundation

Researched on 2026-11-07. Implementation is in the Text Editor's CodeMirror adapter;
the existing public Mantine editor role owns its localized mode control.

## Reference behavior

Primary sources:

- [Obsidian views and editing modes](https://obsidian.md/help/edit-and-read): Live
  Preview is an editing mode with inline formatting; entering formatted content
  reveals its source. Source mode shows all syntax. Reading view is separate.
- [Obsidian Live Preview introduction](https://obsidian.md/blog/live-preview-update/):
  preview and editing share the same document surface, with syntax around the cursor.
- [Obsidian Markdown syntax](https://obsidian.md/help/syntax): supported formatting
  also includes Obsidian-specific extensions beyond CommonMark.
- [CodeMirror decorations](https://codemirror.net/docs/ref/#view.Decoration): marks,
  replacements and line decorations provide presentation over immutable text.
- [Mantine UI buttons](https://ui.mantine.dev/category/buttons/): consulted for the
  shared control; existing editor recovery buttons define the product reference.

Obsidian's help specifies user-visible behavior, not a public algorithm for every
selection boundary. The choices below are Lunaris implementation decisions rather
than claims about Obsidian internals.

## Rules

1. Markdown remains the source of truth. Preview does not serialize rendered DOM,
   rewrite syntax, fetch remote resources or inject HTML.
2. Format parsed constructs. Respect escapes, nesting and literal code; incomplete
   or unsupported syntax remains editable text.
3. Reveal inline syntax when any selection range touches its construct. Reveal
   structural markers on selected source lines. Include boundaries so keyboard
   movement can enter hidden delimiters without treating whole phrases as atomic.
4. Preserve source/history/selection and CRLF on mode changes. Rendering alone must
   not dirty a document or trigger filesystem writes.
5. Use visible-range decorations and react to incremental parser progress. Do not
   remove line breaks through a ViewPlugin; complex block replacement requires a
   separate layout-aware design.
6. Keep Workspace/ActiveScreen geometry and surfaces intact. The Mantine role owns
   controls; CodeMirror owns document typography, local selection and scrolling.
   Reuse semantic theme colors and localized labels through existing SDK services.

## Delivered and outstanding

The [plugin guide](../../plugins/UI/text-editor/DOCS/README.md#live-preview-behavior-and-limits)
specifies exact supported syntax, source fallbacks and integration status. This
delivery establishes common Markdown presentation and a Source mode escape hatch;
it does not claim all Obsidian renderers or editing interactions.

Tests cover syntax/escape/nesting behavior, multiple selections, literal code and
HTML, structural markers, edit-driven updates, composed mode control, no writes on
mode changes, history/CRLF and renderer replacement. Native pointer hit testing,
caret geometry, scrolling, themes and narrow layouts require manual acceptance in
the actual Tauri Workspace. Desktop automation is prohibited by repository policy.
