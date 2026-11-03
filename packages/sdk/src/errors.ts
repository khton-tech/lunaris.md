export type ErrorCode =
  | "MANIFEST_INVALID" | "VERSION_INCOMPATIBLE"
  | "PLUGIN_DUPLICATE" | "PLUGIN_NOT_FOUND"
  | "LIFECYCLE_INVALID" | "LIFECYCLE_REENTRANT"
  | "ACTIVATION_FAILED" | "ACTIVATION_TIMEOUT" | "STOP_TIMEOUT" | "CLEANUP_FAILED"
  | "SCOPE_CLOSED" | "CONTRACT_UNDECLARED" | "CONTRACT_METADATA_CONFLICT"
  | "CONTRACT_UNAVAILABLE" | "PROVIDER_MISSING" | "PROVIDER_AMBIGUOUS"
  | "PROVIDER_UNAVAILABLE" | "DEPENDENCY_CYCLE" | "PERMISSION_DENIED"
  | "PERMISSION_REQUEST_FAILED" | "VALIDATION_FAILED" | "EVENT_LISTENER_FAILED" | "HOOK_FAILED";

export interface ErrorContext {
  readonly pluginId?: string;
  readonly activationId?: string;
  readonly contractId?: string;
  readonly path?: string;
}

/** Stable classification independent of localized presentation. */
export class LunarisError extends Error {
  readonly code: ErrorCode;
  readonly context: Readonly<ErrorContext>;

  constructor(code: ErrorCode, message: string, context: ErrorContext = {}, options?: ErrorOptions) {
    super(message, options);
    this.name = "LunarisError";
    this.code = code;
    this.context = Object.freeze({ ...context });
  }
}
