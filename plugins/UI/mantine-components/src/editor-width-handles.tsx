import { useEffect, useRef, useState } from "react";
import { Box, UnstyledButton } from "@mantine/core";
import type { KeyboardEvent, PointerEvent, RefObject } from "react";

export type WidthPhase = "preview" | "commit" | "cancel";

/** Owned column controls; pointer capture keeps drags local to this role. */
export function EditorWidthHandles({ container, width, label, disabled, onChange }: {
  container: RefObject<HTMLDivElement | null>; width: number | "full"; label: string; disabled: boolean;
  onChange: (width: number, phase: WidthPhase) => void;
}) {
  const drag = useRef<{ pointer: number; x: number; initial: number; value: number; side: number } | null>(null);
  const callback = useRef(onChange); callback.current = onChange;
  const [active, setActive] = useState(false);
  const [compact, setCompact] = useState(false);
  const blocked = useRef(false);
  const available = () => Math.max(320, Math.min(1920, Math.floor(container.current?.getBoundingClientRect().width ?? 780)));
  const clamp = (value: number) => Math.max(320, Math.min(available(), Math.round(value)));
  const effective = () => width === "full" ? available() : Math.min(width, available());
  function cancel(): void {
    const current = drag.current; if (!current) return;
    drag.current = null; setActive(false); callback.current(current.initial, "cancel");
  }
  useEffect(() => {
    const element = container.current!;
    const mobile = element.ownerDocument.defaultView!.matchMedia("(max-width: 640px), (pointer: coarse)");
    const measure = () => {
      const size = element.getBoundingClientRect().width;
      blocked.current = mobile.matches || (size > 0 && size <= 640);
      if (blocked.current) cancel();
      setCompact(blocked.current);
    };
    const observer = new ResizeObserver(measure); observer.observe(element);
    mobile.addEventListener("change", measure); measure();
    return () => { observer.disconnect(); mobile.removeEventListener("change", measure); };
  }, [container]);
  useEffect(() => () => {
    if (drag.current) callback.current(drag.current.initial, "cancel");
  }, []);
  useEffect(() => { if (disabled) cancel(); }, [disabled]);
  function start(event: PointerEvent<HTMLButtonElement>, side: number): void {
    if (disabled || blocked.current || drag.current || event.button !== 0 || event.pointerType === "touch") return;
    const initial = effective();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { pointer: event.pointerId, x: event.clientX, initial, value: initial, side };
    setActive(true);
  }
  function move(event: PointerEvent<HTMLButtonElement>): void {
    const current = drag.current; if (!current || current.pointer !== event.pointerId) return;
    current.value = clamp(current.initial + 2 * current.side * (event.clientX - current.x));
    callback.current(current.value, "preview");
  }
  function finish(event: PointerEvent<HTMLButtonElement>): void {
    const current = drag.current; if (!current || current.pointer !== event.pointerId) return;
    move(event); drag.current = null; setActive(false);
    event.currentTarget.releasePointerCapture(event.pointerId);
    callback.current(current.value, current.value === current.initial ? "cancel" : "commit");
  }
  function key(event: KeyboardEvent<HTMLButtonElement>, side: number): void {
    if (event.key === "Escape" && drag.current) { event.preventDefault(); cancel(); return; }
    if (disabled || blocked.current || drag.current) return;
    const delta = event.shiftKey ? 80 : 20;
    const value = event.key === "Home" ? 320 : event.key === "End" ? available()
      : event.key === "ArrowLeft" ? clamp(effective() - side * delta)
      : event.key === "ArrowRight" ? clamp(effective() + side * delta) : null;
    if (value === null) return;
    event.preventDefault(); callback.current(value, "commit");
  }
  if (compact) return null;
  return <Box className="lm-editor-width-handles" data-active={active || undefined}
    style={{ maxWidth: width === "full" ? "none" : width }}>
    {[-1, 1].map(side => <UnstyledButton key={side} className="lm-editor-width-handle lm-focus" data-side={side === -1 ? "start" : "end"}
      role="separator" aria-orientation="vertical" aria-label={label} title={label}
      aria-valuemin={320} aria-valuemax={available()} aria-valuenow={effective()}
      disabled={disabled} onPointerDown={event => start(event, side)} onPointerMove={move} onPointerUp={finish}
      onPointerCancel={cancel} onLostPointerCapture={cancel} onKeyDown={event => key(event, side)} />)}
  </Box>;
}
