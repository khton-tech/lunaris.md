import type { ApiToken, EventToken, HookToken } from "./tokens.js";

export type MaybePromise<T> = T | Promise<T>;

/** A resource whose owner may release it more than once safely. */
export interface Disposable {
  dispose(): MaybePromise<void>;
}

/** Platform-neutral cancellation; drivers adapt to native AbortSignal where needed. */
export interface CancellationSignal {
  readonly aborted: boolean;
  readonly reason: unknown;
  throwIfAborted(): void;
  addEventListener(type: "abort", listener: () => void, options?: { readonly once?: boolean }): void;
  removeEventListener(type: "abort", listener: () => void): void;
}

export interface ResourceScope extends Disposable {
  readonly signal: CancellationSignal;
  own<T extends Disposable>(resource: T): T;
  child(): ResourceScope;
  dispose(): Promise<void>;
}

export interface PluginContext {
  readonly pluginId: string;
  readonly activationId: string;
  readonly signal: CancellationSignal;
  readonly scope: ResourceScope;
  provide<T extends object>(token: ApiToken<T>, implementation: NoInfer<T>): Disposable;
  use<T extends object>(token: ApiToken<T>): T;
  optional<T extends object>(token: ApiToken<T>): T | undefined;
  readonly events: {
    on<T>(token: EventToken<T>, listener: (payload: Readonly<NoInfer<T>>) => MaybePromise<void>): Disposable;
    emit<T>(token: EventToken<T>, payload: Readonly<NoInfer<T>>): Promise<void>;
  };
  readonly hooks: {
    register<T>(token: HookToken<T>, handler: (value: NoInfer<T>) => MaybePromise<NoInfer<T>>, options?: { readonly priority?: number }): Disposable;
    run<T>(token: HookToken<T>, value: NoInfer<T>): Promise<T>;
  };
  readonly permissions: {
    has(permission: string): boolean;
    request(permission: string): Promise<boolean>;
  };
}
