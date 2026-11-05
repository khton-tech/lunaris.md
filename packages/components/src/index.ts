import { defineApi, defineEvent } from "@lunaris/sdk";
import type { CancellationSignal } from "@lunaris/sdk";

/**
 * Shallow component input. Values may include callbacks (for example `onPress`).
 * Each component documents and validates its own props.
 */
export type ComponentProps = Readonly<Record<string, unknown>>;

/** A live rendering created by a component implementation. */
export interface ComponentInstance {
  /** Replace all props. Throwing reports a render failure to the consumer. */
  update(props: ComponentProps): void;
  /** Remove everything the instance added to its target. Called at most once. */
  dispose(): void;
}

/** Registered by component set plugins. The provider never renders by itself. */
export interface ComponentDefinition {
  /** Shared role ID such as `lunaris.button`; any compatible set may supply it. */
  readonly id: string;
  /**
   * Render into the borrowed target. The signal aborts when the instance is
   * released, so components may also bind listeners/theme subscriptions to it.
   */
  mount(target: HTMLElement, props: ComponentProps, signal: CancellationSignal): ComponentInstance;
}

export type ComponentErrorCode = "INVALID_ARGUMENT" | "ALREADY_REGISTERED" | "NOT_FOUND" | "RENDER_FAILED";
export type ComponentResult<T> = { readonly ok: true; readonly value: T } | {
  readonly ok: false; readonly error: { readonly code: ComponentErrorCode; readonly message: string };
};

/** Consumer handle for one mounted instance. Inert after release. */
export interface MountedComponent {
  readonly componentId: string;
  update(props: ComponentProps): ComponentResult<null>;
  dispose(): void;
}

export interface ComponentsApi {
  /** Add one owned implementation. Duplicate IDs never replace a live registration. */
  register(definition: ComponentDefinition, owner: CancellationSignal): ComponentResult<null>;
  has(id: string): boolean;
  /** Frozen, lexically sorted IDs of registered components. */
  list(): readonly string[];
  /** Render a registered component; owner cancellation releases the instance. */
  mount(id: string, target: HTMLElement, props: ComponentProps, owner: CancellationSignal): ComponentResult<MountedComponent>;
}

export interface ComponentChange {
  readonly kind: "registered" | "removed";
  readonly componentId: string;
}

const fn = (value: object, name: string): boolean => typeof Object.getOwnPropertyDescriptor(value, name)?.value === "function";

export const Components = defineApi<ComponentsApi>({
  id: "lunaris.components", version: "1.0.0", providePermission: "ui.dom", consumePermission: "ui.dom",
  validate: value => value !== null && typeof value === "object" && ["register", "has", "list", "mount"].every(name => fn(value, name)),
});

export const ComponentsChanged = defineEvent<ComponentChange>({
  id: "lunaris.components-changed", version: "1.0.0",
  validate(value) {
    if (!value || typeof value !== "object") return false;
    const field = (name: string): unknown => Object.getOwnPropertyDescriptor(value, name)?.value;
    return ["registered", "removed"].includes(field("kind") as string) && typeof field("componentId") === "string";
  },
});
