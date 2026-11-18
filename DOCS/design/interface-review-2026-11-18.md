# Interface review, 18 November 2026

The review follows the path from first paint and Vault selection through Files,
document editing, Settings and desktop notifications. The product references
are the [Vault selector prototype](prototypes/vault-manager.html), the existing
Files tool, the open editor column and the two Luna captions. The ownership and
interaction criteria are in the [UI guidelines](../UI_GUIDELINES.md).

## Findings and changes

| Area | Finding | Result |
| --- | --- | --- |
| First paint | The web development entry received shell styles only through JavaScript. The fixed-size ASCII artwork could overflow a narrow allocation. | Web loads the same shell sheet as Tauri before bootstrap. HTML and the themed Runner size artwork and surrounding space to the available region. |
| Startup composition | On a desktop launch, the caption and editor callouts requested their renderers before registration and entered their fallback states. | The application selects the saved theme and prepares the public component roles before starting the views. Both startup warnings cleared on reload. |
| Local Vault selection | The selected directory could lose its distinguishing path segments to ellipsis. | The folder field wraps its value. The selector reserves space for inline forms when positioning the action group. |
| Server access | The create form appeared below the trash action. A list error offered two refresh actions. A connection failure could show password recovery guidance. The outer action still asked a signed-in user to sign in. | The form opens at its own trigger and Escape returns focus there. List errors appear beside refresh, credential errors own the recovery hint, and the selector labels the destination “Server vaults” throughout. |
| Files and Workspace | Deep indentation consumed the filename column. The virtual tree used the outer height including its borders, and the loading message competed for row space. Long names displaced footer counts. | The tree measures its inner allocation, keeps filenames visible at increasing depth and uses the same indentation for dragging. The toolbar wraps, tabs retain a readable minimum, and the status bar gives counts space before truncating the filename. |
| Document title | The title of the sample note was truncated at both 390 and 1120 pixels. In a narrow desktop column a 219-character title at a 24 px reading size could displace the editor entirely. | Ordinary titles wrap to their full height. Oversized desktop titles scroll inside the field, leaving 156 px for the document body in the stress case. Enter commits one filename and Escape cancels. |
| Document content | Backlinks or recovery content could squeeze the editor vertically. Inline code and links could take the primary button fill as their text color. Callouts could keep the previous palette after a theme change. | The editor owns scrolling when feedback or a footer is present. Recovery and Backlinks align with the document column. Code, markers, links and callouts follow the active theme. |
| Settings | Changing categories could retain a scroll position partway down the previous page. At 844 × 390 the theme menu extended below the viewport. Opening a long list in Luna hid the current choice. | Changing category returns to its heading. Translation and theme updates preserve the reading position. The menu fits the available space, scrolls to the current choice on open, and distinguishes the keyboard cursor from the saved value. |
| Lime | Import errors could appear behind the package dialog. At short heights the footer competed with the content for space. | The open dialog owns its error. Content and actions remain reachable by scrolling. Switches use the shared input states and touch targets. |
| Desktop notifications | In the 384 × 64 Monochrome window a long title pushed the first message line below the window. Both Luna variants exposed fractions of text lines. | The initial view shows one title line and two message lines in the three tested themes. Longer text scrolls within each area. |

## Palette and controls

Monochrome now separates the working surface (#141414), supporting cards
(#1A1A1A), row hover (#292929) and selection (#373737). The filename uses
#E7E7E7 and its supporting path uses #B8B8B8. Decorative separators use
#333333. Form fields use the control boundary directly. On the Monochrome
Settings surface this raises the resting boundary contrast from approximately
1.9:1 to 5.0:1.

All 13 bundled presets have separate primary and supporting text colors,
separate resting and hovered primary fills, and distinct hover and selection
surfaces. Palette tests cover the project thresholds of 4.5:1 for normal text
and 3:1 for meaningful boundaries and focus on their intended surfaces. The
destructive action is checked against its tinted background in all three
interaction states. See the [palette mappings](../reference/base-theme.md) and
the [W3C guidance on non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).

## Rendering and integration

The [sample renderer](../../tools/scripts/render-ui-samples.mjs) mounts the
production Mantine roles, Workspace, Sidebar and Settings in offline Chromium.
Document samples mount CodeMirror with an in-memory Markdown file and a nested
Files tree. The following command reproduces the PNGs after building the
affected TypeScript packages.

```sh
node tools/scripts/render-ui-samples.mjs <chrome-headless-shell> <output-directory>
```

Twelve samples cover Russian labels in Monochrome, Everforest Dark, Luna and
Luna Dark at 1120 × 740, 390 × 680 and 844 × 390. Geometry assertions check
the embedded server form, package dialog actions, open theme menus and their
selected option, filename wrapping and desktop status metrics. Three
notification samples were rendered separately at 384 × 64 using the
external-window stylesheet. The data in these fixtures is synthetic.

The host owns first paint, Workspace owns its regions, and the shared component
plugin renders controls. Vault Selector, Account Access, Files, Settings and
Lime continue to mount public component roles. Palette and document changes
propagate through Themes and ThemeChanged. Notifications use the existing
external-window and component contracts.

The targeted integration run passed 287 tests. Both desktop and web frontends
built successfully. The UI source audit checked 30 plugins and 120 files. The
localization check matched 436 messages across 20 English/Russian catalogs.

The Tauri desktop application started successfully. The saved server session
timed out on reconnect, so the authenticated catalog was checked with an
in-memory account. Native WebView2 composition, Windows display scaling,
physical touch and IME, and system file dialogs remain outside the offscreen
render coverage.
