import { definePlugin, LunarisError } from "@lunaris/sdk";
import type { CancellationSignal } from "@lunaris/sdk";
import { Logger, scopeLogger } from "@lunaris/logging";
import { Components, ComponentsChanged, Views } from "@lunaris/components";
import type { ComponentsApi, ComponentChange, ComponentDefinition, ComponentErrorCode, ComponentInstance, ComponentProps, ComponentResult, MountedComponent, ViewNode } from "@lunaris/components";
import { isComponentId, isElement, isLiveOwner, readDefinition, readInstance, readProps } from "./input.js";
import manifest from "../manifest.json" with { type: "json" };

interface Instance { readonly componentId: string; readonly release: () => void }
interface Registration { readonly definition: ComponentDefinition; readonly instances: Set<Instance>; readonly detach: () => void }
type Failure = Extract<ComponentResult<never>, { readonly ok: false }>;

const done: ComponentResult<null> = Object.freeze({ ok: true, value: null });

/** Dispose every instance; rethrow the first failure so kernel diagnostics see it. */
function releaseAll(instances: Iterable<Instance>): void {
  let failure: { error: unknown } | undefined;
  for (const instance of [...instances]) {
    try { instance.release(); } catch (error) { failure ??= { error }; }
  }
  if (failure) throw failure.error;
}

