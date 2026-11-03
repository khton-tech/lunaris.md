# Core lifecycle and contract guarantees

## Resource scope disposal

Disposing an active plugin's root `context.scope` requests coordinated shutdown of that activation. Its signal is aborted and publications are invalidated immediately. Required consumers finish cleanup, or reach their cleanup deadlines, before provider-owned resources are disposed. The returned Promise includes dependent cleanup and rejects if dependent shutdown or local cleanup fails. Repeated requests share that activation's disposal result.

After successful root disposal the registration is stopped. A subsequent host `start()` creates a fresh activation; starts submitted during disposal wait behind shutdown. An old context cannot dispose a newer activation.

During activation, root disposal closes and cleans the current scope directly. Activation then fails and rolls back rather than waiting on its own management queue. Recursive disposal from an owned disposer is rejected with `LIFECYCLE_REENTRANT`. Requesting root disposal while host shutdown is still waiting for dependent cleanup is also rejected, preventing early provider resource release. Child scope disposal remains local and does not stop the plugin.

## Directional contract compatibility

A consumed token establishes a minimum implementation version independently of the consumer manifest's provider-selection range. The bound provider must satisfy both the manifest range and the SemVer caret range `^<token.version>`. Permission metadata must also remain compatible. API acquisition and event/hook registration reject unsupported versions with `CONTRACT_METADATA_CONFLICT` before returning a handle or installing a subscription.

For stable 1.x contracts, provider 1.2 can serve token 1.0, while provider 1.0 cannot serve token 1.2. For 0.x contracts, the caret range preserves the narrower compatibility boundary: 0.2.1 supports 0.2.0, but 0.3.0 does not; 0.0.2 does not support 0.0.1. Build metadata does not change compatibility. Prereleases follow the existing manifest SemVer matching rules: later prereleases of the same version and its stable release can satisfy a prerelease token, while an unrelated future prerelease does not automatically satisfy a stable token.

## Asynchronous API results

API methods retain synchronous return values. Results with a callable `then` are observed through Promise resolution, including native Promises, foreign-realm Promises, and custom thenables. Rejections produce exactly one `API_CALL_FAILED` diagnostic and propagate the original rejection value to the caller. Synchronous method exceptions and exceptions while inspecting a result's `then` property are recorded and rethrown synchronously. Objects without a callable `then` retain their identity.
