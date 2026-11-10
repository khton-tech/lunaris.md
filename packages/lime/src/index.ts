import { defineApi } from "@lunaris/sdk";
import type { CancellationSignal } from "@lunaris/sdk";

export type LimeFailure = { readonly code: "CANCELLED" | "BUSY" | "NO_VAULT" | "STALE" | "INVALID_PACKAGE" | "STORAGE_FAILED" | "RUNTIME_FAILED" | "NOT_FOUND" | "CONFLICT" | "UNSUPPORTED"; readonly message: string };
export type LimeResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: LimeFailure };
export interface LimePackagePickerApi {
  /** Only the explicitly selected file is readable. Cancellation returns successful null. */
  pick(owner: CancellationSignal): Promise<LimeResult<Uint8Array | null>>;
}
export const LimePackagePicker = defineApi<LimePackagePickerApi>({
  id: 'lunaris.lime-package-picker', version: '1.0.0', consumePermission: 'runtime.manage',
  validate: value => !!value && typeof value === 'object' && typeof Object.getOwnPropertyDescriptor(value, 'pick')?.value === 'function',
});
