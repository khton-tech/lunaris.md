# Status bar

Purpose: a replaceable, thin document status view under Workspace main. Shows the
active filename (extension hidden; full Vault-relative path in the title), optional
server connection status, and right-aligned live word/letter counts. Without an
active document it shows No file open; loading/unsupported buffers omit counts.

## Required and existing services

The controller uses only public SDK contracts: Logger, Workspace 1.2,
ActiveDocument/ActiveDocumentChanged, Vault/VaultChanged, FilesystemSources,
ConnectionStatus/ConnectionChanged, AccountSession/AccountSessionChanged and
Localization/LocaleChanged. DocumentStatistics/DocumentStatisticsChanged are
optional so a composition without Text Editor still shows file/connection context.
The renderer belongs to the existing Mantine component set, not this controller.
No new data provider, native driver or direct document/filesystem reads are needed.

## Public contribution and lifecycle

Registers lunaris.status-bar.content in the exclusive Workspace bottom region,
using component role lunaris.status-bar. The plugin provides no callable APIs.
Its registration and localization catalog belong to ctx.signal. It subscribes to
all required change events and, when present at activation, the statistics event.
Replacing an optional statistics provider after activation requires restarting the
consumer to establish its event subscription. Theme changes are handled by UIKit.
Only changed props update Workspace. No SDK calls occur after cancellation.

The role accepts localized strings: label, filename, fileTitle, serverLabel,
serverTitle, wordsLabel and lettersLabel, nullable nonnegative integer words/letters,
and nullable serverState (connected/offline/expired/unknown). Null values omit their
sections. Visible text is the filename and numeric counts; Lucide word/letter and
state-specific server icons replace captions. Localized labels remain in native
title tooltips and accessible image names. Dynamic filenames remain plain text. Full names use native title tooltips;
there are no interactive controls or extra tab stops. New locales can supply the
catalog keys from src/index.ts; numeric values use message parameters.

## Counting and server semantics

Text Editor owns statistics of the unsaved raw Markdown buffer through
[DocumentStatistics](../../../../DOCS/reference/active-document.md#buffer-statistics).
Words use Unicode word-like segmentation, including numbers; letters count
Unicode Letter code points, excluding digits, whitespace, punctuation and emoji.
The controller requires an exact active target match before showing counts.

Server information appears only when FilesystemSources.remoteIdentity identifies
the currently opened root as remote. A connected/offline snapshot must match its
server and the current account ID/session epoch. Expired status may remain visible
after authentication is cleared. Unmatched data displays an unknown state. The
status is the last observed request outcome, not heartbeat-based availability;
this plugin never initiates network requests or polling. Logger records readiness,
connection state transitions, unavailable statistics and registration failures,
without document text, file paths, credentials or server addresses.

## Layout ownership and reference

WorkspaceLayout owns region placement under main, the Paper supporting surface,
external spacing, rounded corners and overflow. The Files panel and rail retain
full height. The embedded/content status role owns only its internal Group/Text
composition and spacing, stays transparent, and never restyles a borrowed target.
The panel retains intrinsic single-line height in every width. Long filenames
truncate with full titles; numeric groups never wrap and remain right-aligned.
The existing region overflow policy handles extreme width constraints. The owned
UIKit root grows across the borrowed row with flex: 1 1 auto and normal
containment, preserving intrinsic height and preventing inline-size containment
from collapsing its width.

Reference: the Owner's highlighted strip beneath main and existing quiet Files
footer/theme tokens. [Mantine UI footers](https://ui.mantine.dev/category/footers/)
was consulted; no gallery runtime or decorative links/icons were added. The
intentional adaptation is the product supporting card surface with theme spacing.

## Integration and acceptance

Completed public integrations: Workspace provider/controller/layout bottom region,
Text Editor statistics, Server Transport snapshot, and shared application host
registration/grants for browser and Tauri. The account session and filesystem
router supply existing account/root identity contracts. No integration is pending
for the described first plugin. The second requested plugin has no specification.

Run npm run status-bar:check for targeted checks and npm run web:build for the
production frontend. Automated regressions cover real Workspace/Mantine composition,
identity/count changes, stale snapshots, local/remote transitions, offline/expired/
recovery, missing editor, lifecycle cleanup, safe text and embedded presentation.
Manual visual acceptance remains pending in the running host: open a local and a
server Vault; type without saving; switch/rename/close files; interrupt/recover the
server; compare light/dark/XP themes, long paths and narrow/short windows. Confirm
the thin strip remains under main with intact panel geometry and readable counts.
Desktop automation is prohibited and was not used.

## Single-row correction

The Owner's follow-up screenshot showed a tall two-line block with the filename
compressed away. The prior intrinsic root did not grow horizontally and its
inline-size containment collapsed the available width; container-query wrapping
then stacked metrics. The role now explicitly fills its row without size
containment and uses a single non-wrapping layout. Icon/value groups replace
visible captions. Workspace still owns the outer surface; no SDK/container API
change or new integration is required. Tests load the actual status CSS and cover
row growth, no wrapping, right alignment, safe names, zero counts, icons and
accessible labels. Native visual acceptance of the correction remains pending.

## Russian UI copy

English and Russian catalogs are owned by this consumer. Messages reach shared
Mantine roles through Localization/LocaleChanged and existing public component
props; no renderer translation or SDK change is required. Interface Settings
selects and persists Russian per Vault. Names and user content stay unchanged.
Run `npm run ui-localization:check` for complete keys and matching placeholders.
Native acceptance of long Russian labels, menus and narrow layouts is pending.
