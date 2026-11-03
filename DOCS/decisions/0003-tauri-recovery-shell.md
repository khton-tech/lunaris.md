# Decision 0003: Tauri host with an independent system shell

Date: 2026-11-03. Status: accepted for implementation by the Owner.

The Owner selected Tauri as the first application host and requested a minimal
black-and-white fallback showing kernel information and plugin failures, with
retry and plugin exclusion. The shell belongs to the host rather than a plugin:
making it depend on product rendering, themes or localization would compromise
its recovery purpose.

The existing kernel/SDK remain platform-neutral. The Tauri WebView runs the actual
TypeScript kernel; a minimal Rust executable owns the native window. Public host
methods are sufficient for registration, lifecycle management and diagnostic
inspection. No private imports or SDK escape hatch is introduced.

Recovery creates a new kernel after cleanup. A disabled definition is omitted
from registration, because stopping a still-registered provider would allow
dependency resolution to activate it again. Required dependencies are never
silently made optional. Exclusion is session-local in this milestone.

The renderer is a trusted host composition adapter, not a new plugin-facing DOM
API. Future replaceable UI plugins must use explicit SDK contracts/providers.
Native driver features likewise belong behind providers and are not enabled as
part of creating the window.

The shell handles observable cooperative failures. Whole-process crashes, frozen
JavaScript and arbitrary mutation of host DOM require stronger isolation or an
external restart mechanism and are not claimed as recoverable. Failed cleanup
blocks another in-process attempt. Native window closing awaits cleanup.

Implementation, commands and verification limits are documented in the
[Tauri host guide](../guides/tauri-host.md). Merging and publication remain separate
Owner decisions.
