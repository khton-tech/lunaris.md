import { assertCompatibleTokens, assertDeclaration, contractKey, LunarisError } from "@lunaris/sdk";
import type { ContractToken, DeclarationRole } from "@lunaris/sdk";
import { context, requirementKey } from "./model.js";
import type { Activation, Binding, Registration } from "./model.js";

export class Access {
  constructor(
    private readonly records: ReadonlyMap<string, Registration>,
    readonly authorize: (record: Registration, token: ContractToken, role: "provide" | "consume") => void,
    readonly invoke: <T>(callback: () => T) => T,
  ) {}

  compatible(a: ContractToken, b: ContractToken): void {
    if (a.kind !== b.kind || a.id !== b.id || a.version.split(".")[0] !== b.version.split(".")[0] ||
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
    for (const other of this.records.values()) {
      if (other !== record && other.state !== "active") continue;
      const prior = other.activation?.tokens.get(key);
      if (prior) assertCompatibleTokens(prior, token);
    }
    this.authorize(record, token, role === "provide" ? "provide" : "consume");
    activation.tokens.set(key, Object.freeze({ ...token }));
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
    if (binding.version.split(".")[0] !== token.version.split(".")[0]) {
      throw new LunarisError("CONTRACT_METADATA_CONFLICT", "Bound provider has a different contract major.", { contractId: token.id });
    }
  }

  validate(token: ContractToken, value: unknown): void {
    if (token.validate && this.invoke(() => token.validate!(value)) !== true) {
      throw new LunarisError("VALIDATION_FAILED", "Contract value failed validation.", { contractId: token.id });
    }
  }
}
