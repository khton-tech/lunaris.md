# Startup provider

Purpose: expose host startup milestones to product plugins through SDK contracts.
Create a fresh `{ plugin, update }` controller with `createStartupProvider()` per
composition attempt; register/start `plugin`, and pass the trusted controller to
the host's startup ingress. Product consumers never receive the controller.

Provides `api:lunaris.startup@1.0.0` with `snapshot()` and
`event:lunaris.startup-changed@1.0.0` with immutable milestones. Requires Logger,
needs no permissions and subscribes to no events. It does not render, read config,
control plugin startup or inspect the kernel.

See [the contract, lifecycle and integration](../../../../DOCS/reference/startup.md).
Run `npm run startup:check` from the repository root.

## Awaited preparation integration

The provider now supplies Preparation/PreparationChanged alongside Startup. Trusted composition awaits prepare(signal); optional vault.access connects VaultLifecycle 1.1 at settlement order 100, after runtime activation. Owned participants prepare settings, document, content and presentation in order with cancellation and a 15-second deadline. Late registrations await local preparation without reopening startup. Original errors are logged; the host owns application recovery. See DOCS/reference/startup.md for contracts and acceptance.
