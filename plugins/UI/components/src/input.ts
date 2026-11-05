import type { CancellationSignal } from "@lunaris/sdk";
import type { ComponentDefinition, ComponentInstance, ComponentProps } from "@lunaris/components";

export const isComponentId = (value: unknown): value is string =>
  typeof value === "string" && /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/.test(value);

const plain = (value: unknown): value is object => !!value && typeof value === "object" &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));

export const isLiveOwner = (owner: unknown): owner is CancellationSignal => !!owner && typeof owner === "object" &&
  (owner as CancellationSignal).aborted === false && typeof (owner as CancellationSignal).addEventListener === "function" &&
  typeof (owner as CancellationSignal).removeEventListener === "function";

/** Element check that works across realms (no `instanceof HTMLElement`). */
export const isElement = (value: unknown): value is HTMLElement => !!value && typeof value === "object" &&
  (value as Node).nodeType === 1 && typeof (value as Node).appendChild === "function";

/** Capture exactly `{ id, mount }` without executing accessors or retaining the input. */
export function readDefinition(input: unknown): ComponentDefinition | undefined {
  if (!plain(input) || Reflect.ownKeys(input).length !== 2) return;
  const id = Object.getOwnPropertyDescriptor(input, "id");
  const mount = Object.getOwnPropertyDescriptor(input, "mount");
  if (!id || !mount || !("value" in id) || !("value" in mount)) return;
  if (!isComponentId(id.value) || typeof mount.value !== "function") return;
  return Object.freeze({ id: id.value, mount: mount.value as ComponentDefinition["mount"] });
}

/** Shallow, frozen copy of plain props. Values are passed through as-is. */
export function readProps(input: unknown): ComponentProps | undefined {
  if (!plain(input)) return;
  const result: Record<string, unknown> = {};
  for (const key of Reflect.ownKeys(input)) {
    const field = Object.getOwnPropertyDescriptor(input, key)!;
    if (typeof key !== "string" || key === "__proto__" || !("value" in field)) return;
    result[key] = field.value;
  }
  return Object.freeze(result);
}

/** Read instance methods once, so later mutation of the returned object has no effect. */
export function readInstance(value: unknown): ComponentInstance | undefined {
  if (!value || typeof value !== "object") return;
  const update = Object.getOwnPropertyDescriptor(value, "update")?.value ?? (value as ComponentInstance).update;
  const dispose = Object.getOwnPropertyDescriptor(value, "dispose")?.value ?? (value as ComponentInstance).dispose;
  if (typeof update !== "function" || typeof dispose !== "function") return;
  return { update: props => { update.call(value, props); }, dispose: () => { dispose.call(value); } };
}
