import type { PluginManifest } from "@lunaris/sdk";
import { requirementKey } from "./model.js";

/** Conservative potential edges; selection/version filtering remains in resolution. */
export class DependencyIndex {
  readonly providers = new Map<string, Set<string>>();
  #consumers = new Map<string, Set<string>>();
  #dependencies = new Map<string, Set<string>>();

  register(manifest: PluginManifest): void {
    const dependencies = new Set<string>();
    this.#dependencies.set(manifest.id, dependencies);
    for (const provided of manifest.provides) {
      const key = requirementKey(provided);
      let providers = this.providers.get(key);
      if (!providers) this.providers.set(key, providers = new Set());
      providers.add(manifest.id);
      for (const consumer of this.#consumers.get(key) ?? []) {
        this.#dependencies.get(consumer)!.add(manifest.id);
      }
    }
    for (const required of manifest.requires) {
      const key = requirementKey(required);
      let consumers = this.#consumers.get(key);
      if (!consumers) this.#consumers.set(key, consumers = new Set());
      consumers.add(manifest.id);
      for (const provider of this.providers.get(key) ?? []) dependencies.add(provider);
    }
  }

  related(root: string): ReadonlySet<string> {
    const reachable = new Set([root]);
    for (const id of reachable) {
      for (const dependency of this.#dependencies.get(id) ?? []) reachable.add(dependency);
    }
    return reachable;
  }

  unregister(id: string): void {
    this.#dependencies.delete(id);
    for (const values of this.#dependencies.values()) values.delete(id);
    for (const [key, values] of this.providers) {
      values.delete(id);
      if (!values.size) this.providers.delete(key);
    }
    for (const [key, values] of this.#consumers) {
      values.delete(id);
      if (!values.size) this.#consumers.delete(key);
    }
  }
}
