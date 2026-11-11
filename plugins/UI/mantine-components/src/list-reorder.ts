import { useLayoutEffect, useRef, useState } from "react";
import type { MouseEvent, PointerEvent } from "react";

type Edge = "before" | "after";
interface Drop { readonly id: string; readonly edge: Edge }
interface Drag {
  readonly id: string;
  readonly pointerId: number;
  readonly control: HTMLElement;
  readonly row: HTMLElement;
  readonly start: number;
  readonly crossStart: number;
  readonly grip: number;
  offset: number;
  moved: boolean;
}

export function useListReorder(
  axis: "x" | "y",
  items: readonly { readonly id: string }[],
  onReorder?: (id: string, targetId: string, edge: Edge) => void,
) {
  const list = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const frame = useRef<number | undefined>(undefined);
  const suppressClick = useRef(false);
  const [drop, setDrop] = useState<Drop | null>(null);
  const enabled = !!onReorder && items.length > 1;
  const horizontal = axis === "x";
  const coordinate = (event: PointerEvent<HTMLElement>) => horizontal ? event.clientX : event.clientY;
  const crossCoordinate = (event: PointerEvent<HTMLElement>) => horizontal ? event.clientY : event.clientX;
  const bounds = (element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    return horizontal ? { start: rect.left, size: rect.width } : { start: rect.top, size: rect.height };
  };

  function clearDrag(): void {
    const current = drag.current;
    drag.current = null;
    if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    frame.current = undefined;
    if (!current) return;
    current.row.style.removeProperty("transform");
    delete current.row.dataset.dragging;
    if (current.control.hasPointerCapture(current.pointerId)) current.control.releasePointerCapture(current.pointerId);
  }
  function cancel(): void {
    clearDrag();
    setDrop(null);
  }
  useLayoutEffect(() => clearDrag, []);
  useLayoutEffect(() => {
    const current = drag.current;
    if (current && (!enabled || !items.some(item => item.id === current.id))) cancel();
  }, [enabled, items]);

  function start(event: PointerEvent<HTMLElement>, row: HTMLElement, allowTouch = false): void {
    const id = row.dataset.reorderId;
    if (!id || !enabled || drag.current || event.button !== 0 || (!allowTouch && event.pointerType === "touch")) return;
    const control = event.currentTarget;
    control.setPointerCapture(event.pointerId);
    const start = coordinate(event);
    drag.current = { id, row, control, pointerId: event.pointerId, start, crossStart: crossCoordinate(event),
      grip: start - bounds(row).start, offset: 0, moved: false };
  }

  function position(current: Drag, pointer: number): Drop | null {
    const element = list.current;
    if (!element) return null;
    const rows = [...element.querySelectorAll<HTMLElement>("[data-reorder-id]")];
    const index = rows.indexOf(current.row);
    if (index === -1) return null;
    const direction = horizontal && element.ownerDocument.defaultView?.getComputedStyle(element).direction === "rtl" ? -1 : 1;
    const rect = bounds(current.row);
    const origin = rect.start - current.offset;
    const first = rows[direction === 1 ? 0 : rows.length - 1]!;
    const last = rows[direction === 1 ? rows.length - 1 : 0]!;
    const start = first === current.row ? origin : bounds(first).start;
    const lastRect = last === current.row ? { start: origin, size: rect.size } : bounds(last);
    const next = Math.max(start, Math.min(lastRect.start + lastRect.size - rect.size, pointer - current.grip));
    current.offset = next - origin;
    const center = next + rect.size / 2;
    const step = current.offset * direction < 0 ? -1 : 1;
    let target: Drop | null = null;
    for (let i = index + step; i >= 0 && i < rows.length; i += step) {
      const row = rows[i]!;
      const box = bounds(row);
      if ((center - box.start - box.size / 2) * direction * step < 0) break;
      target = { id: row.dataset.reorderId!, edge: step < 0 ? "before" : "after" };
    }
    current.row.style.transform = `translate${horizontal ? "X" : "Y"}(${current.offset}px)`;
    return target;
  }

  function scrollWhileDragging(pointer: number): boolean {
    const element = list.current;
    if (!element || (horizontal ? element.scrollWidth <= element.clientWidth : element.scrollHeight <= element.clientHeight)) return false;
    const { start, size } = bounds(element);
    const edge = Math.min(horizontal ? 24 : 16, size / 4);
    const end = start + size;
    const delta = pointer >= start && pointer < start + edge ? -edge : pointer <= end && pointer > end - edge ? edge : 0;
    if (!delta) return false;
    const key = horizontal ? "scrollLeft" : "scrollTop";
    const previous = element[key];
    element[key] += delta;
    return element[key] !== previous;
  }

  function updatePosition(current: Drag, pointer: number): void {
    const scrolled = scrollWhileDragging(pointer);
    const target = position(current, pointer);
    setDrop(previous => previous?.id === target?.id && previous?.edge === target?.edge ? previous : target);
    if (!horizontal && scrolled) frame.current = requestAnimationFrame(() => {
      frame.current = undefined;
      if (drag.current === current) updatePosition(current, pointer);
    });
  }

  return { list, drop, enabled, start, cancel, handlers: {
    onPointerDownCapture() { if (!drag.current) suppressClick.current = false; },
    onPointerMove(event: PointerEvent<HTMLDivElement>) {
      const current = drag.current;
      if (!current || current.pointerId !== event.pointerId) return;
      const pointer = coordinate(event);
      if (!current.moved) {
        const distance = Math.abs(pointer - current.start);
        if (distance >= 5 || Math.abs(crossCoordinate(event) - current.crossStart) >= 5) suppressClick.current = true;
        if (distance < 5) return;
        current.moved = true;
        current.row.dataset.dragging = "";
      }
      if (frame.current !== undefined) cancelAnimationFrame(frame.current);
      frame.current = undefined;
      updatePosition(current, pointer);
    },
    onPointerUp(event: PointerEvent<HTMLDivElement>) {
      const current = drag.current;
      if (!current || current.pointerId !== event.pointerId) return;
      const target = current.moved ? position(current, coordinate(event)) : null;
      cancel();
      if (target) onReorder?.(current.id, target.id, target.edge);
    },
    onPointerCancel(event: PointerEvent<HTMLDivElement>) {
      if (drag.current?.pointerId === event.pointerId) cancel();
    },
    onLostPointerCapture(event: PointerEvent<HTMLDivElement>) {
      if (drag.current?.pointerId === event.pointerId) cancel();
    },
    onClickCapture(event: MouseEvent<HTMLDivElement>) {
      if (!suppressClick.current || event.detail === 0) return;
      suppressClick.current = false;
      event.preventDefault();
      event.stopPropagation();
    },
  } };
}
