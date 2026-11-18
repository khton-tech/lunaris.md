import { ActionButton } from "./action-button.js";
import { useId, useLayoutEffect, useRef } from "react";
import { Box, Button, Input, Paper, Stack, Text, TextInput, Title } from "@mantine/core";
import type { SelectorProps, StartupProps, WorkspaceHeaderProps, WorkspaceEmptyProps } from "./props.js";
import type { resolveTheme } from "./theme.js";
import { Icon } from "./icons.js";
import { CardRow } from "./card-row.js";

export function WorkspaceHeader({ props, theme }: { props: WorkspaceHeaderProps; theme: ReturnType<typeof resolveTheme> }) {
  return <Box component="header" className="lm-workspace-header" style={theme.contentStyle} aria-busy={props.busy}>
    <Box className="lm-workspace-toolbar">
      <Text component="h1" className="lm-workspace-name" title={props.name}>{props.name}</Text>
      <ActionButton disabled={props.busy} onClick={props.onClose}>{props.closeLabel}</ActionButton>
    </Box>
    <Text role="alert" hidden={!props.error}>{props.error}</Text>
  </Box>;
}
export function WorkspaceEmpty({ props, theme }: { props: WorkspaceEmptyProps; theme: ReturnType<typeof resolveTheme> }) {
  const { actions, recent } = props;
  const recentId = useId();
  if (actions) return <Box className="lm-workspace-empty" style={theme.contentStyle} aria-busy={actions.busy}>
    <Stack className="lm-workspace-empty-actions" data-has-recent={!!recent?.paths.length || undefined} align="stretch" gap="calc(var(--vault-space) * 2)">
      <ActionButton justify="start" leftSection={<Icon name="file-plus" />} disabled={actions.busy} onClick={actions.onCreate}>{actions.createLabel}</ActionButton>
      {!!recent?.paths.length && <Paper component="section" className="lm-workspace-recent" aria-labelledby={recentId}>
        <Title id={recentId} order={2}>{recent.label}</Title>
        <Stack gap={0}>
          {recent.paths.map(path => {
            const folders = path.split("/");
            const name = folders.pop()!.replace(/(.+)\.md$/i, "$1");
            const location = [recent.vaultName, ...folders].filter(Boolean).join(" / ") || "/";
            return <Button key={path} type="button" variant="subtle" className="lm-workspace-recent-row" justify="start" title={path}
              leftSection={<Icon name="file" />} disabled={recent.busy} onClick={() => recent.onOpen(path)}>
              <span className="lm-workspace-recent-file">
                <span>{name}</span>
                <span className="lm-workspace-recent-location">{location}</span>
              </span>
            </Button>;
          })}
        </Stack>
      </Paper>}
      {props.detail && <Text role="alert">{props.detail}</Text>}
    </Stack>
  </Box>;
  return <Box component="section" className="lm-workspace-empty" style={theme.contentStyle} aria-label={props.title}>
    <Stack align="center" gap="md">
      <Box className="lm-workspace-empty-icon"><Icon name="package" /></Box>
      <Stack align="center" gap="xs">
        <Title order={2}>{props.title}</Title>
        <Text>{props.detail}</Text>
      </Stack>
    </Stack>
  </Box>;
}

export function StartupScreen({ props, theme }: { props: StartupProps; theme: ReturnType<typeof resolveTheme> }) {
  return <Box component="section" className="lm-startup" style={{
    ...theme.contentStyle,
    paddingInline: `min(${theme.startup.padding}, 6cqi)`,
    paddingBlock: `min(${theme.startup.padding}, 6cqb)`,
    gap: `min(${theme.startup.gap}, 5cqb)`,
  }}>
    <Box component="pre" role="img" aria-label={props.logoLabel} style={{ fontSize: `min(${theme.startup.logoFontSize}, 2cqi)`, lineHeight: theme.startup.logoLineHeight }}>{props.art}</Box>
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
    <CardRow ref={toggle} className="ln-vault-toggle" label={props.text[mode]!} disabled={props.busy} aria-expanded={expanded} aria-controls={id}
      icon={<Icon name={mode === "create" ? "create" : "browse"} />}
      onClick={event => { props.onMode(mode); if (!expanded && event.detail === 0) browse.current?.focus({ preventScroll: true }); }} />
    <Box className="ln-vault-disclosure" aria-hidden={!expanded}>
      <Box className="ln-vault-disclosure-body">
        <Paper component="form" className="ln-vault-form" ref={form} id={id} inert={!expanded}
          onKeyDown={event => {
            if (event.key === "Escape" && !event.nativeEvent.isComposing && !event.defaultPrevented && expanded && !props.busy) {
              event.preventDefault(); event.stopPropagation(); toggle.current?.focus({ preventScroll: true }); props.onMode(mode);
            }
          }} onSubmit={event => { event.preventDefault(); if (expanded && !props.busy && props.canContinue) props.onNext(); }}>
          <Stack gap="sm">
            <Input.Wrapper label={props.text.folder} id={`${id}-folder`}>
              <Input component="button" type="button" pointer ref={browse} id={`${id}-folder`}
                classNames={{ input: "lm-input ln-vault-folder" }}
                aria-label={props.text.browse} aria-describedby={`${id}-path`}
                title={expanded && props.folder ? props.folder : props.text.browse}
                disabled={props.busy || !expanded} onClick={props.onBrowse}
                rightSection={<Icon name="browse" />} rightSectionPointerEvents="none">
                <span id={`${id}-path`} className="ln-vault-path" data-placeholder={!props.folder || !expanded || undefined}>{expanded && props.folder ? props.folder : props.text.folderPlaceholder}</span>
              </Input>
            </Input.Wrapper>
            <TextInput ref={name} hidden={mode !== "create"} label={props.text.name} value={props.name} maxLength={200} required={mode === "create"} autoComplete="off" spellCheck={false}
              disabled={props.busy || !expanded} onChange={event => props.onName(event.currentTarget.value)} />
            <Text role="alert" hidden={!expanded || !props.error}>{expanded ? props.error : ""}</Text>
            <ActionButton ref={next} type="submit" accent className="ln-vault-next" rightSection={<Icon name="next" />} disabled={props.busy || !props.canContinue || !expanded}>{props.text.next}</ActionButton>
          </Stack>
        </Paper>
      </Box>
    </Box>
  </Box>;
}

