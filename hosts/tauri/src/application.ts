import type { ApplicationDefinition } from "./session.js";

/** Host composition point. Product plugins import only the public SDK. */
export function composeApplication(_target: HTMLElement): ApplicationDefinition {
  // No reference plugins or product capabilities are installed implicitly.
  return { plugins: [], entrypoints: [] };
}
