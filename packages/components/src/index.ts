import { defineApi, defineEvent } from "@lunaris/sdk";
import type { CancellationSignal } from "@lunaris/sdk";

/**
 * Shallow component input. Values may include callbacks (for example `onPress`).
 * Each component documents and validates its own props.
 */
export type ComponentProps = Readonly<Record<string, unknown>>;

/** Public presentation context supplied by the owner of a borrowed region.
 * Component sets implementing these props document role-specific defaults.
 * The registry transports them without interpreting rendering policy.
 */
export interface ComponentPresentation {
  readonly mode?: "embedded" | "standalone";
  readonly sizing?: "fill" | "content";
}

export interface ViewOption { readonly value: string; readonly label: string }
export interface ViewPointer { readonly x: number; readonly y: number; readonly button: number; readonly shift: boolean }
export interface ViewKey { readonly key: string; readonly ctrl: boolean; readonly shift: boolean; readonly alt: boolean; readonly meta: boolean }
export type ViewColor = 'text' | 'muted' | 'accent' | 'error' | 'surface' | 'none';
export type ViewShape =
  | { readonly kind: 'path'; readonly d: string; readonly color: ViewColor; readonly fill?: ViewColor }
  | { readonly kind: 'circle'; readonly x: number; readonly y: number; readonly radius: number; readonly color: ViewColor; readonly fill?: ViewColor }
  | { readonly kind: 'line'; readonly x: number; readonly y: number; readonly x2: number; readonly y2: number; readonly color: ViewColor }
  | { readonly kind: 'text'; readonly x: number; readonly y: number; readonly text: string; readonly color: ViewColor };
/** Data/callback UI surface; no borrowed DOM or framework objects cross into authors. */
export type ViewNode =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'row' | 'column' | 'grid'; readonly children: readonly ViewNode[]; readonly columns?: number }
  | { readonly kind: 'button'; readonly label: string; readonly disabled?: boolean; readonly onPress: () => void }
  | { readonly kind: 'input' | 'textarea'; readonly label: string; readonly value: string; readonly disabled?: boolean; readonly onChange: (value: string) => void }
  | { readonly kind: 'select'; readonly label: string; readonly value: string; readonly options: readonly ViewOption[]; readonly disabled?: boolean; readonly onChange: (value: string) => void }
  | { readonly kind: 'checkbox'; readonly label: string; readonly checked: boolean; readonly disabled?: boolean; readonly onChange: (value: boolean) => void }
  | { readonly kind: 'drawing'; readonly label: string; readonly width: number; readonly height: number; readonly shapes: readonly ViewShape[]; readonly onPointer?: (event: ViewPointer) => void; readonly onKey?: (event: ViewKey) => void };
export interface ViewDefinition {
  readonly id: string;
  render(props: ComponentProps): ViewNode;
}
export interface ViewsApi {
  register(definition: ViewDefinition, owner: CancellationSignal): ComponentResult<null>;
}

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

export const Views = defineApi<ViewsApi>({
  id: 'lunaris.views', version: '1.0.0', providePermission: 'ui.dom', consumePermission: 'ui.dom',
  validate: value => !!value && typeof value === 'object' && fn(value, 'register'),
});
