---
name: lunaris-plugin-development
description: Create, extend, fix, or package a Lunaris plugin using the local Plugin SDK. Use when implementing a plugin feature, choosing SDK contracts, or diagnosing development and activation failures.
---

# Develop a Lunaris plugin

Work in the plugin project. Read its manifest, entry and local instructions.
From an extracted SDK root, create a project with
`npm exec -- lunaris-core create-plugin ./projects/<name> --id author.<name>`
and install the generated project's dependencies there. Continue using that
project and its bundled guides.

1. Identify the behavior to implement, the target host, and the dependencies that
   already exist. Read the relevant recipe and verify the selected tokens and
   signatures in the installed SDK. Use the project contract catalog and
   `add-contract` for an SDK dependency that is missing locally.
2. Match each consumed or provided contract's kind, ID and version or range in
   `manifest.json`. Declare permissions required by the token. Use
   `ctx.optional` only with an optional API requirement. Check how required
   and optional providers behave on each supported host.
3. Own resources and cleanup through the activation. Log through Logger.
   Capture the Vault ID before async work and stop using SDK handles when the
   scope closes. Document all public APIs, events and hooks the change adds.
4. Run `npm run check` and targeted tests. Run `npm run pack` for a distributable
   package and inspect it with `npm run core -- inspect-package <path.lup>`.
   Report the contracts used, what passed, and any specific application steps
   still needed to verify behavior.

Read [Capability choices](references/capabilities.md) when adding UI, an OS
operation or an extension for other plugins. If no public contract or general
extension mechanism covers the task, report the exact gap. A headless failure
to find a provider available in Web or Tauri is a host mismatch and does not
prove an SDK gap.
