import { useLayoutEffect, useRef, useState } from "react";
import { Box, Button, Group, Text } from "@mantine/core";
import type { ComponentProps } from "@lunaris/components";
import type { resolveTheme } from "./theme.js";

interface EditorProps {
  readonly documentKey: string;
  readonly name: string;
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
  for (const key of ["documentKey", "name", "status", "error", "saveLabel", "retryLabel", "reloadLabel", "discardLabel", "cancelLabel"])
    if (typeof value[key] !== "string") throw new TypeError(`Text editor requires ${key}.`);
  for (const key of ["ready", "dirty", "busy"]) if (typeof value[key] !== "boolean") throw new TypeError(`Text editor requires ${key}.`);
  for (const key of ["onSave", "onReload", "onTarget"]) if (typeof value[key] !== "function") throw new TypeError(`Text editor requires ${key}.`);
  if (value.commandError !== undefined && typeof value.commandError !== "string") throw new TypeError("Invalid editor command error.");
  return value as unknown as EditorProps;
}
export function TextEditor({ props, theme }: { props: EditorProps; theme: ReturnType<typeof resolveTheme> }) {
  const target = useRef<HTMLDivElement>(null); const [confirm, setConfirm] = useState(false);
  const publish = props.onTarget;
  useLayoutEffect(() => { publish(target.current); return () => publish(null); }, [publish]);
  useLayoutEffect(() => { setConfirm(false); }, [props.documentKey]);
  return <Box className="lm-text-editor" style={theme.contentStyle}>
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
