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
- **Viewport and Overflow:** Adapt to both available width and height. Reduce decorative space before compromising content or control readability. Keep the application shell within the viewport and give overflow ownership to the relevant content region. Never display native scrollbars; retain wheel, touch and keyboard access to content that cannot fit. Hiding scrollbar chrome must not be replaced with clipping meaningful content. The host enforces this policy globally, and Component Kit surfaces apply it within their owned DOM for standalone consumers.

### 4. Shared Components and Theme Inheritance
- **Reuse First:** Before implementing any interface, check whether an existing component supports it. Reuse or compose available components instead of duplicating their implementation in the consuming plugin.
- **Component Kit:** If a required component is missing, implement it in the `LunarisComponentsKit` plugin. If it requires missing primitives, atoms, or other reusable building blocks, implement those in the same plugin and compose the component from them.
- **Theme Inheritance:** `LunarisComponentsKit` must obtain the active theme through the theme manager's public SDK contract and inherit its colors, geometry, typography, and other applicable properties. Components must respond to theme changes rather than hardcode their own theme palettes or depend on a specific theme engine.
- **Current Status:** `LunarisComponentsKit` supplies the `lunaris.startup-screen` and `lunaris.vault-selector` roles. It registers components through the [component provider](reference/components.md), and consumers render them by role ID through that provider rather than importing the kit. The initial icon pack is Lucide. See [the kit documentation](../plugins/UI/components-kit/DOCS/README.md). These rules apply to all subsequent product UI development.

### 5. Quiet Surfaces and Interaction States
- **Hierarchy:** Establish groups with spacing and typography first. Avoid outlining every action or nesting bordered cards. Keep branding secondary to the task; ordinary product surfaces must not resemble diagnostic panels.
- **States:** Hover is a brief, subtle response, not selection. Persistent current/selected state must come from application state and expose the appropriate accessible attribute. Pressed feedback must remain distinct from hover. Disabled controls must not retain hover or pressed feedback.
- **Focus:** Buttons use a clear keyboard-only focus indicator. Editable fields and composite pickers use one focus treatment on their boundary, never stacked outlines. Do not force focus into a form after a pointer click; preserve deliberate keyboard navigation.
- **Inputs:** Display-only values must not imitate editable inputs or introduce redundant tab stops. Text selection in editable fields follows semantic theme selection colors.
- **Contrast:** Reduce decorative borders and surface contrast, not the readability of text or the visibility of meaningful input boundaries and keyboard focus. Use semantic theme roles rather than arbitrary opacity on essential content.
- **Copy:** Prefer names and concise outcomes over persistent operational/log-like messages. Recovery controls and diagnostics appear only in recovery contexts.

### 6. Restrained Motion and Style Ownership
- **Motion:** Use short, consistent transitions from the active theme: fast feedback for state colors, slightly longer movement for disclosure. Animate only properties that serve the interaction; avoid `transition: all`, bouncing, scaling controls, or translating the entire screen.
- **Layout Stability:** Opening and closing an inline form should expand its allocated space smoothly without recentering the logo and surrounding content. Both directions must work with intrinsic content sizes, long translations and interrupted transitions; avoid fixed-height guesses and animation timers.
- **Accessibility:** Closing content becomes inert and hidden from assistive technology immediately, independently of its visual transition. Respect `prefers-reduced-motion` by removing nonessential transitions. Preserve drafts and restore focus when collapsing a focused region.
- **Ownership:** Host/recovery CSS must be scoped to host-owned roots. Product control styles live in Component Kit and receive theme tokens; a consumer must not silently inherit recovery hover, borders or focus styling.
