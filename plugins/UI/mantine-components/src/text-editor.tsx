import { useLayoutEffect, useRef, useState } from "react";
import { Box, Button, Group, Text, Textarea, TextInput } from "@mantine/core";
import type { KeyboardEvent } from "react";
import type { ComponentProps } from "@lunaris/components";
import type { resolveTheme } from "./theme.js";
import { EditorWidthHandles } from "./editor-width-handles.js";
import type { WidthPhase } from "./editor-width-handles.js";

interface EditorProps {
  readonly onFooterTarget?: (target: HTMLElement | null) => void;
  readonly recoveryLabel?: string;
  readonly recoveryCandidates?: readonly { readonly id: string; readonly label: string }[];
  readonly onRecovery?: (id: string) => void;
  readonly canRetrySave?: boolean;
  readonly copyBufferLabel?: string;
  readonly onCopyBuffer?: () => void;
  readonly saveCopyLabel?: string;
  readonly saveCopyNameLabel?: string;
  readonly saveCopyNameError?: string;
  readonly onSaveCopy?: (name?: string) => void;
  readonly recoveryError?: string;
  readonly recoveryStatus?: string;
  readonly documentKey: string;
  readonly name: string;
  readonly title: string;
  readonly titleLabel: string;
  readonly compact?: boolean;
  readonly contentFontSize?: number;
  readonly contentWidth?: number | "full";
  readonly resizeWidthLabel?: string;
  readonly canResizeWidth?: boolean;
  readonly onContentWidthChange?: (width: number, phase: WidthPhase) => void;
  readonly renameError?: string;
  readonly canRename: boolean;
  readonly onRename: (name: string) => Promise<boolean>;
  readonly onTitleFocused?: () => void;
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
  readonly onTarget: (target: HTMLElement | null, viewport?: HTMLElement) => void;
}
export function textEditorProps(value: ComponentProps): EditorProps {
  for (const key of ["documentKey", "name", "title", "titleLabel", "status", "error", "saveLabel", "retryLabel", "reloadLabel", "discardLabel", "cancelLabel"])
    if (typeof value[key] !== "string") throw new TypeError(`Text editor requires ${key}.`);
  for (const key of ["ready", "dirty", "busy", "canRename"]) if (typeof value[key] !== "boolean") throw new TypeError(`Text editor requires ${key}.`);
  for (const key of ["onSave", "onReload", "onTarget", "onRename"]) if (typeof value[key] !== "function") throw new TypeError(`Text editor requires ${key}.`);
  if (value.compact !== undefined && typeof value.compact !== "boolean") throw new TypeError("Invalid editor presentation.");
  if (value.commandError !== undefined && typeof value.commandError !== "string") throw new TypeError("Invalid editor command error.");
  if (value.renameError !== undefined && typeof value.renameError !== "string") throw new TypeError("Invalid editor rename error.");
  if (value.onTitleFocused !== undefined && typeof value.onTitleFocused !== "function") throw new TypeError("Invalid editor title focus request.");
  if (value.contentFontSize !== undefined && (typeof value.contentFontSize !== "number" || !Number.isFinite(value.contentFontSize) || value.contentFontSize <= 0)) throw new TypeError("Invalid editor content font size.");
  if (value.contentWidth !== undefined && value.contentWidth !== "full" && (typeof value.contentWidth !== "number" || !Number.isFinite(value.contentWidth) || value.contentWidth <= 0)) throw new TypeError("Invalid editor content width.");
  if (value.onContentWidthChange !== undefined && (typeof value.onContentWidthChange !== "function" || typeof value.resizeWidthLabel !== "string" || !value.resizeWidthLabel.trim() || typeof value.canResizeWidth !== "boolean")) throw new TypeError("Invalid editor width controls.");
  if (value.recoveryCandidates !== undefined && (!Array.isArray(value.recoveryCandidates) || value.recoveryCandidates.some(item => !item || typeof item.id !== "string" || typeof item.label !== "string") || typeof value.recoveryLabel !== "string" || typeof value.onRecovery !== "function")) throw new TypeError("Invalid recovery choices.");
  for (const key of ["copyBufferLabel", "saveCopyLabel", "saveCopyNameLabel", "saveCopyNameError", "recoveryError", "recoveryStatus"])
    if (value[key] !== undefined && typeof value[key] !== "string") throw new TypeError(`Invalid editor ${key}.`);
  if ((value.canRetrySave !== undefined && typeof value.canRetrySave !== "boolean") ||
      (value.copyBufferLabel !== undefined && typeof value.onCopyBuffer !== "function") ||
      ((value.saveCopyLabel !== undefined || value.saveCopyNameLabel !== undefined) && typeof value.onSaveCopy !== "function"))
    throw new TypeError("Invalid editor recovery actions.");
  return value as unknown as EditorProps;
}
export function TextEditor({ props, theme }: { props: EditorProps; theme: ReturnType<typeof resolveTheme> }) {
  const target = useRef<HTMLDivElement>(null); const [confirm, setConfirm] = useState(false);
  const [copyName, setCopyName] = useState("");
  const saveCopyButton = useRef<HTMLButtonElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const titleInput = useRef<HTMLTextAreaElement>(null);
  const [title, setTitle] = useState(props.title);
  const [pointerFocus, setPointerFocus] = useState(false);
  const committing = useRef<object | null>(null);
  const cancelTitleCommit = useRef(false);
  const currentTitle = useRef(props.title);
  currentTitle.current = props.title;
  const footer = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { props.onFooterTarget?.(footer.current); return () => props.onFooterTarget?.(null); }, [props.onFooterTarget]);
  const publish = props.onTarget;
  useLayoutEffect(() => { publish(target.current, container.current ?? undefined); return () => publish(null); }, [publish]);
  useLayoutEffect(() => { committing.current = null; cancelTitleCommit.current = false; setConfirm(false); setTitle(props.title); }, [props.documentKey]);
  const namingCopy = props.saveCopyNameLabel !== undefined;
  useLayoutEffect(() => { setCopyName(""); }, [props.documentKey, namingCopy]);
  function cancelCopyName(): void { props.onSaveCopy?.(); saveCopyButton.current?.focus(); }
  // Reflect external renames while the field is not being actively committed.
  useLayoutEffect(() => { if (!committing.current) setTitle(props.title); }, [props.title]);
  useLayoutEffect(() => {
    const input = titleInput.current;
    if (!props.onTitleFocused || !props.canRename || !input || title !== props.title) return;
    input.focus({ preventScroll: true });
    if (input.ownerDocument.activeElement !== input) return;
    input.select();
    props.onTitleFocused();
  }, [props.onTitleFocused, props.canRename, props.ready, props.title, title]);
  function commitTitle(): void {
    if (cancelTitleCommit.current) { cancelTitleCommit.current = false; return; }
    if (committing.current) return;
    const next = title.trim();
    if (!props.canRename || next === props.title || !next || next.includes("/")) { setTitle(props.title); return; }
    const operation = {};
    committing.current = operation;
    void props.onRename(next).then(ok => {
      if (!ok && committing.current === operation) setTitle(currentTitle.current);
    }).finally(() => { if (committing.current === operation) committing.current = null; });
  }
  function onTitleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); }
    else if (event.key === "Escape") {
      event.preventDefault(); event.stopPropagation(); cancelTitleCommit.current = true;
      setTitle(props.title); event.currentTarget.blur();
    }
  }
  const columnStyle = { maxWidth: props.contentWidth === "full" ? "none" : props.contentWidth ?? 698 };
  const hasFeedback = !props.ready || !!(props.recoveryCandidates?.length || props.commandError || props.error || namingCopy || props.recoveryError || props.recoveryStatus);
  return <Box ref={container} className="lm-text-editor" data-compact={props.compact} data-workspace-scroll style={theme.contentStyle}>
    {props.ready && props.onContentWidthChange && !props.compact && <EditorWidthHandles key={props.documentKey} container={container}
      width={props.contentWidth ?? 698} label={props.resizeWidthLabel!} disabled={!props.canResizeWidth} onChange={props.onContentWidthChange} />}
    {props.ready && <Box component="header" className="lm-editor-heading lm-editor-column" style={columnStyle}>
      <Textarea ref={titleInput} className="lm-editor-title" aria-label={props.titleLabel} value={title} title={props.title}
        autosize minRows={1} resize="none" aria-multiline="false"
        error={props.renameError || undefined} errorProps={{ role: "alert" }} classNames={{ error: "lm-editor-error" }}
        style={{ fontSize: props.contentFontSize }}
        variant="unstyled" readOnly={!props.canRename} tabIndex={props.canRename ? 0 : -1}
        spellCheck={false} placeholder={props.titleLabel} data-pointer-focus={pointerFocus || undefined}
        onPointerDown={() => setPointerFocus(true)} onPointerCancel={() => setPointerFocus(false)}
        onPointerUp={event => { if (event.currentTarget.ownerDocument.activeElement !== event.currentTarget) setPointerFocus(false); }}
        onChange={event => setTitle(event.currentTarget.value.replace(/[\r\n]+/g, ""))}
        onBlur={() => { setPointerFocus(false); commitTitle(); }} onKeyDown={onTitleKeyDown} />
    </Box>}
    {hasFeedback && <Box className="lm-editor-feedback lm-editor-column" style={columnStyle}>
      {!!props.recoveryCandidates?.length && <Box className="lm-editor-draft-choices" role="group" aria-label={props.recoveryLabel}>
        <Text size="sm">{props.recoveryLabel}</Text>
        {props.recoveryCandidates.map(item => <Button key={item.id} size="compact-xs" variant="subtle" styles={{ root: { height: "auto", maxWidth: "100%" }, label: { whiteSpace: "pre-wrap", overflowWrap: "anywhere" } }} disabled={props.busy} onClick={() => props.onRecovery?.(item.id)}>{item.label}</Button>)}
      </Box>}
      {props.commandError && <Text size="sm" role="alert" className="lm-editor-error">{props.commandError}</Text>}
      {!props.ready && <Text className="lm-editor-placeholder" size="sm" c="dimmed" role="status">{props.status || props.name}</Text>}
      {props.error && <Group className="lm-editor-error" gap="xs">
        <Text size="sm" role="alert">{props.error}</Text>
        {props.ready && props.dirty && props.canRetrySave !== false && <Button size="compact-xs" onClick={props.onSave} disabled={props.busy}>{props.retryLabel}</Button>}
        {props.copyBufferLabel && <Button size="compact-xs" variant="light" disabled={props.busy} onClick={props.onCopyBuffer}>{props.copyBufferLabel}</Button>}
        {props.saveCopyLabel && <Button ref={saveCopyButton} size="compact-xs" variant="light" disabled={props.busy}
          aria-expanded={namingCopy || undefined} onClick={() => props.onSaveCopy?.()}>{props.saveCopyLabel}</Button>}
        <Button size="compact-xs" {...(props.copyBufferLabel ? { variant: "subtle" } : {})} disabled={props.busy} onClick={() => {
          if (props.dirty) setConfirm(true); else props.onReload();
        }}>{props.reloadLabel}</Button>
        {confirm && <Group gap="xs">
          <Button size="compact-xs" disabled={props.busy} onClick={() => { setConfirm(false); props.onReload(); }}>{props.discardLabel}</Button>
          <Button size="compact-xs" onClick={() => setConfirm(false)}>{props.cancelLabel}</Button>
        </Group>}
      </Group>}
      {namingCopy && <Group component="form" gap="xs" align="flex-start" onSubmit={event => {
        event.preventDefault(); if (!props.busy && copyName.trim()) props.onSaveCopy?.(copyName);
      }} onKeyDown={event => {
        if (event.key !== "Escape" || event.nativeEvent.isComposing || props.busy) return;
        event.preventDefault(); event.stopPropagation(); cancelCopyName();
      }}>
        <TextInput size="xs" label={props.saveCopyNameLabel} value={copyName} error={props.saveCopyNameError}
          errorProps={{ role: "alert" }} disabled={props.busy} onChange={event => setCopyName(event.currentTarget.value)} />
        <Button type="submit" size="compact-xs" disabled={props.busy || !copyName.trim()}>{props.saveLabel}</Button>
        <Button type="button" size="compact-xs" variant="subtle" disabled={props.busy} onClick={cancelCopyName}>{props.cancelLabel}</Button>
      </Group>}
      {props.recoveryError && <Text size="sm" role="alert" className="lm-editor-error">{props.recoveryError}</Text>}
      {props.recoveryStatus && <Text size="sm" role="status" c="dimmed">{props.recoveryStatus}</Text>}
    </Box>}
    <Box ref={target} className="lm-editor-target" hidden={!props.ready} aria-busy={props.busy} />
    <Box ref={footer} className="lm-editor-footer lm-editor-column" hidden={!props.ready} style={columnStyle} />
  </Box>;
}
