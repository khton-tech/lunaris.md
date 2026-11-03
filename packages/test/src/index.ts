import { createKernel } from "@lunaris/kernel";
import type { Diagnostic, Kernel, KernelOptions, PluginState, Scheduler } from "@lunaris/kernel";
import { definePlugin } from "@lunaris/sdk";
import type { ApiToken } from "@lunaris/sdk";

/** Deterministic deadlines; advancing time does not implicitly flush plugin promises. */
export class TestScheduler implements Scheduler {
  #time = 0;
  #sequence = 0;
  #tasks = new Map<number, { readonly at: number; readonly callback: () => void }>();
  get now(): number { return this.#time; }
  get pending(): number { return this.#tasks.size; }
  schedule = (delayMs: number, callback: () => void): (() => void) => {
    if (!Number.isFinite(delayMs) || delayMs < 0) throw new Error("Invalid scheduler delay.");
    const id = ++this.#sequence;
    this.#tasks.set(id, { at: this.#time + delayMs, callback });
    return () => { this.#tasks.delete(id); };
  };
  advanceBy(durationMs: number): void {
    if (!Number.isFinite(durationMs) || durationMs < 0) throw new Error("Invalid scheduler advance.");
    const target = this.#time + durationMs;
    for (;;) {
      const next = [...this.#tasks].filter(([, task]) => task.at <= target).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!next) break;
      this.#time = next[1].at;
      this.#tasks.delete(next[0]);
      next[1].callback();
    }
    this.#time = target;
  }
}

export interface TestKernel extends Kernel {
  readonly clock: TestScheduler;
  diagnostics(): readonly Diagnostic[];
  assertState(pluginId: string, state: PluginState): void;
  assertNoResources(): void;
  installMock<T extends object>(token: ApiToken<T>, implementation: NoInfer<T>, options?: { readonly id?: string; readonly grants?: readonly string[] }): string;
}

/** Compose the actual public kernel, never a second lifecycle implementation. */
export function createTestKernel(options: Omit<KernelOptions, "scheduler"> = {}): TestKernel {
  const clock = new TestScheduler();
  const kernel = createKernel({ ...options, scheduler: clock });
  let mocks = 0;
  return Object.freeze({ ...kernel, clock,
    diagnostics: () => kernel.inspect().diagnostics,
    assertState(pluginId: string, state: PluginState) {
      const actual = kernel.inspect().plugins.find(p => p.manifest.id === pluginId)?.state;
      if (actual !== state) throw new Error(`Expected ${pluginId} state ${state}; received ${actual ?? "unregistered"}.`);
    },
    assertNoResources() {
      const pending = kernel.inspect().plugins.filter(p => p.ownedResources !== 0 || p.contracts.length !== 0 || p.state === "active" || p.state === "starting");
      if (pending.length || clock.pending) throw new Error(`Resources remain: ${pending.map(p => p.manifest.id).join(", ")}; deadlines: ${clock.pending}.`);
    },
    installMock<T extends object>(token: ApiToken<T>, implementation: T, mockOptions: { readonly id?: string; readonly grants?: readonly string[] } = {}) {
      const id = mockOptions.id ?? `test.mock-${++mocks}`;
      kernel.register(definePlugin({ manifest: {
        manifestVersion: 1, id, version: "0.1.0", engine: "^0.1.0", sdk: "^0.1.0", entry: "./mock.js",
        provides: [{ kind: "api", id: token.id, version: token.version }], requires: [],
        permissions: [], optionalPermissions: token.providePermission ? [token.providePermission] : [],
      }, activate(ctx) { ctx.provide(token, implementation); } }));
      for (const name of mockOptions.grants ?? []) kernel.grant(id, name);
      return id;
    },
  });
}
