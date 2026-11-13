import { createContext, useContext, useEffectEvent, useLayoutEffect, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { Menu } from "@mantine/core";
import type { MenuProps } from "@mantine/core";
import type { resolveTheme } from "./theme.js";

interface Overlay { readonly id: string; readonly target: HTMLElement; readonly owner: HTMLElement }
const DropdownContext = createContext<Overlay | null>(null);

/** The SDK mount owns this themed overlay and releases it with its content. */
export function DropdownOverlay({ overlay, theme, compact, children }: { overlay: Overlay; theme: ReturnType<typeof resolveTheme>; compact: boolean; children: ReactNode }) {
  return <DropdownContext value={overlay}>
    {children}
    {createPortal(<div id={overlay.id} className="lm-root lm-dropdown-overlay" data-mantine-color-scheme={theme.scheme}
      data-window-chrome={theme.windowChrome} data-compact={compact || undefined} style={theme.contentStyle} />, overlay.target)}
  </DropdownContext>;
}

/** Inactivity is lifecycle state, never a source of presentation or surface ownership. */
export function useDropdownOverlay(opened: boolean, onClose: () => void): string | undefined {
  const overlay = useContext(DropdownContext);
  const close = useEffectEvent(onClose);
  useLayoutEffect(() => {
    if (!opened || !overlay) return;
    const { owner } = overlay;
    const dismissIfInactive = () => {
      if (!owner.isConnected || owner.closest('[hidden], [inert], [aria-hidden="true"]')) close();
    };
    const observer = new owner.ownerDocument.defaultView!.MutationObserver(dismissIfInactive);
    for (let node: HTMLElement | null = owner; node; node = node.parentElement) {
      observer.observe(node, { attributes: true, attributeFilter: ["hidden", "inert", "aria-hidden"] });
    }
    dismissIfInactive();
    return () => observer.disconnect();
  }, [opened, overlay?.owner]);
  return overlay ? `#${overlay.id}` : undefined;
}

/** Mantine retains menu navigation, focus return and dismissal in the viewport. */
export function ViewportMenu({ disabled = false, compact = false, children, ...props }: Omit<MenuProps, "opened" | "onChange"> & { disabled?: boolean; compact?: boolean }) {
  const [opened, setOpened] = useState(false);
  const target = useDropdownOverlay(opened, () => setOpened(false));
  useLayoutEffect(() => { if (disabled) setOpened(false); }, [disabled]);
  const active = opened && !disabled;
  return <Menu {...props} opened={active} onChange={setOpened} withinPortal={!!target}
    {...(target ? { portalProps: { target }, floatingStrategy: "fixed", hideDetached: true, zIndex: 400 } : {})}
    attributes={{ ...props.attributes, dropdown: { ...props.attributes?.dropdown, inert: !active, "aria-hidden": !active, "data-compact": compact || undefined } }}>
    {children}
  </Menu>;
}
