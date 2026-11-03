import type { Scheduler } from "@lunaris/kernel";

/** Browsers clamp large timer delays; reschedule against a monotonic deadline. */
export function createWebviewScheduler(): Scheduler {
  return { schedule(delayMs, callback) {
    const deadline = performance.now() + delayMs;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      if (cancelled) return;
      const remaining = deadline - performance.now();
      if (remaining > 0) timer = setTimeout(tick, Math.min(remaining, 2147483647));
      else callback();
    };
    timer = setTimeout(tick, Math.min(delayMs, 2147483647));
    return () => { cancelled = true; clearTimeout(timer); };
  } };
}
