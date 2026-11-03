import { assertCompatibleTokens, assertDeclaration, contractKey, defineApi, defineEvent, defineHook, LunarisError } from "@lunaris/sdk";
import type { ContractToken, DeclarationRole, TokenMetadata } from "@lunaris/sdk";
import { context, requirementKey } from "./model.js";
import type { Activation, Binding, Registration } from "./model.js";

export class Access {
  #contracts = new Map<string, { token: ContractToken; owners: Set<Activation> }>();
  #snapshots = new WeakMap<ContractToken, ContractToken>();

  snapshot<T extends ContractToken>(token: T): T {
    const prior = this.#snapshots.get(token);
    if (prior) return prior as T;
    contractKey(token);
    const { kind, ...metadata } = token;
    const checked = metadata as TokenMetadata;
    const snapshot = kind === "api" ? defineApi(checked) : kind === "event" ? defineEvent(checked) : defineHook(checked);
    this.#snapshots.set(snapshot, snapshot);
    if (Object.isFrozen(token)) this.#snapshots.set(token, snapshot);
    return snapshot as T;
  }

  release(activation: Activation): void {
    for (const key of activation.tokens.keys()) {
      const contract = this.#contracts.get(key);
      contract?.owners.delete(activation);
      if (contract?.owners.size === 0) this.#contracts.delete(key);
    }
  }

  #assertMetadata(key: string, token: ContractToken): void {
    const active = this.#contracts.get(key);
    if (active) assertCompatibleTokens(active.token, token);
  }

  #admit(key: string, activation: Activation, token: ContractToken): void {
    let contract = this.#contracts.get(key);
    if (!contract) {
      // Canonical metadata must not retain a departed participant's validator closure.
      const { validate: _validate, ...metadata } = token;
      this.#contracts.set(key, contract = { token: this.snapshot(metadata), owners: new Set() });
    }
    contract.owners.add(activation);
  }

  commit(activation: Activation): void {
    // Validate the whole transaction before publishing any canonical metadata.
    for (const [key, token] of activation.tokens) this.#assertMetadata(key, token);
    for (const [key, token] of activation.tokens) this.#admit(key, activation, token);
  }

  constructor(
    readonly authorize: (record: Registration, token: ContractToken, role: "provide" | "consume") => void,
    readonly invoke: <T>(callback: () => T) => T,
  ) {}

  compatible(a: ContractToken, b: ContractToken): void {
    if (a.kind !== b.kind || a.id !== b.id || !versionSatisfies(a.version, `^${b.version}`) ||
      a.providePermission !== b.providePermission || a.consumePermission !== b.consumePermission) {
      throw new LunarisError("CONTRACT_METADATA_CONFLICT", "Incompatible contract metadata.", { contractId: a.id });
    }
    if (a.version === b.version) assertCompatibleTokens(a, b);
  }

  check(record: Registration, activation: Activation, token: ContractToken, role: DeclarationRole): void {
    activation.scope.assertOpen();
    if (record.activation !== activation) throw new LunarisError("SCOPE_CLOSED", "Stale activation.", context(record, activation));
    assertDeclaration(record.definition.manifest, token, role);
    const key = contractKey(token);
    const prior = activation.tokens.get(key);
    if (prior && prior !== token) assertCompatibleTokens(prior, token);
    this.#assertMetadata(key, token);
    this.authorize(record, token, role === "provide" ? "provide" : "consume");
    activation.tokens.set(key, token);
    if (record.state === "active") this.#admit(key, activation, token);
  }

  binding(record: Registration, activation: Activation, token: ContractToken, role: "require" | "optional" | "consume"): Binding | undefined {
    this.check(record, activation, token, role);
    const binding = activation.bindings.get(requirementKey(token));
    if (!binding) {
      if (role === "optional") return undefined;
      throw new LunarisError("PROVIDER_UNAVAILABLE", "No provider was bound for this activation.", { ...context(record, activation), contractId: token.id });
    }
    this.available(binding, token);
    return binding;
  }

  available(binding: Binding, token: ContractToken): void {
    if (binding.provider.activation !== binding.activation || binding.provider.state !== "active" || binding.activation.scope.closed) {
      throw new LunarisError("PROVIDER_UNAVAILABLE", "Bound provider is unavailable.", { ...context(binding.provider, binding.activation), contractId: token.id });
    }
    if (!versionSatisfies(binding.version, `^${token.version}`)) {
      throw new LunarisError("CONTRACT_METADATA_CONFLICT", "Bound provider does not support the requested contract version.", { contractId: token.id });
    }
  }

  validate(token: ContractToken, value: unknown): void {
    if (token.validate && this.invoke(() => token.validate!(value)) !== true) {
      throw new LunarisError("VALIDATION_FAILED", "Contract value failed validation.", { contractId: token.id });
    }
  }
}
import { versionSatisfies } from "@lunaris/manifest";
