# Lunaris Lime execution plan

Status: L01 audited; execution/SDK gate blocked. Updated: 2026-11-10. Branch: `feat/lime`.

This directory contains agent execution plans, not implemented contracts or public
developer documentation. L01 findings and required contracts are recorded in
[the public runtime specification](../../DOCS/design/lime-runtime.md). Runtime
implementation tasks remain pending. Do not copy proposed
names or signatures into product documentation as if they already exist.

## Scope

Deliver workspace-local third-party plugins, their management UI, and a complete
authoring workflow for humans and AI agents in the same feature branch. Third-party
plugins have the same architectural capabilities as system plugins. The application
is an extensible sandbox, not a fixed Markdown editor.

The two product plugins are Lunaris Lime (`plugins/systems/lime`) and its separate
settings UI (`plugins/UI/lime-settings`), with names/IDs finalized in the contract
task. Shared contracts, existing provider extensions and necessary host drivers are
supporting infrastructure, not additional competing plugin managers.

## Documents

- [Decisions and boundaries](decisions.md): Owner decisions, existing capabilities,
  unresolved technical details and SDK blockers.
- [Task backlog](tasks.md): ordered deliverables, dependencies and completion gates.
- [Developer experience](developer-experience.md): CLI, public SDK, documentation and
  external human/AI authoring requirements.
- [Acceptance](acceptance.md): user scenarios, integration and verification matrix.

## Execution rules

1. Implement public SDK/kernel prerequisites before consuming them. Stop the
   affected implementation and report a concrete missing-contract specification
   if a workaround would otherwise be necessary. Continue independent planning.
2. Reuse existing CLI, development tooling and providers. Avoid parallel APIs,
   hidden host access and unnecessary service layers.
3. Update public documentation under `DOCS/` and each plugin's `DOCS/` as contracts
   land. This planning directory cannot substitute for author-facing documentation.
4. Complete each task's focused checks, integration assessment and commit before
   marking it done. Keep pending native/visual acceptance explicit.
5. Do not merge into the target branch without explicit Owner approval. Creating
   this plan does not authorize publication to a package registry or app store.

## Completion definition

A developer or AI agent outside the Lunaris source checkout can create, validate,
develop and package a plugin using only the published documentation and supported
toolchain. A user can preview, install, enable, disable, update and remove that
package without restarting the application. Vault transitions, provider replacement,
dependencies, failed updates and recovery behave predictably. Every supported host
has evidence; unavailable or manually unverified behavior is reported accurately.
