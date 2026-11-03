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
- **Abstraction Layers:** Abstract cross-platform specifics (Web, Capacitor, Tauri). Plugins must call intermediate Providers (e.g., "write data"), and the Provider delegates the call to the corresponding target Driver.
- **Developer Experience (DX) & Anti-Overengineering:** Keep the system, SDK, and plugin development straightforward with a low barrier to entry. Strictly avoid overengineering, excessive boilerplate, and unnecessary abstraction layers. Ensure plugin developers do not face high cognitive load: SDK interfaces and workflows must remain simple, intuitive, and ergonomic without sacrificing extensibility.

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
