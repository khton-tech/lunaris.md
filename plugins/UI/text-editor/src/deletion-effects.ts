import type { Transaction } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import type { EditorEffectsApi, EditorEffect, EditorParticle } from "@lunaris/editor";
import type { CancellationSignal } from "@lunaris/sdk";

export function createDeletionEffects(signal: CancellationSignal, failed: (error: unknown) => void) {
  const entries = new Map<string, { effect: EditorEffect; owner: CancellationSignal }>();
  const api: EditorEffectsApi = {
    register(effect, owner) {
      if (!owner || typeof owner.addEventListener !== "function" || typeof owner.removeEventListener !== "function" ||
          typeof effect?.id !== "string" || !effect.id.trim() || typeof effect.onDelete !== "function" || entries.size >= 16) {
        return { ok: false, error: { code: "INVALID_ARGUMENT", message: "A valid editor effect and owner are required." } };
      }
      if (signal.aborted || owner.aborted) return { ok: false, error: { code: "CANCELLED", message: "Editor effect owner is closed." } };
      if (entries.has(effect.id)) return { ok: false, error: { code: "ALREADY_REGISTERED", message: "Editor effect ID is already registered." } };
      const id = effect.id;
      const lifetime = new AbortController();
      const dispose = () => {
        if (lifetime.signal.aborted) return;
        entries.delete(id);
        lifetime.abort();
        owner.removeEventListener("abort", dispose);
        signal.removeEventListener("abort", dispose);
      };
      entries.set(id, { effect: { id, onDelete: effect.onDelete }, owner: lifetime.signal });
      owner.addEventListener("abort", dispose, { once: true });
      signal.addEventListener("abort", dispose, { once: true });
      return { ok: true, value: { dispose } };
    },
  };

  function mount() {
    const live = new Set<() => void>();
    return {
      dispose() { for (const stop of live) stop(); },
      dispatch(transactions: readonly Transaction[], view: EditorView) {
        let paint: (() => void) | undefined;
        try { if (entries.size && live.size < 4) paint = prepare(transactions, view, live); }
        catch (error) { failed(error); }
        view.update(transactions);
        try { paint?.(); } catch (error) { failed(error); }
      },
    };
  }

  function prepare(transactions: readonly Transaction[], view: EditorView, live: Set<() => void>): (() => void) | undefined {
    const transaction = transactions[0];
    const window = view.dom.ownerDocument.defaultView;
    if (transactions.length !== 1 || !transaction?.isUserEvent("delete") || view.composing ||
        view.state.readOnly || !window || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const bounds = view.dom.getBoundingClientRect();
    const viewport = view.scrollDOM.getBoundingClientRect();
    const positions: { left: number; top: number; width: number; height: number }[] = [];
    transaction.changes.iterChanges((from, to, _a, _b, inserted) => {
      if (inserted.length || positions.length >= 24) return;
      for (const range of view.visibleRanges) {
        const start = Math.max(from, range.from);
        const end = Math.min(to, range.to, start + 32);
        for (let pos = start; pos < end && positions.length < 24; pos++) {
          if (!/\S/u.test(view.state.sliceDoc(pos, pos + 1))) continue;
          const rect = view.coordsForChar(pos);
          if (!rect || rect.right <= viewport.left || rect.left >= viewport.right ||
              rect.bottom <= viewport.top || rect.top >= viewport.bottom) continue;
          const width = rect.right - rect.left;
          const height = rect.bottom - rect.top;
          if (width <= 0 || height <= 0) continue;
          positions.push({ left: rect.left - bounds.left, top: rect.top - bounds.top, width, height });
        }
      }
    });
    if (!positions.length) return;
    const samples = Object.freeze(positions.map(({ width, height }) => Object.freeze({ width, height })));
    return () => {
      let remaining = 96;
      for (const { effect, owner } of entries.values()) {
        if (owner.aborted || remaining === 0 || live.size >= 4) continue;
        try {
          const particles = effect.onDelete(samples);
          if (!Array.isArray(particles) || particles.length > 96) throw new TypeError("Invalid editor particle batch.");
          const admitted = particles.slice(0, remaining);
          if (!admitted.every(particle => validParticle(particle, samples.length))) throw new TypeError("Invalid editor particle geometry.");
          if (owner.aborted || !admitted.length) continue;
          remaining -= admitted.length;
          const layer = view.dom.ownerDocument.createElement("div");
          layer.className = "lm-editor-particles";
          layer.setAttribute("aria-hidden", "true");
          Object.assign(layer.style, { position: "absolute", inset: "0", pointerEvents: "none", overflow: "hidden" });
          let duration = 0;
          for (const particle of admitted) {
            const position = positions[particle.sample]!;
            const dot = view.dom.ownerDocument.createElement("span");
            Object.assign(dot.style, {
              position: "absolute", left: `${position.left + particle.x * position.width}px`,
              top: `${position.top + particle.y * position.height}px`, width: `${particle.size}px`,
              height: `${particle.size}px`, borderRadius: "50%", background: "currentColor", opacity: "0",
            });
            dot.animate?.([{ opacity: 0.9, transform: "translate(0, 0) scale(1)" }, {
              opacity: 0, transform: `translate(${particle.dx}px, ${particle.dy}px) scale(0.2)`,
            }], { duration: particle.durationMs, easing: "cubic-bezier(.2,.5,.6,1)" });
            layer.append(dot);
            duration = Math.max(duration, particle.durationMs);
          }
          view.dom.append(layer);
          const stop = () => { window.clearTimeout(timer); layer.remove(); live.delete(stop); owner.removeEventListener("abort", stop); };
          const timer = window.setTimeout(stop, duration);
          live.add(stop);
          owner.addEventListener("abort", stop, { once: true });
        } catch (error) { failed(error); }
      }
    };
  }
  return { api, mount };
}

function validParticle(value: EditorParticle, count: number): boolean {
  const between = (number: number, min: number, max: number) => Number.isFinite(number) && number >= min && number <= max;
  return !!value && Number.isInteger(value.sample) && between(value.sample, 0, count - 1) &&
    between(value.x, 0, 1) && between(value.y, 0, 1) && between(value.dx, -160, 160) &&
    between(value.dy, -160, 160) && between(value.size, 1, 6) && between(value.durationMs, 50, 650);
}
