import { useLayoutEffect, useRef, useState } from "react";
import { Box, Button, Group, Text } from "@mantine/core";
import type { ComponentProps } from "@lunaris/components";
import type { resolveTheme } from "./theme.js";

interface EditorProps {
  readonly preview?: boolean;
  readonly previewLabel?: string;
  readonly sourceLabel?: string;
  readonly onPreviewChange?: () => void;
  readonly documentKey: string;
  readonly name: string;
  readonly status: string;
  readonly error: string;
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
  for (const key of ["documentKey", "name", "status", "error", "saveLabel", "retryLabel", "reloadLabel", "discardLabel", "cancelLabel"])
    if (typeof value[key] !== "string") throw new TypeError(`Text editor requires ${key}.`);
  for (const key of ["ready", "dirty", "busy"]) if (typeof value[key] !== "boolean") throw new TypeError(`Text editor requires ${key}.`);
  for (const key of ["onSave", "onReload", "onTarget"]) if (typeof value[key] !== "function") throw new TypeError(`Text editor requires ${key}.`);
  if (value.onPreviewChange !== undefined && (typeof value.onPreviewChange !== "function" || typeof value.preview !== "boolean" || typeof value.previewLabel !== "string" || typeof value.sourceLabel !== "string"))
    throw new TypeError("Text editor mode requires preview, labels and onPreviewChange.");
  return value as unknown as EditorProps;
}
export function TextEditor({ props, theme }: { props: EditorProps; theme: ReturnType<typeof resolveTheme> }) {
  const target = useRef<HTMLDivElement>(null); const [confirm, setConfirm] = useState(false);
  const publish = props.onTarget;
  useLayoutEffect(() => { publish(target.current); return () => publish(null); }, [publish]);
  useLayoutEffect(() => { setConfirm(false); }, [props.documentKey]);
  return <Box className="lm-text-editor" style={theme.contentStyle}>
    <Group className="lm-editor-header" gap="xs" wrap="nowrap">
      <Text className="lm-editor-name" size="sm" title={props.name}>{props.name}</Text>
      <Text size="xs" c="dimmed" role="status" aria-live="polite">{props.status}</Text>
      {props.ready && props.onPreviewChange && <Button size="compact-xs" variant="subtle" aria-pressed={props.preview} onClick={props.onPreviewChange}>{props.preview ? props.previewLabel : props.sourceLabel}</Button>}
      {props.ready && <Button size="compact-xs" onClick={props.onSave} disabled={props.busy || !props.dirty}>{props.saveLabel}</Button>}
    </Group>
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
