import { useLayoutEffect, useRef } from "react";
import { ActionIcon, Box, Modal } from "@mantine/core";
import type { ComponentProps } from "@lunaris/components";
import { Icon } from "./icons.js";
import { SettingsNavigation, settingsNavigationProps } from "./settings.js";
import type { NavigationProps } from "./settings.js";
import type { resolveTheme } from "./theme.js";

interface Props extends NavigationProps {
  readonly compact: boolean;
  readonly closeLabel: string;
  readonly backLabel: string;
  readonly onClose: () => void;
  readonly onBack: () => void;
  readonly onTargets: (page: HTMLElement | null, popups: HTMLElement | null) => void;
}

export function settingsWindowProps(value: ComponentProps): Props {
  settingsNavigationProps(value);
  if (typeof value.compact !== "boolean" || typeof value.closeLabel !== "string" || typeof value.backLabel !== "string" ||
      typeof value.onClose !== "function" || typeof value.onBack !== "function" || typeof value.onTargets !== "function") {
    throw new TypeError("Invalid settings window props.");
  }
  return value as unknown as Props;
}

export function SettingsWindow({ props, theme }: { props: Props; theme: ReturnType<typeof resolveTheme> }) {
  const dialog = useRef<HTMLDivElement>(null);
  const navigation = useRef<HTMLDivElement>(null);
  const back = useRef<HTMLButtonElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const page = useRef<HTMLDivElement>(null);
  const popups = useRef<HTMLDivElement>(null);
  const previous = useRef({ selectedId: null as string | null, compact: props.compact });
  const selected = props.categories.find(category => category.id === props.selectedId);
  const showNavigation = !props.compact || !selected;
  const showPage = !!selected;
  const publish = props.onTargets;

  useLayoutEffect(() => { publish(page.current, popups.current); }, [publish, showPage]);
  useLayoutEffect(() => () => publish(null, null), [publish]);
  useLayoutEffect(() => {
    const prior = previous.current;
    previous.current = { selectedId: props.selectedId, compact: props.compact };
    const host = dialog.current;
    const active = host?.ownerDocument.activeElement;
    const focusLostOnResize = prior.compact !== props.compact && (!host?.contains(active ?? null) || active?.closest("[hidden]"));
    if (!props.compact) {
      if (focusLostOnResize) close.current?.focus({ preventScroll: true });
      return;
    }
    if (prior.selectedId === props.selectedId && !focusLostOnResize) return;
    const selectedButton = Array.from(navigation.current?.querySelectorAll<HTMLButtonElement>("[data-settings-category]") ?? [])
      .find(button => button.dataset.settingsCategory === prior.selectedId);
    if (!selected) selectedButton?.scrollIntoView?.({ block: "nearest" });
    (selected ? back.current : selectedButton ?? close.current)?.focus({ preventScroll: true });
  }, [props.compact, props.selectedId, selected]);

  return <Modal.Root opened onClose={props.onClose} withinPortal={false} returnFocus={false} lockScroll={false}
    closeOnEscape={false} closeOnClickOutside={!props.compact} centered={!props.compact} fullScreen={props.compact}
    transitionProps={{ duration: 0 }} className="lm-settings-window" data-compact={props.compact || undefined} style={theme.contentStyle}
    classNames={{ inner: "lm-settings-window-inner", content: "lm-settings-dialog", header: "lm-settings-dialog-header",
      title: "lm-settings-dialog-title", body: "lm-settings-dialog-body", overlay: "lm-settings-window-backdrop" }}
    onKeyDown={event => {
      const target = event.target as HTMLElement;
      if (event.key !== "Escape" || event.defaultPrevented || event.nativeEvent.isComposing ||
          target.closest('[role="dialog"]') !== dialog.current || target.getAttribute("data-mantine-stop-propagation") === "true") return;
      event.preventDefault();
      props.onClose();
    }}>
    {!props.compact && <Modal.Overlay backgroundOpacity={0.48} />}
    <Modal.Content ref={dialog}>
      <Modal.Header>
        {props.compact && selected && <ActionIcon ref={back} size={32} variant="subtle" className="lm-settings-window-action lm-focus"
          aria-label={props.backLabel} title={props.backLabel} onClick={props.onBack}><Icon name="back" /></ActionIcon>}
        <Modal.Title>{props.compact && selected ? selected.title : props.title}</Modal.Title>
        <ActionIcon ref={close} size={32} variant="subtle" className="lm-settings-window-action lm-focus"
          aria-label={props.closeLabel} title={props.closeLabel} onClick={props.onClose} data-autofocus><Icon name="window-close" /></ActionIcon>
      </Modal.Header>
      <Modal.Body>
        <Box ref={navigation} className="lm-settings-window-navigation" hidden={!showNavigation}>
          <SettingsNavigation props={{ ...props, showTitle: false }} theme={theme} />
        </Box>
        {showPage && <Box ref={page} className="lm-settings-window-page" />}
      </Modal.Body>
      <Box ref={popups} />
    </Modal.Content>
  </Modal.Root>;
}
