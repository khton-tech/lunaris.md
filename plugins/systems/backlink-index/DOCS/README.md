# Backlink index

## Responsibility

Index Markdown sources within the active Vault and answer incoming-link and
unlinked-mention queries. UI presentation belongs to Backlinks UI. This is a
system provider, not a native driver: all I/O uses Filesystem and DocumentContent.

## Contracts

Provides Backlinks and BacklinksChanged; see `packages/backlinks/DOCS/README.md`.
Requires Logger, Filesystem, FilesystemObservation, Vault and DocumentContent.
Subscribes to FileChanged, VaultChanged and DocumentContentChanged.

The index recognizes wikilinks/embeds, Markdown inline/reference links, relative
and encoded destinations and heading/block suffixes. YAML aliases augment
unlinked-mention names. Code, comments, frontmatter and existing links are not
plain mentions. Unicode boundaries prevent matching a name inside a longer word.
Ambiguous bare wikilinks prefer nearby source directories, with deterministic
path ordering as a final tie-breaker. External URLs are never backlinks.

## Lifecycle and recovery

Recursive enumeration ignores dot-prefixed entries and does not follow symlinks.
Unchanged files reuse parsed metadata. Dirty paths force re-reading. Loaded live
buffers override disk snapshots. Queries are cached until invalidation, with a
32-entry bound. A provider-owned recursive watch follows scope cancellation;
without a watch, reconciliation runs every five seconds. Refresh forces reads.
Vault generations discard late results. Failures retain available results and
report degraded state, rather than falsely claiming the Vault has no backlinks.

Linking rechecks the displayed snapshot and occurrence. DocumentContent owns
opening, undo, autosave and conflicts; the provider never writes behind the editor.
Generated wikilinks preserve the displayed alias. Names incompatible with wiki
syntax use an encoded vault-root Markdown URL instead.

## Verification

Run `npm run backlinks:check`. Tests cover syntax, ambiguity, aliases, Unicode,
stale edits, live buffers, exclusions, deletion, failure recovery, Vault races and
watch cleanup. Integration with TextEditor and the application graph is complete;
native visual acceptance belongs to the UI plugin checklist.

YAML property scalar values also contribute explicit wikilinks with original source offsets. YAML keys/comments and plain metadata values are excluded from unlinked mentions. Dotted note names retain their full stem during resolution.

## Navigation integration

Also provides NoteLinks (1.0): parse(text) and resolve(source, link). The document-links editor contribution consumes it, so clicking a link and indexing its target use the same rules. Bare web URLs and angle autolinks are recognized; URL text is excluded from unlinked mentions. Heading/block resolution preserves raw file offsets.

`NoteLinks.parse` exposes the visible wikilink label range separately from its destination. `resolve` accepts an optional `createFromSource` snapshot to create a missing wikilink target through Filesystem. Bare names use the source folder. Explicit paths use the Vault root unless they start with `./` or `../`. Missing parent folders are created as needed. The write uses exclusive creation, and the index refreshes before returning the target.

`NoteLinks.missingTargets` reports source offsets of creatable wikilinks absent from a complete Vault listing. Consumers recheck on `BacklinksChanged`. A note that is listed but cannot be read still counts as present. An incomplete listing returns no missing offsets.
