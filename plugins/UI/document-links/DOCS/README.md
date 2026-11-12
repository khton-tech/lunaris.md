# Document links

This editor contribution connects rendered links to navigation. It consumes
EditorExtensions, NoteLinks, ActiveDocument, DocumentContent, ExternalLinks and
Logger, requiring ui.dom, vault.access and links.open. No private editor or
platform API is imported and no events are published.

Ordinary left click opens a wikilink, Markdown link/reference, angle autolink or
bare web URL. Enter on a focused link and Ctrl/Cmd+Enter at a link also open it.
Alt-click or Shift-click retain normal source editing/selection. Inline/fenced
code is not interactive. Native HTML rendering remains disabled.

NoteLinks shares parsing/path resolution with backlink indexing. Internal
navigation resolves headings/block IDs, checks the current source snapshot,
and calls DocumentContent.reveal through normal save/conflict guards. The
Backlinks panel follows ActiveDocument and shows the incoming source. Pending
navigation is discarded after a competing click, source change or Vault switch.
External URLs go exclusively through ExternalLinks to the selected driver.

CodeMirror owns document geometry and the existing live-preview presentation.
This contribution adds link semantics, pointer/focus treatment and interactions,
using existing theme tokens. It creates no application-shell controls/surfaces.
Decoration positions use normalized editor line breaks; SDK snapshots preserve
the source's CRLF convention, converted at the editor transaction boundary.

Integrated into the browser/desktop application graph alongside Backlinks.
Disabling the editor feature disables this contribution. Run npm run links:check.
Integration tests cover real editor clicks, incoming panel updates, external API
calls, keyboard activation, CRLF navigation/linking/Undo and lifetime cleanup.
Manual acceptance remains required for pointer/focus appearance and actual
system-browser launching after restarting Tauri.

In Live Preview, `[[note]]` displays `note` and `[[note|Display name]]` displays `Display name`. Moving the focused selection into the link exposes its source. The editor installs this behavior through the `EditorExtension.preview` contribution. Activating a missing wikilink opts into creating an empty note, then opens it through DocumentContent. The display alias has no effect on the file name.

Without a display alias, `[[folder/note.md#heading]]` displays `note`. Navigation still uses the full destination, including the heading. A same-note link such as `[[#heading]]` displays its heading reference.

Wikilinks to absent notes use the theme's secondary text color and a dashed underline. They retain this appearance on hover and show the usual keyboard focus outline. The links remain actionable. `BacklinksChanged` refreshes open editor views after the index detects creation or deletion. Missing styling requires a complete file listing. Native contrast and focus appearance remain manual checks.
