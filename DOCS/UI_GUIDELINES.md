# UI/UX System Directives

Apply the following core principles to all interface design and frontend code generation:

### 1. Ruthless Minimalism
- **Rule:** Question every visual element before adding it. If it doesn't serve a critical function, omit it.
- **Microcopy:** Avoid conversational filler, wordy tooltips, and redundant helper text. Minimize cognitive load and visual noise.
- **Text Selection:** Interface chrome, loading artwork and status labels are not selectable. Text inputs and editable content retain text selection.

### 2. Content-First Approach
- **Priority Hierarchy:** Core Content & Readability > Context > Aesthetic Decoration.
- **Rule:** Never design visual elements for the sake of aesthetics alone. Form strictly follows function and legibility.

### 3. Fluidity & Resilience
- **Flexibility:** Avoid brittle, overly rigid layouts with hardcoded values.
- **Robustness:** Ensure UI components are adaptive and systematic (using proper spacing, tokens, and responsive behavior) so layouts remain intact across varying content lengths and screen sizes.
- **Viewport and Overflow:** Adapt to both available width and height. Reduce decorative space before compromising content or control readability. Keep the application shell within the viewport and give overflow ownership to the relevant content region. Never display native scrollbars; retain wheel, touch and keyboard access to content that cannot fit. Hiding scrollbar chrome must not be replaced with clipping meaningful content. The host enforces this policy globally, and Mantine plugin surfaces apply it within their owned DOM for standalone consumers.

### 4. Shared Mantine Components and Theme Inheritance
- **Reuse First:** Product UI uses the Mantine component plugin in `plugins/UI/mantine-components`. Check existing SDK roles before adding a component.
- **Library:** Compose Mantine Core controls and layouts. Consult [Mantine UI](https://ui.mantine.dev/) for ready-made compositions; it is a source catalog, not a separate runtime package. Adapt examples to these guidelines, SDK contracts, localization and the active theme. Do not build parallel custom buttons, inputs or other primitives already supplied by Mantine.
- **Extension:** Add missing roles and reusable compositions to the Mantine component plugin. Keep React/Mantine imports inside that plugin; consumers mount roles through the [component provider](reference/components.md). The retired LunarisComponentsKit remains in the repository for reference and is disabled in Tauri; do not extend it for new product UI or activate both sets for the same roles.
- **Theme Inheritance:** Obtain the active theme through Themes and ThemeChanged. Translate its colors, geometry, typography and motion into Mantine overrides. Scope variables, color-scheme attributes and custom styles to the owned root. Do not let Mantine persist theme preferences in browser storage or restyle host recovery UI.
- **Current Roles:** `lunaris.startup-screen` and `lunaris.vault-selector` retain their existing props and callbacks. Workspace adds `lunaris.workspace-header`, `lunaris.workspace-empty` and `lunaris.workspace-layout`; Sidebar uses `lunaris.sidebar-rail` through the same provider. Business logic, file access, translation and theme selection remain in their SDK consumers/providers. The icon pack remains Lucide. See [the plugin guide](../plugins/UI/mantine-components/DOCS/README.md).

### 5. Quiet Surfaces and Interaction States
- **Global Spaces:** Global application-shell regions, including the sidebar navigation/tab rail, tool panels and other supporting spaces, must use card-like surfaces. Separate these regions with external spacing, theme-derived surface colors and rounded corners. Use restrained boundaries only where needed; cards do not require prominent borders or shadows.
- **Active Workspace Exception:** The active content area that hosts the editor or other working windows is the sole exception among global spaces: it remains an open workspace without an enclosing card, decorative border, shadow or card-style inset. Controls, dialogs and content inside that workspace retain their own appropriate component styling.
- **Card Ownership:** Apply the card treatment once at each global region's layout boundary through the Mantine component plugin. Tool content inherits its region's surface rather than adding a second enclosing card. Individual navigation tabs remain controls within their card-like navigation region; this rule does not require a separate card around every tab, file row or action. Preserve region-local scrolling and the active workspace's available space at narrow and short sizes.
- **Hierarchy:** Establish groups within each surface with spacing and typography first. Avoid outlining every action or nesting bordered cards; this does not remove the required card treatment of global supporting regions. Keep branding secondary to the task; ordinary product surfaces must not resemble diagnostic panels.
- **States:** Hover is a brief, subtle response, not selection. Persistent current/selected state must come from application state and expose the appropriate accessible attribute. Pressed feedback must remain distinct from hover. Disabled controls must not retain hover or pressed feedback.
- **Focus:** Buttons use a clear keyboard-only focus indicator. Editable fields and composite pickers use one focus treatment on their boundary, never stacked outlines. Do not force focus into a form after a pointer click; preserve deliberate keyboard navigation.
- **Inputs:** Display-only values must not imitate editable inputs or introduce redundant tab stops. Text selection in editable fields follows semantic theme selection colors.
- **Contrast:** Reduce decorative borders and surface contrast, not the readability of text or the visibility of meaningful input boundaries and keyboard focus. Use semantic theme roles rather than arbitrary opacity on essential content.
- **Copy:** Prefer names and concise outcomes over persistent operational/log-like messages. Recovery controls and diagnostics appear only in recovery contexts.

### 6. Restrained Motion and Style Ownership
- **Motion:** Use short, consistent transitions from the active theme: fast feedback for state colors, slightly longer movement for disclosure. Animate only properties that serve the interaction; avoid `transition: all`, bouncing, scaling controls, or translating the entire screen.
- **Layout Stability:** Opening and closing an inline form should expand its allocated space smoothly without recentering the logo and surrounding content. Both directions must work with intrinsic content sizes, long translations and interrupted transitions; avoid fixed-height guesses and animation timers.
- **Accessibility:** Closing content becomes inert and hidden from assistive technology immediately, independently of its visual transition. Respect `prefers-reduced-motion` by removing nonessential transitions. Preserve drafts and restore focus when collapsing a focused region.
- **Ownership:** Host/recovery CSS must be scoped to host-owned roots. Product control styles live in the Mantine component plugin and receive theme tokens; a consumer must not silently inherit recovery hover, borders or focus styling.
