# Lifecycle execution boundary

Status: accepted P3 refinement, 2026-11-03. Refines D01/D06; does not add platform access to plugins.

## Required host scheduler

The kernel has no Node/DOM imports or ambient timer globals. A host must therefore supply `createKernel({ scheduler })`, where `scheduler.schedule(delayMs, callback)` returns a synchronous cancellation function. Callbacks must not run before `schedule` returns; cancellation must be idempotent and must not throw. Default activation/stop durations remain 5000 ms. A real host adapter comes with the host; tests supply a manually advanced scheduler. The former optional-options signature cannot implement real deadlines without assuming a platform, so scheduler injection is required. Plugin SDK signatures are unchanged.

## Reentrancy and asynchronous attribution

Management operations serialize per plugin. A management call made synchronously inside activation, cancellation listeners or disposers is rejected with `LIFECYCLE_REENTRANT`. Independent external requests queue normally. Without platform-specific asynchronous context, a host call made after an arbitrary plugin `await` cannot be distinguished from an external request. Such calls queue; a plugin awaiting its own queued transition eventually hits its activation/stop deadline. This limitation is explicit, not a claim that all asynchronous cycles can be detected. Plugins must never capture host management APIs. Native async-context support is deferred until a host requires it.

The same rule applies to scope disposal: direct recursive disposal is rejected; concurrent external disposal shares the same promise. An indirect asynchronous self-wait is bounded by the host stop deadline when the scope belongs to a stopping activation.

## Deadline cleanup

Normal cleanup awaits disposers sequentially in reverse ownership order, with activation-returned teardown first. At a stop deadline, waiting ends and all remaining disposers are attempted in reverse order without waiting for noncooperative promises. Closed SDK scopes cannot register resources; late owned/returned resources are immediately disposed and their failures diagnosed. JavaScript and external effects cannot be forcibly terminated. A timeout does not assert that an arbitrary external resource has actually released.

P3 supports dependency-free plugins and staged API publication. Required capability resolution/handles arrive in P4; event/hook dispatch in P5; grant management in P6. Until those gates, unsupported operations reject explicitly and sensitive operations deny by default. No restricted operation is enabled early.
