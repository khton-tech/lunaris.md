# Capability choices

Use the installed declarations as the signature source and the bundled recipes
for workflows. In a generated project, read `DOCS/plugin-recipes.md`. The full
SDK archive also has `DOCS/reference/` and the source examples under `examples/`.

| Need | Start here |
| --- | --- |
| New settings, panels or screens | Settings or ActiveScreen with Views and the shared controls. Preserve the container's placement, theme and layout ownership. |
| Change an existing rendered region | `ApplicationDom` from `@lunaris/components`. Declare the API and `ui.dom`. Scope inserted nodes, observers and styles to the activation. Drema shows how to find the existing status bar and reattach after renderer changes. |
| Own a standalone surface or alter Workspace geometry | `ViewSurfaces` or `WorkspaceLayout`. The owner selects a replacement provider or layout through the Vault composition. |
| Implement a missing Windows operation | `NativeProcesses` from `@lunaris/execution`. Package a helper under `assets/`, define a bounded line protocol and bind the process to the activation. Use the Global Hotkey example. The Web and headless hosts have no Windows process provider. |
| Share behavior with another plugin | Export a typed API, event or hook in a shared contract module. Declare the token in the provider and consumer manifests. Use provider selection when more than one implementation is installed. |
| Persist data or work with notes | Config for the plugin's namespace and Filesystem for Vault-relative paths. Use `ctx.resources` for bundled read-only assets. |

Installed and built-in plugins use the same application SDK model. The Node and
QuickJS development modes are separate headless hosts. Use targeted developer
guided checks in a real Vault for rendering, native helpers, lifecycle across
Vault switches and other behavior that those modes cannot establish.
