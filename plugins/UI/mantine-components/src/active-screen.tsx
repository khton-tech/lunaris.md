import { useLayoutEffect, useRef } from "react";
import { Box } from "@mantine/core";
import type { ComponentProps } from "@lunaris/components";
import type { resolveTheme } from "./theme.js";

interface ScreenProps {
  readonly ids: readonly string[];
  readonly activeId: string | null;
  readonly onTargets: (targets: ReadonlyMap<string, HTMLElement> | null) => void;
}
export function activeScreenProps(value: ComponentProps): ScreenProps {
  if (!Array.isArray(value.ids) || value.ids.some(id => typeof id !== "string") || new Set(value.ids).size !== value.ids.length ||
      (value.activeId !== null && (typeof value.activeId !== "string" || !value.ids.includes(value.activeId))) || typeof value.onTargets !== "function") throw new TypeError("Invalid active screen props.");
  return value as unknown as ScreenProps;
}
export function ActiveScreenView({ props, theme }: { props: ScreenProps; theme: ReturnType<typeof resolveTheme> }) {
  const targets = useRef(new Map<string, HTMLElement>());
  const signature = JSON.stringify(props.ids); const publish = props.onTargets;
  useLayoutEffect(() => { publish(new Map(targets.current)); }, [signature, publish]);
  useLayoutEffect(() => () => publish(null), [publish]);
  return <Box className="lm-active-screen" style={theme.contentStyle}>
    {props.ids.map(id => <Box key={id} className="lm-screen-target" data-screen-id={id}
      ref={node => { if (node) targets.current.set(id, node); else targets.current.delete(id); }}
      hidden={id !== props.activeId} inert={id !== props.activeId} aria-hidden={id !== props.activeId}
      style={{ display: id === props.activeId ? "flex" : "none", flex: "1 1 0%", minWidth: 0, minHeight: 0 }} />)}
  </Box>;
}
