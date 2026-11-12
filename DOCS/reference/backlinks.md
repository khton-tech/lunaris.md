# Backlinks

The implementation follows the core behavior described by
[Obsidian Backlinks](https://obsidian.md/help/plugins/backlinks) and
[Aliases](https://obsidian.md/help/aliases), while using Lunaris SDK contracts and
existing navigation. It is not a claim of exhaustive Obsidian compatibility.

## Architecture

| Responsibility | Owner |
| --- | --- |
| Public incoming-link query contract | `packages/backlinks` |
| Markdown parsing, aliases, index and resolution | `plugins/systems/backlink-index` |
| Tool state, actions, settings and localization | `plugins/UI/backlinks` |
| Shared controls and presentation | `plugins/UI/mantine-components` |
| Live buffers, guarded edits, Undo, draft/autosave | `plugins/UI/text-editor` through DocumentContent |
| Sidebar surface / fixed-note tab / inline region | Workspace / ActiveScreen / DocumentFooters |

All connections above are wired into `hosts/application`, shared by desktop and
browser. Disabling the editor feature also disables its backlink consumers.
No server changes or native driver dependencies are introduced.

## Available behavior

- Linked and unlinked sections, source grouping/counts and expandable context.
- Wikilinks, Markdown/reference links, embeds and note heading/block destinations.
- YAML aliases and Unicode-aware case-insensitive unlinked mentions.
- Filtering by text, quoted phrase, negation, OR, file:, path:, content: and /regex/.
- Name ascending/descending and modification-time newest/oldest ordering.
- Live buffer invalidation, file observation, manual refresh and degraded-state UI.
- Range navigation and guarded one-step Undo conversion of a mention into a link.
- Active-note tool, fixed-note screen and optional inline footer.
- Per-Vault inline preference and excluded file/folder paths; English/Russian UI.

## Compatibility boundary

The existing Lunaris sidebar is left-aligned. There is no global command-palette
contract; toolbar controls expose the backlink actions. The filter supports the
operators listed above, not Obsidian's entire Search language (nested boolean,
property, tag, block/section operators). Exclusions are literal file/folder paths,
not Obsidian regular-expression patterns. Creation-time sorting is not exposed:
the filesystem contract supplies modification time only. These are explicit
differences, not silently emulated capabilities. Notes and Markdown sources are
indexed; non-Markdown formats and Obsidian-specific workspace/plugin internals
are outside this provider's scope.

Automatic rewriting of existing links on file rename, wiki-link completion,
outgoing-link panels, hover previews and a graph are separate features. Backlinks
reconcile renamed/deleted sources but do not rewrite unrelated documents.

## Validation

`npm run backlinks:check` builds affected providers, consumers and hosts; checks
dependency boundaries and public type fixtures; runs syntax/provider, editor,
UIKit and application-startup tests. No full repository suite is required.

Native visual acceptance is pending. Follow the UI plugin checklist before
claiming complete visual integration. This feature branch must not be merged
without explicit Owner approval.
