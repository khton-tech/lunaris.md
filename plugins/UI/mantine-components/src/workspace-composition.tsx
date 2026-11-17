import { useLayoutEffect, useRef, useState } from "react";
import { Box, Paper } from "@mantine/core";
import { observeVirtualKeyboard } from "@lunaris/components";
import type { WorkspaceLayoutNode, WorkspaceRegion } from "@lunaris/workspace";
import type { resolveTheme } from "./theme.js";

type Regions = Partial<Record<WorkspaceRegion, HTMLElement>>;
interface Props {
  readonly tree: WorkspaceLayoutNode;
  readonly mainLabel: string;
  readonly panelLabel: string;
  readonly onTargets: (targets: Readonly<Regions> | null, compact?: boolean) => void;
  readonly onDismiss: () => void;
  readonly theme: ReturnType<typeof resolveTheme>;
}

export function ComposedWorkspace({ tree, mainLabel, panelLabel, onTargets, onDismiss, theme }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const placements = useRef(new Map<WorkspaceRegion, HTMLElement>());
  const targets = useRef(new Map<WorkspaceRegion, HTMLDivElement>());
  const [compact, setCompact] = useState(false);
  useLayoutEffect(() => {
    const element = root.current!;
    let keyboardOpen = false;
    let fullHeight = 0;
    function measure(): void {
      const { width, height } = element.getBoundingClientRect();
      if (!keyboardOpen || fullHeight === 0) fullHeight = height;
      setCompact(width > 0 && (width <= 760 || (width <= 960 && fullHeight > 0 && fullHeight <= 500)));
    }
    const release = observeVirtualKeyboard(element.ownerDocument.defaultView!, viewport => { keyboardOpen = viewport !== null; if (!keyboardOpen) measure(); });
    const observer = new ResizeObserver(measure); observer.observe(element); measure();
    return () => { observer.disconnect(); release(); };
  }, []);
  useLayoutEffect(() => {
    const next: Regions = {};
    for (const [region, placement] of placements.current) {
      let target = targets.current.get(region);
      if (!target) {
        target = placement.ownerDocument.createElement("div");
        target.className = "lm-composed-workspace-target";
        targets.current.set(region, target);
      }
      if (target.parentElement !== placement) placement.append(target);
      next[region] = target;
    }
    for (const [region, target] of targets.current) {
      if (!placements.current.has(region)) { target.remove(); targets.current.delete(region); }
    }
    onTargets(Object.freeze(next), compact);
  }, [tree, onTargets, compact]);
  useLayoutEffect(() => () => onTargets(null), [onTargets]);

  function render(node: WorkspaceLayoutNode, path: string) {
    const style = { flexGrow: node.grow ?? 1 };
    if (node.kind !== "region") return <Box key={path} className="lm-composed-workspace-group" data-direction={node.kind} style={style}>
      {node.children.map((child, index) => render(child, `${path}-${index}`))}
    </Box>;
    const { region } = node;
    const place = (target: HTMLElement | null) => {
      if (target) placements.current.set(region, target); else placements.current.delete(region);
    };
    if (region === "main") return <Box key={region} component="main" ref={place} aria-label={node.label ?? mainLabel}
      tabIndex={-1} className="lm-composed-workspace-region lm-workspace-main" data-workspace-region={region} style={style} />;
    const label = node.label ?? (region === "left-panel" ? panelLabel : undefined);
    return <Paper key={region} component="section" ref={place} aria-label={label} shadow="none" className="lm-composed-workspace-region lm-workspace-card"
      data-workspace-region={region} style={style} onKeyDown={region === "left-panel" ? event => {
        if (event.key === "Escape" && !event.defaultPrevented) { event.preventDefault(); onDismiss(); }
      } : undefined} />;
  }

  return <Box ref={root} className="lm-composed-workspace" data-compact={compact || undefined} style={theme.contentStyle}>{render(tree, "workspace")}</Box>;
}