export default definePlugin({ manifest, activate(ctx) {
  const logger = scopeLogger(ctx.use(Logger), ctx.signal);
  const registrations = new Map<string, Registration>();
  const views = new Set<() => void>();
  function reject(code: ComponentErrorCode, message: string, data?: Record<string, unknown>): Failure {
    if (!ctx.signal.aborted) logger.warn(ctx.pluginId, message, { code, ...(data ? { data } : {}) });
    return { ok: false, error: { code, message } };
  }
  function notify(kind: ComponentChange["kind"], componentId: string, cleanup = false): void {
    // Never publish after this provider's own scope closes.
    if (ctx.signal.aborted) return;
    if (componentId === 'lunaris.declarative-view') for (const refresh of [...views]) {
      try { refresh(); } catch (error) { logger.error(ctx.pluginId, 'Cannot refresh a declarative view renderer', { error }); }
    }
    const change: ComponentChange = Object.freeze({ kind, componentId });
    // During owner cleanup, required dependencies such as Logger may already be stopping.
    if (!cleanup) logger.info(ctx.pluginId, "Component registry changed", { data: change });
    void ctx.events.emit(ComponentsChanged, change).catch(error => {
      if (ctx.signal.aborted || (error instanceof LunarisError && error.code === "CONTRACT_UNAVAILABLE")) return;
      if (!cleanup) logger.error(ctx.pluginId, "Cannot publish component change", { code: "COMPONENT_EVENT_FAILED", error });
    });
  }

  ctx.scope.own({ dispose() {
    const all = [...registrations.values()];
    registrations.clear();
    for (const entry of all) entry.detach();
    // Local cleanup only: no SDK or Logger calls after scope closure.
    releaseAll(all.flatMap(entry => [...entry.instances]));
  } });

  function mountInstance(registration: Registration, target: HTMLElement, props: ComponentProps, owner: CancellationSignal): ComponentResult<MountedComponent> {
    const componentId = registration.definition.id;
    const controller = new AbortController();
    let live: ComponentInstance | undefined;
    let released = false;
    const instance: Instance = { componentId, release() {
      if (released) return;
      released = true;
      owner.removeEventListener("abort", instance.release);
      registration.instances.delete(instance);
      controller.abort();
      live?.dispose();
    } };
    try {
      live = readInstance(registration.definition.mount(target, props, controller.signal));
      if (!live) throw new TypeError("Component mount must return update() and dispose() methods.");
    } catch (error) {
      // Abort lets the component roll back anything it attached before failing.
      released = true; controller.abort();
      logger.error(ctx.pluginId, "Component render failed", { code: "RENDER_FAILED", data: { componentId }, error });
      return { ok: false, error: { code: "RENDER_FAILED", message: "The component failed to render." } };
    }
    if (owner.aborted) {
      // The owner was cancelled while the component was rendering.
      try { instance.release(); } catch (error) {
        logger.error(ctx.pluginId, "Component disposal failed", { code: "DISPOSE_FAILED", data: { componentId }, error });
      }
      return reject("INVALID_ARGUMENT", "The owner was cancelled during mount.", { componentId });
    }
    registration.instances.add(instance);
    owner.addEventListener("abort", instance.release, { once: true });
    logger.debug(ctx.pluginId, "Component mounted", { data: { componentId } });
    const handle: MountedComponent = Object.freeze({
      componentId,
      update(next: unknown): ComponentResult<null> {
        if (released) return reject("NOT_FOUND", "The component instance was released.", { componentId });
        const copied = readProps(next);
        if (!copied) return reject("INVALID_ARGUMENT", "Component props must be a plain object.", { componentId });
        try { live!.update(copied); return done; } catch (error) {
          logger.error(ctx.pluginId, "Component update failed", { code: "RENDER_FAILED", data: { componentId }, error });
          return { ok: false, error: { code: "RENDER_FAILED", message: "The component failed to update." } };
        }
      },
      dispose(): void {
        if (released) return;
        try { instance.release(); } catch (error) {
          if (!ctx.signal.aborted) logger.error(ctx.pluginId, "Component disposal failed", { code: "DISPOSE_FAILED", data: { componentId }, error });
          return;
        }
        if (!ctx.signal.aborted) logger.debug(ctx.pluginId, "Component released", { data: { componentId } });
      },
    });
    return { ok: true, value: handle };
  }

  const api: ComponentsApi = {
    has: id => registrations.has(id),
    list: () => Object.freeze([...registrations.keys()].sort()),
    register(input, owner) {
      const definition = readDefinition(input);
      if (!definition || !isLiveOwner(owner)) {
        return reject("INVALID_ARGUMENT", "A valid component definition and live owner signal are required.");
      }
      if (registrations.has(definition.id)) {
        return reject("ALREADY_REGISTERED", "The component ID is already registered.", { componentId: definition.id });
      }
      const remove = () => {
        const entry = registrations.get(definition.id);
        if (entry?.definition !== definition) return;
        registrations.delete(definition.id);
        owner.removeEventListener("abort", remove);
        try { releaseAll(entry.instances); } finally { notify("removed", definition.id, true); }
      };
      registrations.set(definition.id, { definition, instances: new Set(), detach: () => owner.removeEventListener("abort", remove) });
      owner.addEventListener("abort", remove, { once: true });
      notify("registered", definition.id);
      return done;
    },
    mount(id, target, props, owner) {
      if (!isComponentId(id)) return reject("INVALID_ARGUMENT", "A component ID is required.");
      const copied = readProps(props);
      if (!isElement(target) || !copied || !isLiveOwner(owner)) {
        return reject("INVALID_ARGUMENT", "A target element, plain props and live owner signal are required.", { componentId: id });
      }
      const registration = registrations.get(id);
      if (!registration) return reject("NOT_FOUND", "The component is not registered.", { componentId: id });
      return mountInstance(registration, target, copied, owner);
    },
  };
  ctx.provide(Components, api);
  ctx.provide(Views, { register(input, owner) {
    const id = input && Object.getOwnPropertyDescriptor(input, 'id')?.value;
    const render = input && Object.getOwnPropertyDescriptor(input, 'render')?.value;
    if (!isComponentId(id) || id === 'lunaris.declarative-view' || typeof render !== 'function') return reject('INVALID_ARGUMENT', 'A view ID and render callback are required.');
    const renderer = render as (props: ComponentProps) => ViewNode;
    return api.register({ id, mount(target, initial, signal) {
      let props = initial; let inner: MountedComponent | undefined; let closed = false;
      const actions = (tree: ViewNode, depth = 0): ViewNode => {
        if (depth > 32) throw new Error('Declarative view nesting limit.');
        if (!tree || typeof tree !== 'object') return tree;
        const result = { ...tree };
        for (const name of ['onPress', 'onChange', 'onPointer', 'onKey']) {
          const callback = Object.getOwnPropertyDescriptor(tree, name)?.value;
          if (typeof callback !== 'function') continue;
          Object.defineProperty(result, name, { enumerable: true, value: (...args: unknown[]) => {
            if (signal.aborted || closed) return;
            const failed = (error: unknown) => { if (!signal.aborted && !ctx.signal.aborted) logger.error(ctx.pluginId, 'Declarative view action failed', { error, data: { componentId: id, action: name } }); };
            try { void Promise.resolve(callback(...args)).catch(failed); } catch (error) { failed(error); }
          } });
        }
        if ('children' in result && Array.isArray(result.children)) Object.defineProperty(result, 'children', { enumerable: true, value: result.children.map(child => actions(child, depth + 1)) });
        return result;
      };
      const refresh = () => {
        if (closed || signal.aborted) return;
        if (!api.has('lunaris.declarative-view')) { inner?.dispose(); inner = undefined; return; }
        const next = { tree: actions(renderer(props)), ...(props.presentation === undefined ? {} : { presentation: props.presentation }) };
        if (inner) { const result = inner.update(next); if (result.ok) return; inner.dispose(); inner = undefined; }
        const result = api.mount('lunaris.declarative-view', target, next, signal);
        if (!result.ok) throw new Error('Declarative view renderer failed.', { cause: result.error });
        inner = result.value;
      };
      views.add(refresh);
      try { refresh(); } catch (error) { views.delete(refresh); inner?.dispose(); throw error; }
      return { update(next) { props = next; refresh(); }, dispose() { if (closed) return; closed = true; views.delete(refresh); inner?.dispose(); inner = undefined; } };
    } }, owner);
  } });
  logger.info(ctx.pluginId, "Component provider ready", { code: "COMPONENTS_READY" });
} });
