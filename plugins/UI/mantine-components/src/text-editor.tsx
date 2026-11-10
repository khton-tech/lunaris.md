import { useLayoutEffect, useRef, useState } from "react";
import { Box, Button, Group, Text, TextInput } from "@mantine/core";
import type { KeyboardEvent } from "react";
import type { ComponentProps } from "@lunaris/components";
import type { resolveTheme } from "./theme.js";

interface EditorProps {
  readonly recoveryLabel?: string;
  readonly recoveryCandidates?: readonly { readonly id: string; readonly label: string }[];
  readonly onRecovery?: (id: string) => void;
  readonly documentKey: string;
  readonly name: string;
  readonly title: string;
  readonly titleLabel: string;
  readonly renameError?: string;
  readonly canRename: boolean;
  readonly onRename: (name: string) => Promise<boolean>;
  readonly status: string;
  readonly error: string;
  readonly commandError?: string;
  readonly ready: boolean;
  readonly dirty: boolean;
  readonly busy: boolean;
  readonly saveLabel: string;
  readonly retryLabel: string;
  readonly reloadLabel: string;
  readonly discardLabel: string;
  readonly cancelLabel: string;
  readonly onSave: () => void;
  readonly onReload: () => void;
  readonly onTarget: (target: HTMLElement | null) => void;
}
export function textEditorProps(value: ComponentProps): EditorProps {
  for (const key of ["documentKey", "name", "title", "titleLabel", "status", "error", "saveLabel", "retryLabel", "reloadLabel", "discardLabel", "cancelLabel"])
    if (typeof value[key] !== "string") throw new TypeError(`Text editor requires ${key}.`);
  for (const key of ["ready", "dirty", "busy", "canRename"]) if (typeof value[key] !== "boolean") throw new TypeError(`Text editor requires ${key}.`);
  for (const key of ["onSave", "onReload", "onTarget", "onRename"]) if (typeof value[key] !== "function") throw new TypeError(`Text editor requires ${key}.`);
  if (value.commandError !== undefined && typeof value.commandError !== "string") throw new TypeError("Invalid editor command error.");
  if (value.renameError !== undefined && typeof value.renameError !== "string") throw new TypeError("Invalid editor rename error.");
  if (value.recoveryCandidates !== undefined && (!Array.isArray(value.recoveryCandidates) || value.recoveryCandidates.some(item => !item || typeof item.id !== "string" || typeof item.label !== "string") || typeof value.recoveryLabel !== "string" || typeof value.onRecovery !== "function")) throw new TypeError("Invalid recovery choices.");
  return value as unknown as EditorProps;
}
export function TextEditor({ props, theme }: { props: EditorProps; theme: ReturnType<typeof resolveTheme> }) {
  const target = useRef<HTMLDivElement>(null); const [confirm, setConfirm] = useState(false);
  const [title, setTitle] = useState(props.title);
  const committing = useRef(false);
  const publish = props.onTarget;
  useLayoutEffect(() => { publish(target.current); return () => publish(null); }, [publish]);
  useLayoutEffect(() => { setConfirm(false); setTitle(props.title); }, [props.documentKey]);
  // Reflect external renames while the field is not being actively committed.
  useLayoutEffect(() => { if (!committing.current) setTitle(props.title); }, [props.title]);
  function commitTitle(): void {
    if (committing.current) return;
    const next = title.trim();
    if (!props.canRename || next === props.title || !next || next.includes("/")) { setTitle(props.title); return; }
    committing.current = true;
    void props.onRename(next).then(ok => { if (!ok) setTitle(props.title); }).finally(() => { committing.current = false; });
  }
  function onTitleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); }
    else if (event.key === "Escape") { event.preventDefault(); setTitle(props.title); event.currentTarget.blur(); }
  }
  return <Box className="lm-text-editor" style={theme.contentStyle}>
    {props.ready && <Box className="lm-editor-heading">
      <TextInput className="lm-editor-title" aria-label={props.titleLabel} value={title}
        variant="unstyled" disabled={!props.canRename} spellCheck={false} placeholder={props.titleLabel}
        onChange={event => setTitle(event.currentTarget.value.replace(/[\r\n]+/g, ""))}
        onBlur={commitTitle} onKeyDown={onTitleKeyDown} />
      {props.renameError && <Text size="sm" role="alert" className="lm-editor-error">{props.renameError}</Text>}
    </Box>}
    {!!props.recoveryCandidates?.length && <Box role="group" aria-label={props.recoveryLabel}>
      <Text size="sm">{props.recoveryLabel}</Text>
      {props.recoveryCandidates.map(item => <Button key={item.id} size="compact-xs" variant="subtle" styles={{ root: { height: "auto", maxWidth: "100%" }, label: { whiteSpace: "pre-wrap", overflowWrap: "anywhere" } }} disabled={props.busy} onClick={() => props.onRecovery?.(item.id)}>{item.label}</Button>)}
    </Box>}
    {props.commandError && <Text size="sm" role="alert" className="lm-editor-error">{props.commandError}</Text>}
    {!props.ready && <Text className="lm-editor-placeholder" size="sm" c="dimmed" role="status">{props.status || props.name}</Text>}
    {props.error && <Group className="lm-editor-error" gap="xs">
      <Text size="sm" role="alert">{props.error}</Text>
      {props.ready && props.dirty && <Button size="compact-xs" onClick={props.onSave} disabled={props.busy}>{props.retryLabel}</Button>}
      <Button size="compact-xs" disabled={props.busy} onClick={() => {
        if (props.dirty) setConfirm(true); else props.onReload();
      }}>{props.reloadLabel}</Button>
      {confirm && <Group gap="xs">
        <Button size="compact-xs" disabled={props.busy} onClick={() => { setConfirm(false); props.onReload(); }}>{props.discardLabel}</Button>
        <Button size="compact-xs" onClick={() => setConfirm(false)}>{props.cancelLabel}</Button>
      </Group>}
    </Group>}
    <Box ref={target} className="lm-editor-target" hidden={!props.ready} aria-busy={props.busy} />
  </Box>;
}
