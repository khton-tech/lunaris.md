# Application UI integrity audit — 2026-11-11

## Result and evidence boundary

Source and targeted behavior audit completed; native visual acceptance is pending.
This is not a claim that every screen looks correct. Desktop automation is
prohibited by AGENTS.md, and no rendered screenshots or real-device session were
available during this audit. No browser/desktop automation was used.

The review covers the shared application composition, Web/Tauri shells, all 27
non-retired UI plugin source directories (103 TS/TSX/CSS files in the automated
source scan), all 23 registered Mantine view roles, document rendering exceptions,
theme adaptation, responsive CSS and interaction contracts. The retired
components-kit is excluded from product acceptance; the shared application
composition registers mantine-components, not the retired kit.

References: [UI guidelines](../UI_GUIDELINES.md), existing Files navigation,
Settings controls, Workspace tabs and mobile dock; the current UIKit guide's
recorded Owner references. Original Owner screenshots were not available in this
chat, so their visual equivalence has not been independently confirmed.
[Mantine UI navigation](https://ui.mantine.dev/category/navbars/) and
[Mantine Menu](https://mantine.dev/core/menu/) were consulted for composition.
Installed Mantine source/types, rather than the newer online version, were used
to validate implementation API compatibility.

## Coverage and ownership

| Area / shared roles | Ownership and source findings | Native acceptance |
| --- | --- | --- |
| Startup / startup-screen | Host owns pre-plugin first paint; Runner uses the shared role and progress labels | Short-height art, loading transitions, long status |
| Local Vault selector / vault-selector | Shared buttons/card rows, retained disclosure forms, recent list; own standalone surface | Long paths, both disclosure directions, compact height |
| Remote account / account-access | Mantine fields, password, catalog/trash rows; standalone surface | Open account/row menus, long server/account names, keyboard |
| Shell / workspace-layout, workspace-header, workspace-empty | Workspace owns region surfaces, splitting and overflow; main is separately lent | Desktop joins, empty/populated views, drawer, narrow/short windows |
| Sidebar / sidebar-rail, file-explorer | Rail navigation and virtual tree; shared controls, separate active-file marker | Many tools, long names, nested folders, touch drafts, open menus |
| Settings / settings-navigation, settings-page, settings-items, settings-choices | Shared navigation and themed Combobox; contributed sections inherit container | All field types, opened options near scroll edges, sticky heading |
| Plugins / lime-settings, declarative-view | Mantine controls; explicit preview overlay; public declarative tree | Preview modal, dependency picker, removal states, drawing focus |
| Tabs / active-screen | Stable content targets; unified busy controls after this audit | Focus, overflow, close/history/reorder and disabled appearance |
| Mobile / mobile-menu | Workspace owns floating surfaces; role owns actions and themed popup | Many tabs, trailing close, drag/scroll, long names, keyboard/safe area |
| Editor / text-editor | UIKit owns title/recovery controls; CodeMirror owns document scrolling/typography | Rename, recovery, long code/link/list content, keyboard overlap |
| Document controls / callout-header, task-checkbox | Controls use UIKit; document extensions own Markdown lines and local surfaces | Nested callouts, folding, checkbox focus, large text |
| Menus / context-menu | Shared Mantine menu/submenu and formatting islands | Screen edges, submenu focus, touch access, long labels |
| Chrome / window-titlebar, status-bar, client-update | Dedicated shared roles; host owns native window bridge | Caption states, large metrics, update errors, short-height recovery |
| Themes / base-theme, themes, theme-settings, interface-settings | Semantic token adapter and live updates; no consumer framework imports found | Monochrome, Everforest, Luna light/dark, theme replacement |
| Supporting providers / components, layout, workspace-content, sidebar-tabs, active-screen-provider, settings-provider | Registration and region APIs; no parallel product control implementation found by source guardrails | Replacement/cleanup is behavior-tested; appearance belongs to composed views |

## Corrected findings

| ID | Impact before change | Correction and evidence |
| --- | --- | --- |
| UI-01 | Mobile drawer immediately became visually hidden on close, preventing the closing transform from being seen | Delay only CSS visibility; existing inert/aria-hidden remain immediate; reduced motion has no transition/delay |
| UI-02 | Account, Files and Vault menus used Mantine fade defaults rather than the active theme's fast duration/easing | Theme adapter supplies Menu defaults; explicitly instant context/choice/modal interactions remain instant; Mantine reduced-motion handling retained |
| UI-03 | Mobile tab choices used 34px rows; other explorer-style menus were outside the 44px phone/coarse-pointer rule | All these menu rows have at least 44px targets; tab popup's five-row cap derives from the updated row-height token |
| UI-04 | Shared textarea fields lacked the 16px phone/coarse-pointer minimum already applied to single-line fields | Apply the same rule to textarea; native iOS focus behavior still needs confirmation |
| UI-05 | aria-busy on desktop tabs did not disable create/select/close/history or Delete/middle-click actions | Disable native controls and guard shortcuts; prevent disabled hover/pressed feedback; behavior test exercises blocked actions and in-place recovery |

These corrections stay inside mantine-components. Existing Components, Themes,
Workspace and Active Screen contracts connect them to consumers. No SDK changes
or new provider are necessary. Integration behavior is checked; appearance is not
certified by those checks.

## Open findings and verification risks

### P1 verification — menus inside scroll/containment boundaries

SettingsSelect, account menus, Files header and Vault switcher use
`withinPortal={false}`. Their owning regions scroll, and UIKit roots use size or
inline-size containment. This is a structural clipping risk near scroll edges,
especially Settings near the bottom and tall account catalogs. Source inspection
does not establish the final popup geometry. Open the final picker/menu in a
short window, scroll the parent and navigate to its last option.

If clipping is confirmed, extend the existing UIKit overlay ownership pattern
(already used by mobile choices and Lime preview), preserving theme variables,
focus traps and dismissal. Do not portal to an unthemed global surface or relax
the container's overflow as a workaround. This integration remains outstanding.

### P1 verification — mobile keyboard and floating controls

The host uses `100dvh` and a hidden body overflow; the dock is absolutely placed
inside Workspace. No explicit visualViewport integration was found. This does
not establish whether each browser/WebView resizes correctly for the keyboard.
Test editing the last line, renaming, password input, Settings fields, closing
the keyboard and switching tools in portrait and short landscape. Confirm the
caret and recovery actions remain reachable and the page does not focus-zoom.

### P2 confirmed composition issue — safe-area padding counted twice

`hosts/application/assets/shell.css` and the Tauri copy pad body with the bottom
safe-area inset. `styles.css` also adds that inset to the Workspace dock's bottom
offset. When the inset is nonzero, the dock is farther from the already safe
Workspace bottom by another inset. The effect is absent on ordinary desktop
windows. Ownership should be explicit before changing standalone role behavior:
the host owns hardware insets; Workspace should receive an already safe region
or an explicit presentation inset. Correction and device verification remain open.

### P2 design consistency — documented exceptions conflict with global rules

The non-Luna desktop rail explicitly removes its card surface and outer spacing;
Luna Settings groups and Explorer tree add inset surfaces. Some of these follow
previous recorded Owner references, but the current guideline requires card-like
supporting regions and forbids duplicate outer surfaces. This is a source-level
design-contract inconsistency, not proof that either appearance is undesirable.
Compare the complete Files/Settings composition in both families before changing
the established reference. Record accepted exceptions or align the role styles.

### P2 typography — status footer bypasses theme size

The status role overrides theme typography with `fontSize: "12px"`. This preserves
the documented compact reference but does not scale with larger theme font sizes.
Check large-text presets with long localized metrics. A semantic secondary text
size would preserve the hierarchy while following theme accessibility settings.
No typography redesign was applied without that comparison.

### P2 disclosure — long names on touch

Files, tab choices, account identity and recent Vault rows truncate to one line;
some rely on HTML title for the full value. Hover tooltips are not a dependable
touch disclosure. Check names sharing a long prefix, paths and server identities.
Existing accessible names remain intact, but sighted touch users may need a
shared details affordance if names cannot be distinguished. This needs product
acceptance rather than globally removing truncation and breaking virtual rows.

## Checks performed

- `node tools/scripts/check.mjs mantine-components active-screen-plugin`:
  154 passing tests, zero skipped; relevant builds, architecture boundaries and
  type fixtures, including Web/application/Tauri consumers.
- `node tools/scripts/ui-localization.mjs`: 18 bilingual catalogs, 378 messages;
  keys and interpolation parameters match. This does not test translated layout.
- `node tools/scripts/ui-integrity.mjs`: 27 plugins, 103 source files, zero
  findings for raw/native controls, consumer React/Mantine imports and
  `transition: all`. This deliberately narrow line-based guardrail is not an AST
  audit, accessibility certification, dependency-graph proof or visual test.
- Existing composed-view tests cover themes, stable borrowed targets, menu
  interactions, editor recovery, mobile gestures and cleanup. The new tab test
  verifies disabled operations and recovery. No full repository test run was used.

## Manual acceptance checklist

Use Web and Tauri where supported. Prioritize phone Safari/Chrome and the actual
mobile WebView if deployed; desktop emulation does not prove keyboard behavior.

1. At 320/360/390/640px widths and a short landscape window, open Files, Settings,
   account catalog and the editor. Repeat at desktop width, including a narrow
   allocated main region. Ensure local scrolling reaches all meaningful content.
2. In Monochrome, Everforest, Luna light and Luna dark, open the theme/language,
   Files, account, tab and context menus. Check the first/last option, submenu,
   selected/hover/pressed/disabled states and keyboard-only focus.
3. Open and close the mobile Sidebar repeatedly, interrupt its transition,
   enable reduced motion, then switch Files/Settings. Confirm focus return and
   that closed content cannot receive input.
4. Open more than five tabs, use long names and close/reorder them. Check 44px
   touch targets, popup scrolling and the dock's placement on a notched device.
5. Edit the last document line and long text fields with the virtual keyboard
   open. Test callouts, task lists, code blocks, rename errors and recovery.
6. Check empty/loading/error/busy views, long Russian text, increased theme font
   sizes and switching themes while menus/forms are open.

Record actual device/browser, theme, viewport and failing screen for each result.
Screenshots should include the owning container and the opened control; motion
and keyboard overlap require a short recording or an explicit behavior report.
