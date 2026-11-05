# UI/UX System Directives

Apply the following core principles to all interface design and frontend code generation:

### 1. Ruthless Minimalism
- **Rule:** Question every visual element before adding it. If it doesn't serve a critical function, omit it.
- **Microcopy:** Avoid conversational filler, wordy tooltips, and redundant helper text. Minimize cognitive load and visual noise.

### 2. Content-First Approach
- **Priority Hierarchy:** Core Content & Readability > Context > Aesthetic Decoration.
- **Rule:** Never design visual elements for the sake of aesthetics alone. Form strictly follows function and legibility.

### 3. Fluidity & Resilience
- **Flexibility:** Avoid brittle, overly rigid layouts with hardcoded values.
- **Robustness:** Ensure UI components are adaptive and systematic (using proper spacing, tokens, and responsive behavior) so layouts remain intact across varying content lengths and screen sizes.

### 4. Shared Components and Theme Inheritance
- **Reuse First:** Before implementing any interface, check whether an existing component supports it. Reuse or compose available components instead of duplicating their implementation in the consuming plugin.
- **Component Kit:** If a required component is missing, implement it in the `LunarisComponentsKit` plugin. If it requires missing primitives, atoms, or other reusable building blocks, implement those in the same plugin and compose the component from them.
- **Theme Inheritance:** `LunarisComponentsKit` must obtain the active theme through the theme manager's public SDK contract and inherit its colors, geometry, typography, and other applicable properties. Components must respond to theme changes rather than hardcode their own theme palettes or depend on a specific theme engine.
- **Current Status:** `LunarisComponentsKit` has an initial implementation with the `lunaris.startup-screen` role. It registers components through the [component provider](reference/components.md), and consumers render them by role ID through that provider rather than importing the kit. See [the kit documentation](../plugins/UI/components-kit/DOCS/README.md). These rules apply to all subsequent product UI development.
