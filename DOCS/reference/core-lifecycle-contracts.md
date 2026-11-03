# Core lifecycle and contract guarantees

## Resource scope disposal

Disposing an active plugin's root `context.scope` requests coordinated shutdown of that activation. Its signal is aborted and publications are invalidated immediately. Required consumers finish cleanup, or reach their cleanup deadlines, before provider-owned resources are disposed. The returned Promise includes dependent cleanup and rejects if dependent shutdown or local cleanup fails. Repeated requests share that activation's disposal result.

After successful root disposal the registration is stopped. A subsequent host `start()` creates a fresh activation; starts submitted during disposal wait behind shutdown. An old context cannot dispose a newer activation.

During activation, root disposal closes and cleans the current scope directly. Activation then fails and rolls back rather than waiting on its own management queue. Recursive disposal from an owned disposer is rejected with `LIFECYCLE_REENTRANT`. Requesting root disposal while host shutdown is still waiting for dependent cleanup is also rejected, preventing early provider resource release. Child scope disposal remains local and does not stop the plugin.
