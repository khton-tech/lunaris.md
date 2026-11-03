import type { ErrorCode, ErrorContext } from "@lunaris/sdk";
import type { Diagnostic, PluginState } from "./types.js";

export class Diagnostics {
  #sequence = 0;
  #history: { readonly diagnostic: Diagnostic; readonly cause: unknown }[] = [];

  constructor(private readonly capacity: number) {}

  record(code: ErrorCode, context: ErrorContext & { readonly state?: PluginState } = {}, cause?: unknown): void {
    const diagnostic: Diagnostic = Object.freeze({
      sequence: ++this.#sequence, code,
      ...(context.pluginId === undefined ? {} : { pluginId: context.pluginId }),
      ...(context.activationId === undefined ? {} : { activationId: context.activationId }),
      ...(context.state === undefined ? {} : { state: context.state }),
      ...(context.contractId === undefined ? {} : { contractId: context.contractId }),
      // Never traverse an arbitrary thrown object's prototype or read its properties.
      ...(cause === undefined ? {} : { cause: Object.freeze({ kind:
        (cause !== null && (typeof cause === "object" || typeof cause === "function")) ? "object" as const : "value" as const }) }),
    });
    this.#history.push({ diagnostic, cause });
    if (this.#history.length > this.capacity) this.#history.shift();
  }

  snapshot(): readonly Diagnostic[] { return Object.freeze(this.#history.map(entry => entry.diagnostic)); }

  cause(sequence: number): Readonly<{ cause: unknown }> | undefined {
    const entry = this.#history.find(item => item.diagnostic.sequence === sequence);
    return entry ? Object.freeze({ cause: entry.cause }) : undefined;
  }
}
