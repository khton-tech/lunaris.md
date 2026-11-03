# Plugin testing

`@lunaris/test` composes the real public kernel with a deterministic `TestScheduler`. `createTestKernel(options?)` exposes normal host operations plus `clock`, `installMock`, `assertState`, `assertNoResources` and bounded `diagnostics()`. It imports only public SDK/kernel exports and has no Node/DOM dependency.

Register a definition, install required API mocks, start the consumer and assert behavior. `installMock(token, implementation, { id?, grants? })` registers a real SDK definition; mocks receive no implicit sensitive grants. `stopAll()` followed by `assertNoResources()` checks lifecycle slots, publications and scheduled deadlines. Scope counters cannot prove an arbitrary external resource released, so assert external effects where relevant.

Use deferred promises to synchronize entry into async work. `clock.advanceBy(ms)` synchronously fires due deadlines in time/registration order; it does not flush JavaScript promises. Await the actual operation afterwards. Never use arbitrary sleeps to wait for activation. Test kernels have independent registries/policies/clocks.

`npm run check -- test` verifies the kit and lifecycle leak checks. Ordinary runtime tests remain in the core; standalone example/logger/commands/fake-driver reference plugins are deferred by Owner request. A generated plugin's own focused lifecycle test is still part of the developer workflow.