function ServerForm({ props }: { props: SelectorProps }) {
  const id = useId(); const toggle = useRef<HTMLButtonElement>(null); const target = useRef<HTMLDivElement>(null);
  const expanded = props.serverExpanded === true;
  useLayoutEffect(() => { props.onServerTarget?.(target.current); return () => props.onServerTarget?.(null); }, [props.onServerTarget]);
  useLayoutEffect(() => {
    if (!expanded && target.current?.contains(target.current.ownerDocument.activeElement)) toggle.current?.focus({ preventScroll: true });
  }, [expanded]);
  return <Box className="ln-vault-action" data-open={String(expanded)}>
    <CardRow ref={toggle} className="ln-vault-toggle" label={props.text.server!} icon={<Icon name="server-connected" />} disabled={props.busy}
      aria-expanded={expanded} aria-controls={id} onClick={props.onServer} />
    <Box className="ln-vault-disclosure" aria-hidden={!expanded} inert={!expanded}>
      <Box className="ln-vault-disclosure-body">
        <Paper className="ln-vault-form" id={id} onKeyDown={event => {
          if (event.key === "Escape" && !event.nativeEvent.isComposing && !event.defaultPrevented && expanded && !props.busy) { event.preventDefault(); toggle.current?.focus({ preventScroll: true }); props.onServer?.(); }
        }}><Box ref={target} /></Paper>
      </Box>
    </Box>
  </Box>;
}

function displayLocation(label: string): string {
  if (/^\\\\\?\\UNC\\/i.test(label)) return "\\\\" + label.slice(8);
  return /^\\\\\?\\[a-z]:\\/i.test(label) ? label.slice(4) : label;
}

export function VaultSelector({ props, theme }: { props: SelectorProps; theme: ReturnType<typeof resolveTheme> }) {
  return <Box component="section" className="ln-vault" style={theme.contentStyle} aria-busy={props.busy}>
    <Box className="ln-vault-home">
      <Box component="header" className="ln-vault-brand">
        <Box component="pre" role="img" aria-label={props.text.logo}>{props.art}</Box>
      </Box>
      <Box className="ln-vault-columns">
        <Box className="ln-vault-main">
          {props.text.actions && <Title order={2}>{props.text.actions}</Title>}
          <Text className="ln-vault-status" role="status" aria-live="polite">{props.status}</Text>
          <Stack className="ln-vault-actions" gap="xs">
            <ActionForm mode="create" props={props} /><ActionForm mode="select" props={props} />
            {props.onServer && <ServerForm props={props} />}
          </Stack>
          <Text role="alert" hidden={props.mode !== null || !props.error}>{props.mode === null ? props.error : ""}</Text>
        </Box>
        <Paper component="aside" className="ln-vault-recents" aria-label={props.text.recent}>
          <Title order={2}>{props.text.recent}</Title>
          <Stack component="ul" gap="xs">
            {props.entries.map(entry => <Box component="li" key={entry.reference}>
              <CardRow className="lm-recent" label={entry.name} detail={displayLocation(entry.label)} icon={<Icon name="folder" />}
                disabled={props.busy} data-reference={entry.reference} aria-current={entry.reference === props.activeReference ? "true" : undefined}
                onClick={() => props.onRecent(entry.reference)} />
            </Box>)}
          </Stack>
          <Text hidden={props.entries.length > 0 || !!props.historyError}>{props.text.empty}</Text>
          <Text role="status" hidden={!props.historyError}>{props.historyError}</Text>
          <ActionButton hidden={!props.historyError} disabled={props.busy} onClick={props.onRetry}>{props.text.retry}</ActionButton>
        </Paper>
      </Box>
    </Box>
  </Box>;
}
