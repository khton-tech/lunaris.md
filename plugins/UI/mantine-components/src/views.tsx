import { useId, useLayoutEffect, useRef } from "react";
import { Box, Button, Group, Paper, Stack, Text, TextInput, Title } from "@mantine/core";
import type { SelectorProps, StartupProps } from "./props.js";
import type { resolveTheme } from "./theme.js";
import { Icon } from "./icons.js";

export function StartupScreen({ props, theme }: { props: StartupProps; theme: ReturnType<typeof resolveTheme> }) {
  return <Box component="section" className="lm-startup" style={{ ...theme.style, padding: theme.startup.padding, gap: theme.startup.gap }}>
    <Box component="pre" role="img" aria-label={props.logoLabel} style={{ fontSize: theme.startup.logoFontSize, lineHeight: theme.startup.logoLineHeight }}>{props.art}</Box>
    <Text role="status" aria-live="polite" aria-atomic="true" style={{ fontWeight: theme.startup.statusFontWeight }}>{props.status}</Text>
    <Text hidden={!props.detail} style={{ color: "var(--vault-secondary)" }}>{props.detail ?? ""}</Text>
  </Box>;
}

function ActionForm({ mode, props }: { mode: "create" | "select"; props: SelectorProps }) {
  const id = useId(); const expanded = props.mode === mode;
  const toggle = useRef<HTMLButtonElement>(null); const browse = useRef<HTMLButtonElement>(null); const form = useRef<HTMLFormElement>(null);
  const name = useRef<HTMLInputElement>(null); const next = useRef<HTMLButtonElement>(null); const wasBusy = useRef(props.busy);
  useLayoutEffect(() => {
    if (!expanded && form.current?.contains(form.current.ownerDocument.activeElement)) toggle.current?.focus({ preventScroll: true });
    if (expanded && wasBusy.current && !props.busy && !props.error) {
      (props.folder ? mode === "create" ? name.current : next.current : browse.current)?.focus({ preventScroll: true });
    }
    wasBusy.current = props.busy;
  });
  return <Box className="ln-vault-action" data-open={String(expanded)}>
    <Button ref={toggle} className="ln-vault-toggle" disabled={props.busy} aria-expanded={expanded} aria-controls={id}
      leftSection={<Icon name={mode === "create" ? "create" : "browse"} />} rightSection={<Icon name="expand" />}
      onClick={event => { props.onMode(mode); if (!expanded && event.detail === 0) browse.current?.focus({ preventScroll: true }); }}>
      {props.text[mode]}
    </Button>
    <Box className="ln-vault-disclosure" aria-hidden={!expanded}>
      <Box className="ln-vault-disclosure-body">
        <Box component="form" ref={form} id={id} inert={!expanded} onSubmit={event => { event.preventDefault(); if (expanded && !props.busy && props.canContinue) props.onNext(); }}>
          <Stack gap="sm">
            <Box>
              <Text component="span" id={`${id}-folder`} className="lm-label">{props.text.folder}</Text>
              <Group className="ln-vault-folder" role="group" aria-labelledby={`${id}-folder`} wrap="nowrap" gap="xs">
                <Text component="span" id={`${id}-path`} className="ln-vault-path" title={expanded ? props.folder : ""}>{expanded && props.folder ? props.folder : props.text.folderPlaceholder}</Text>
                <Button ref={browse} aria-label={props.text.browse} aria-describedby={`${id}-path`} title={props.text.browse} disabled={props.busy || !expanded} onClick={props.onBrowse}><Icon name="browse" /></Button>
              </Group>
            </Box>
            <TextInput ref={name} hidden={mode !== "create"} label={props.text.name} value={props.name} maxLength={200} required={mode === "create"} autoComplete="off" spellCheck={false}
              disabled={props.busy || !expanded} onChange={event => props.onName(event.currentTarget.value)} />
            <Text role="alert" hidden={!expanded || !props.error}>{expanded ? props.error : ""}</Text>
            <Button ref={next} type="submit" className="ln-vault-next" rightSection={<Icon name="next" />} disabled={props.busy || !props.canContinue || !expanded}>{props.text.next}</Button>
          </Stack>
        </Box>
      </Box>
    </Box>
  </Box>;
}

export function VaultSelector({ props, theme }: { props: SelectorProps; theme: ReturnType<typeof resolveTheme> }) {
  const main = useRef<HTMLDivElement>(null); const content = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const panel = main.current; const body = content.current; const view = panel?.ownerDocument.defaultView;
    if (!panel || !body || !view?.ResizeObserver) return;
    const observer = new view.ResizeObserver(() => {
      const padding = view.getComputedStyle(panel);
      const available = panel.clientHeight - parseFloat(padding.paddingTop) - parseFloat(padding.paddingBottom);
      const disclosed = [...body.querySelectorAll<HTMLElement>(".ln-vault-disclosure")].reduce((height, node) => height + node.offsetHeight, 0);
      const resting = body.offsetHeight - disclosed;
      const expansion = Math.max(0, ...[...body.querySelectorAll("form")].map(form => form.offsetHeight));
      const offset = `${Math.max(0, Math.min((available - resting) / 2, available - resting - expansion))}px`;
      if (panel.style.getPropertyValue("--vault-center-offset") !== offset) panel.style.setProperty("--vault-center-offset", offset);
    });
    observer.observe(panel); observer.observe(body); for (const form of body.querySelectorAll("form")) observer.observe(form);
    return () => observer.disconnect();
  }, []);
  return <Box component="section" className="ln-vault" style={theme.style} aria-busy={props.busy}>
    <Paper component="aside" className="ln-vault-recents" aria-label={props.text.recent}>
      <Title order={2}>{props.text.recent}</Title>
      <Stack component="ul" gap="xs">
        {props.entries.map(entry => <Box component="li" key={entry.reference}>
          <Button className="lm-recent" fullWidth leftSection={<Icon name="folder" />} disabled={props.busy} data-reference={entry.reference} aria-current={entry.reference === props.activeReference ? "true" : undefined} onClick={() => props.onRecent(entry.reference)}>
            <Stack gap={0} align="start"><Text component="span">{entry.name}</Text><Text component="small">{entry.label}</Text></Stack>
          </Button>
        </Box>)}
      </Stack>
      <Text hidden={props.entries.length > 0 || !!props.historyError}>{props.text.empty}</Text>
      <Text role="status" hidden={!props.historyError}>{props.historyError}</Text>
      <Button hidden={!props.historyError} disabled={props.busy} onClick={props.onRetry}>{props.text.retry}</Button>
    </Paper>
    <Paper ref={main} className="ln-vault-main">
      <Box ref={content} className="ln-vault-content">
        <Box component="pre" role="img" aria-label={props.text.logo}>{props.art}</Box>
        <Text className="ln-vault-status" role="status" aria-live="polite">{props.status}</Text>
        <Stack className="ln-vault-actions" gap="xs">
          <ActionForm mode="create" props={props} /><ActionForm mode="select" props={props} />
        </Stack>
        <Text role="alert" hidden={props.mode !== null || !props.error}>{props.mode === null ? props.error : ""}</Text>
      </Box>
    </Paper>
  </Box>;
}
