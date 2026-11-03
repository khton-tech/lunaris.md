import { versionSatisfies } from "@lunaris/manifest";
import { LunarisError } from "@lunaris/sdk";
import type { RequiredContract } from "@lunaris/sdk";
import { context, requirementKey } from "./model.js";
import type { Registration } from "./model.js";

export interface Plan {
  readonly order: readonly string[];
  readonly edges: Map<string, Map<string, string | undefined>>;
  readonly errors: Map<string, LunarisError>;
  readonly omitted: readonly { readonly pluginId: string; readonly contractId: string }[];
}

export function candidates(records: ReadonlyMap<string, Registration>, requirement: RequiredContract): string[] {
  return [...records].filter(([, record]) => record.definition.manifest.provides.some(provided =>
    provided.kind === requirement.kind && provided.id === requirement.id && versionSatisfies(provided.version, requirement.range)))
    .map(([id]) => id).sort();
}

/** Resolve metadata before execution; optional cycle edges are omitted in stable global order. */
export function resolve(root: string, records: ReadonlyMap<string, Registration>, selections: ReadonlyMap<string, string>): Plan {
  if (!records.has(root)) throw new LunarisError("PLUGIN_NOT_FOUND", "Plugin is not registered.", { pluginId: root });
  const edges = new Map<string, Map<string, string | undefined>>();
  const errors = new Map<string, LunarisError>();
  const optional: { id: string; key: string; provider: string; contractId: string }[] = [];
  const omitted: { pluginId: string; contractId: string }[] = [];
  for (const id of [...records.keys()].sort()) {
    const record = records.get(id)!;
    const dependencies = new Map<string, string | undefined>();
    edges.set(id, dependencies);
    for (const requirement of [...record.definition.manifest.requires].sort((a, b) => requirementKey(a) < requirementKey(b) ? -1 : 1)) {
      const key = requirementKey(requirement);
      if (record.state === "active" && record.activation && !record.activation.scope.closed) {
        dependencies.set(key, record.activation.bindings.get(key)?.provider.definition.manifest.id);
        continue;
      }
      const available = candidates(records, requirement);
      const selected = selections.get(`${id}/${key}`);
      if ((selected && !available.includes(selected)) || (!selected && available.length > 1)) {
        errors.set(id, new LunarisError("PROVIDER_AMBIGUOUS", `Select a matching provider for ${key}; candidates: ${available.join(", ")}.`, { ...context(record), contractId: requirement.id }));
        continue;
      }
      const provider = selected ?? available[0];
      if (!provider && !requirement.optional) {
        const versions = [...records.values()].flatMap(item => item.definition.manifest.provides.filter(p => p.kind === requirement.kind && p.id === requirement.id).map(p => p.version));
        errors.set(id, new LunarisError("PROVIDER_MISSING", `No provider matches ${key} ${requirement.range}; available: ${versions.sort().join(", ") || "none"}.`, { ...context(record), contractId: requirement.id }));
      }
      dependencies.set(key, requirement.optional ? undefined : provider);
      if (requirement.optional && provider) optional.push({ id, key, provider, contractId: requirement.id });
    }
  }
  function reaches(from: string, target: string, seen = new Set<string>()): boolean {
    if (from === target) return true;
    if (seen.has(from)) return false;
    seen.add(from);
    return [...(edges.get(from)?.values() ?? [])].some(next => next !== undefined && reaches(next, target, seen));
  }
  for (const edge of optional) {
    if (reaches(edge.provider, edge.id)) omitted.push({ pluginId: edge.id, contractId: edge.contractId });
    else edges.get(edge.id)!.set(edge.key, edge.provider);
  }
  const reachable = new Set<string>();
  function visit(id: string, path: readonly string[]): void {
    if (path.includes(id)) throw new LunarisError("DEPENDENCY_CYCLE", `Dependency cycle: ${[...path, id].join(" -> ")}.`, { pluginId: root });
    if (reachable.has(id)) return;
    if (errors.has(id)) throw errors.get(id)!;
    const record = records.get(id)!;
    if (record.state === "active" && record.activation && !record.activation.scope.closed) {
      reachable.add(id);
      return;
    }
    for (const dependency of new Set(edges.get(id)!.values())) if (dependency) {
      // Optional provider failures do not invalidate its consumer's graph.
      const isRequired = [...edges.get(id)!].some(([key, value]) => value === dependency && !records.get(id)!.definition.manifest.requires.find(r => requirementKey(r) === key)!.optional);
      try { visit(dependency, [...path, id]); }
      catch (error) { if (isRequired) throw error; }
    }
    reachable.add(id);
  }
  visit(root, []);
  const order: string[] = [];
  while (reachable.size) {
    const next = [...reachable].sort().find(id => [...edges.get(id)!.values()].every(dependency => !dependency || !reachable.has(dependency)));
    if (!next) throw new LunarisError("DEPENDENCY_CYCLE", "Dependency cycle prevents activation.", { pluginId: root });
    order.push(next); reachable.delete(next);
  }
  return { order, edges, errors, omitted };
}
