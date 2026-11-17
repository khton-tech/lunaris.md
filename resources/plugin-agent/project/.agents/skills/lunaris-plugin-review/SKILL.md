---
name: lunaris-plugin-review
description: Review a Lunaris plugin change or local LUP package before handoff. Use for explicit requests to check manifest and SDK compatibility, activation cleanup, platform support, or distribution readiness.
---

# Review a Lunaris plugin

For source, read the diff, `manifest.json`, entry, public types and focused tests.
For a `.lup` artifact, use `lunaris-core inspect-package <path.lup>` through the
installed SDK CLI. It reports metadata, contracts, digest and paths without
executing the plugin. Do not run scripts or activate unknown code as part of
an inspection.

Prioritize failures with a concrete trigger.

- **Activation and compatibility:** Match the manifest entry and metadata to the
  code and package. Verify token kind, range, permissions and availability on
  each declared platform. Check disabled startup and provider replacement when
  applicable.
- **Ownership:** Follow subscriptions, watchers, timers, DOM mutations and process
  handles through stop, reactivation and Vault switch. Check late callbacks
  against the scope and the captured Vault. Look for duplicate effects and live
  SDK calls after closure.
- **Distribution:** Check that required resources and native binaries are in the
  archive at the paths used by code. Pay attention to binary target, zero or
  missing assets and updates that do not advance the plugin version.
- **Evidence:** Distinguish an inert archive inspection, a source or headless
  check, and a test in Web or Tauri. A valid archive does not establish the
  safety or behavior of its code. Existing UI needs visual acceptance in its
  real container and native behavior needs a target-host check.

Return actionable findings first, with a location, observed effect and
verification step. Report checks you could not perform. Keep a review read-only
unless the developer also asks for fixes.
