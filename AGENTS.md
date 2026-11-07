# Repository Operational Guidelines

## 1. Git Workflow
- **Pre-development Check:** Before writing any code, inspect all uncommitted changes and determine their context. Commit them first.
- **Commit Cadence:** Commit immediately after completing a feature, resolving a bug, or making even a minor change. Commits are considered part of the documentation.
- **Branching Policy:** Develop new plugins, core modules, and major subsystems in isolated feature branches. Merging into the target branch is permitted only after explicit approval from the Owner.
- **Branch Names:** Use meaningful names describing the change, such as `feat/core-foundation`, `feat/core-sdk`, or `fix/manifest-validation`. Do not use `codex/` or other agent-specific prefixes. Rename existing agent-prefixed working branches when continuing their work.

## 2. Project Structure
- **Folder Placement:** Maintain strict directory separation by component type:
  - System drivers (e.g., file handling): `plugins/systems/driver/<plugin_name>` (where `systems` is the system directory).
  - UI components (e.g., bottom status bar): `plugins/UI/<plugin_name>`.
- **Documentation Hierarchy:**
  - `DOCS/`: Primary documentation repository. Read from and write to this directory.
  - `.AI_DOCS/`: Dedicated buffer folder for the AI agent. Use this exclusively for agent execution plans, task tracking, and machine-readable data unnecessary for human developers.
- **Plugin Docs:** Every plugin must maintain its own `DOCS/` subfolder specifying: plugin purpose, usage guidelines, and callable API methods/event subscriptions.

## 3. Plugin Architecture & Development
- **Single Responsibility Principle:** One plugin = one architectural contour/responsibility (not strictly limited to a single function, but strictly bound to its scope).
- **Decomposition:** Decompose functionality into dedicated services and providers instead of monolithic implementations.
  - *Example (Sidebar with tabs):*
    1. Rendering target allocation -> **Slot/Grid Provider** (requests or creates slots).
    2. Theme configuration -> **Theme Provider** (retrieves and exposes theme properties).
    3. Component/button sets -> **UI/Component Set Provider** (aggregates component plugins and provides an API).
    4. Dedicated **Logger**.
  - *Rule:* Before implementing a feature, explicitly determine: what is required, what already exists, and what needs to be created to ensure dynamic extensibility.
- **Strict SDK Dependency:** Work **EXCLUSIVELY via the SDK**. If the SDK lacks functions, presents blockers, or forces workarounds/hacks: **HALT development immediately**, report the blocker, and provide a clear specification of the required SDK changes.
- **Loose Coupling & Interchangeability:** Design as an extensible harness/sandbox while preserving seamless user experience. Plugins must be modular and replaceable (e.g., the user must be able to swap out the default system logger or driver).
- **Integration Review:** After implementing or modifying a plugin, explicitly assess whether other plugins need integration with it or it needs integration with existing plugins. If integration is required, tell the Owner which plugins are involved, what must be connected through public SDK contracts, and whether that integration is completed or remains outstanding. Do not report a standalone implementation as fully integrated when required connections are still missing.
- **Abstraction Layers:** Abstract cross-platform specifics (Web, Capacitor, Tauri). Plugins must call intermediate Providers (e.g., "write data"), and the Provider delegates the call to the corresponding target Driver.
- **Developer Experience (DX) & Anti-Overengineering:** Keep the system, SDK, and plugin development straightforward with a low barrier to entry. Strictly avoid overengineering, excessive boilerplate, and unnecessary abstraction layers. Ensure plugin developers do not face high cognitive load: SDK interfaces and workflows must remain simple, intuitive, and ergonomic without sacrificing extensibility.
- **Mandatory Plugin Logging:** Every product plugin must declare the Logger API as a required dependency and log through `ctx.use(Logger)` with `ctx.pluginId` as its source. Log activation/readiness, meaningful operation outcomes and state changes, degraded behavior, and failures with useful context and the original error. Use `debug` for detailed traces, `info` for milestones, `warn` for recoverable degradation, and `error` for failed operations; avoid per-frame/poll noise and sensitive payloads. Direct `console.*` calls are reserved for the console output driver. Logger and sink implementations must not depend on Logger or report their own output failures through it, preventing dependency cycles and recursion. SDK access is invalid after scope closure; cleanup failures remain covered by independent kernel diagnostics. Follow [the logging policy](DOCS/reference/logging.md#mandatory-plugin-logging).



## 4. Documentation & Communication Standards
- **Artifact Language:** Write all code documentation, comments, and AI-internal files (`.AI_DOCS/`) strictly in **English**.
- **User Interface (UI):** Build UI elements to be fully adaptable for localization (a dedicated localization plugin will handle translations).
- **User Dialogue:** Provide all responses and direct communication to the user strictly in **Russian**.

## 5. Testing, Scripts & Tooling
- **Routine Automation:** Implement repetitive workflows as automation scripts in `tools/scripts/`. Use them whenever applicable. Scripts must terminate with a concise, informative execution summary without spamming raw output.
- **Targeted Testing:** Execute strictly targeted tests for the specific change. Do not run full project test suites for minor fixes (conserves execution time and token context).
- **Restricted Tooling:** Using automated OS/PC desktop-control tools is strictly prohibited. If manual testing or OS-level actions are required, explicitly prompt the user to execute them.

---

# Additional Rules
> Reserved for supplemental rules identified during development. Keep additions concise and direct.
- When designing, modifying, or implementing any user interface elements, layouts, or frontend components, you must strictly adhere to the principles defined in [`DOCS/UI_GUIDELINES.md`](DOCS/UI_GUIDELINES.md). Treat this file as the single source of truth for all visual standards—specifically regarding radical minimalism, content-first hierarchy, and structural layout resilience.

- Product UI must use the Mantine component plugin (`plugins/UI/mantine-components`) through public SDK component roles. Reuse Mantine Core controls and consult [Mantine UI](https://ui.mantine.dev/) for compositions. Extend that plugin when a role is missing; do not add new UI to the retired LunarisComponentsKit or import React/Mantine in consuming plugins. Follow [the plugin guide](plugins/UI/mantine-components/DOCS/README.md).

- **Architectural UI Ownership:** Before adding or changing UI, identify the owner of each region's layout, surface and content. Containers own region geometry and surfaces; embedded plugin views inherit them and must not cover, duplicate or redefine them. Theme adaptation must preserve that ownership. Declare presentation context through public SDK role contracts when needed; do not infer it from DOM ancestry, CSS classes or plugin IDs. Follow [the ownership rules](DOCS/UI_GUIDELINES.md#7-architectural-ownership-and-composition) and verify the composed view inside its real container before declaring integration complete.
