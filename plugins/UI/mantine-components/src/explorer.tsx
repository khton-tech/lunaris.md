import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { ActionIcon, Box, Button, Group, Menu, Paper, Stack, Text, TextInput } from "@mantine/core";
import { Tree } from "react-arborist";
import type { CursorProps, DragPreviewProps, NodeRendererProps, RowRendererProps, TreeApi } from "react-arborist";
import type { ComponentProps } from "@lunaris/components";
import type { resolveTheme } from "./theme.js";
import { Icon } from "./icons.js";

// Absolute paths never occur in the Vault-relative controller tree.
const ROOT_ID = "/";
interface Entry { id: string; name: string; kind: string; children?: Entry[] }
type Form = { kind: "file" | "folder"; parent: string } | { kind: "delete"; paths: string[] };
interface Draft { form: Form | null; name: string }
interface ExplorerProps {
  vaultId: string; data: Entry[]; expanded: string[]; selection: string[]; busy: boolean; loading: boolean; error: string; degraded: string; canPaste: boolean;
  workspace?: { vaultId: string; vaultName?: string }; text: Record<string, string>;
  onToggle(path: string, open: boolean): void; onSelection(paths: string[]): void; onBuffer(paths: string[], cut: boolean): void;
  onCreate(parent: string, name: string, directory: boolean): Promise<boolean>; onRename(path: string, name: string): Promise<boolean>;
  onMove(paths: string[], destination: string): Promise<boolean>; onPaste(destination: string): Promise<boolean>;
  onRemove(paths: string[]): Promise<boolean>; onRefresh(): void;
  initialDraft: Draft; onDraft(draft: Draft): void;
}
export function explorerProps(value: ComponentProps): ExplorerProps {
  const validEntries = (items: unknown, ids = new Set<string>()): boolean => Array.isArray(items) && items.every(item => {
    if (!item || typeof item.id !== "string" || !item.id || ids.has(item.id) || typeof item.name !== "string" || !["file", "directory", "symlink", "other"].includes(item.kind)) return false;
    ids.add(item.id);
    return item.kind === "directory" ? validEntries(item.children, ids) : item.children === undefined;
  });
  if (!validEntries(value.data) || !["vaultId", "error", "degraded"].every(key => typeof value[key] === "string") ||
    !["busy", "loading", "canPaste"].every(key => typeof value[key] === "boolean") ||
    !["expanded", "selection"].every(key => Array.isArray(value[key]) && (value[key] as unknown[]).every(item => typeof item === "string")) ||
    !value.text || typeof value.text !== "object" || Object.values(value.text).some(item => typeof item !== "string") ||
    !["onToggle", "onSelection", "onBuffer", "onCreate", "onRename", "onMove", "onPaste", "onRemove", "onRefresh", "onDraft"].every(key => typeof value[key] === "function")) throw new TypeError("Invalid file explorer props.");
  const draft = value.initialDraft as Draft | undefined;
  if (!draft || typeof draft.name !== "string" || (draft.form !== null && (!draft.form ||
    (draft.form.kind === "delete" ? !Array.isArray(draft.form.paths) || draft.form.paths.some(path => typeof path !== "string") :
      !["file", "folder"].includes(draft.form.kind) || typeof draft.form.parent !== "string")))) throw new TypeError("Invalid explorer draft.");
  return value as unknown as ExplorerProps;
}
const ExplorerContext = createContext<{ props: ExplorerProps; surface(): HTMLElement | null; context(path: string): void } | null>(null);
function ExplorerRow({ node, attrs, innerRef, children }: RowRendererProps<Entry>) {
  return <div {...attrs} ref={innerRef} style={{ ...attrs.style, minWidth: 0 }} onFocus={event => event.stopPropagation()}
    onClick={event => {
      // A plain click selects without changing the geometry under a drag source.
      if (event.ctrlKey || event.metaKey || event.shiftKey) node.handleClick(event);
      else node.select();
    }} onDoubleClick={event => { if (!event.ctrlKey && !event.metaKey && !event.shiftKey) node.activate(); }}>{children}</div>;
}
function ExplorerCursor({ top, left, indent }: CursorProps) {
  return <Box className="lm-explorer-cursor" style={{ top, left, right: indent }} />;
}
function ExplorerDragPreview({ isDragging, mouse, dragIds }: DragPreviewProps) {
  const { props, surface } = useContext(ExplorerContext)!;
  const element = surface();
  if (!isDragging || !mouse || !element) return null;
  const bounds = element.getBoundingClientRect();
  const label = dragIds.length === 1 ? dragIds[0]!.split("/").at(-1) : String(dragIds.length);
  return <Box className="lm-explorer-drag-preview" style={{ left: Math.max(0, Math.min(mouse.x - bounds.left, bounds.width / 2)), top: Math.max(0, Math.min(mouse.y - bounds.top, bounds.height - 32)) }} aria-hidden="true">
    <Icon name="files" /><Text component="span">{label || props.text.title}</Text>
  </Box>;
}
function RenameInput({ node }: NodeRendererProps<Entry>) {
  const { props } = useContext(ExplorerContext)!; const input = useRef<HTMLInputElement>(null); const submitted = useRef(false);
  useLayoutEffect(() => { input.current?.focus(); input.current?.select(); }, []);
  return <TextInput ref={input} className="lm-explorer-rename" aria-label={props.text.rename} defaultValue={node.data.name} disabled={props.busy}
    onClick={event => event.stopPropagation()} onBlur={() => { if (!submitted.current) node.reset(); }}
    onKeyDown={event => {
      event.stopPropagation();
      if (event.key === "Escape") { event.preventDefault(); node.reset(); }
      if (event.key === "Enter" && !props.busy && !submitted.current) { event.preventDefault(); submitted.current = true; node.submit(event.currentTarget.value); }
    }} />;
}
function ExplorerNode(payload: NodeRendererProps<Entry>) {
  const { node, style, dragHandle } = payload; const { props, context } = useContext(ExplorerContext)!;
  return <Box ref={dragHandle} style={style} className="lm-explorer-node" data-selected={node.isSelected || undefined} data-drop={node.willReceiveDrop || undefined}
    title={node.id === ROOT_ID ? node.data.name : node.id} onContextMenu={event => { event.preventDefault(); event.stopPropagation(); if (node.id !== ROOT_ID) context(node.id); }}>
    {node.isInternal ? <ActionIcon className="lm-explorer-disclosure" variant="subtle" size="xs" tabIndex={-1} aria-label={node.data.name} aria-expanded={node.isOpen}
      disabled={props.busy} onClick={event => { event.stopPropagation(); node.toggle(); }}><span data-open={node.isOpen || undefined}><Icon name="expand" /></span></ActionIcon>
      : <span className="lm-explorer-spacer" />}
    <Icon name={node.isInternal ? node.isOpen ? "browse" : "folder" : "file"} />
    {node.isEditing ? <RenameInput {...payload} /> : <Text component="span" className="lm-explorer-filename">{node.data.name}</Text>}
  </Box>;
}
export function FileExplorer({ props, theme }: { props: ExplorerProps; theme: ReturnType<typeof resolveTheme> }) {
  // Workspace can mount the new Vault before Sidebar receives fresh controller
  // props. Never show the previous Vault's tree or callbacks in that interval.
  if (props.workspace && props.workspace.vaultId !== props.vaultId) return <Box className="lm-explorer" style={{ ...theme.style, backgroundColor: "transparent" }}><Text role="status" className="lm-explorer-message">{props.text.loading}</Text></Box>;
  return <ExplorerView key={props.vaultId} props={props} theme={theme} />;
}
function ExplorerView({ props, theme }: { props: ExplorerProps; theme: ReturnType<typeof resolveTheme> }) {
  const host = useRef<HTMLDivElement>(null); const tree = useRef<TreeApi<Entry>>(null); const alive = useRef(true);
  const synchronizing = useRef(false);
  const initializing = useRef(true);
  const [size, setSize] = useState({ height: 1, row: 28 }); const [menu, setMenu] = useState(false);
  const [form, setForm] = useState<Form | null>(() => props.initialDraft.form); const [name, setName] = useState(() => props.initialDraft.name);
  const field = useRef<HTMLInputElement>(null); const confirm = useRef<HTMLButtonElement>(null);
  const t = props.text;
  const data = useMemo<Entry[]>(() => [{ id: ROOT_ID, name: props.workspace?.vaultName || t.root!, kind: "directory", children: props.data }], [props.data, props.workspace?.vaultName, t.root]);
  useLayoutEffect(() => { props.onDraft({ form, name }); }, [form, name, props.onDraft]);
  useLayoutEffect(() => {
    alive.current = true;
    const element = host.current!;
    const measure = () => {
      const css = element.ownerDocument.defaultView!.getComputedStyle(element);
      const height = Math.max(1, element.getBoundingClientRect().height);
      const row = Math.max(24, Math.ceil((parseFloat(css.fontSize) || 14) * 2));
      setSize(previous => previous.height === height && previous.row === row ? previous : { height, row });
    };
    const observer = new ResizeObserver(measure); observer.observe(element); measure();
    return () => { alive.current = false; observer.disconnect(); };
  }, [theme.style.fontSize]);
  useLayoutEffect(() => {
    const api = tree.current; if (!api) return;
    synchronizing.current = true;
    try {
      for (const path of props.expanded) if (api.get(path) && !api.isOpen(path)) api.open(path);
      if ([...api.selectedIds].sort().join("\n") !== [...props.selection].sort().join("\n")) api.setSelection({ ids: props.selection, anchor: props.selection[0] ?? null, mostRecent: props.selection.at(-1) ?? null });
    } finally { synchronizing.current = false; }
  }, [props.selection, props.expanded, props.data]);
  useEffect(() => {
    // Arborist's mount effect clears its uncontrolled selection. Restore the
    // controller snapshot afterwards without treating that reset as user input.
    synchronizing.current = true;
    try { tree.current?.setSelection({ ids: props.selection, anchor: props.selection[0] ?? null, mostRecent: props.selection.at(-1) ?? null }); }
    finally { synchronizing.current = false; initializing.current = false; }
  }, []);
  function selected(): string[] { return (tree.current ? [...tree.current.selectedIds] : props.selection).filter(path => path !== ROOT_ID); }
  function destination(): string {
    const api = tree.current; const paths = selected(); const node = paths.length === 1 ? api?.get(paths[0]!) : null;
    const path = node?.isInternal ? node.id : node?.parent?.isRoot ? "" : node?.parent?.id ?? "";
    return path === ROOT_ID ? "" : path;
  }
  function focusTree(): void { host.current?.querySelector<HTMLElement>("[role=tree]")?.focus({ preventScroll: true }); }
  function closeForm(): void { setForm(null); focusTree(); }
  function command(command: string): void {
    setMenu(false); if (props.busy) return;
    const paths = selected();
    if (command === "newFile" || command === "newFolder") { setName(""); setForm({ kind: command === "newFolder" ? "folder" : "file", parent: destination() }); }
    else if (command === "rename" && paths.length === 1) void tree.current?.edit(paths[0]!);
    else if ((command === "copy" || command === "cut") && paths.length) props.onBuffer(paths, command === "cut");
    else if (command === "paste") void props.onPaste(destination());
    else if (command === "remove" && paths.length) setForm({ kind: "delete", paths });
    else if (command === "refresh") props.onRefresh();
  }
  function keyboard(event: KeyboardEvent): void {
    const target = event.target as HTMLElement;
    if (target.closest("input,textarea,[contenteditable=true]") || form) return;
    if (event.key === "Enter" && target.closest("[role=tree]")) {
      event.preventDefault(); event.stopPropagation();
      const node = tree.current?.focusedNode;
      if (!props.busy && node?.isInternal) node.toggle();
      return;
    }
    let action: string | undefined;
    if (event.key === "F2") action = "rename";
    else if (event.key === "Delete") action = "remove";
    else if (event.key === "F5") action = "refresh";
    else if (event.ctrlKey || event.metaKey) action = ({ c: "copy", x: "cut", v: "paste", n: event.shiftKey ? "newFolder" : "newFile" } as Record<string, string>)[event.key.toLowerCase()];
    if (action) { event.preventDefault(); event.stopPropagation(); command(action); }
    if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) { event.preventDefault(); setMenu(true); }
  }
  async function submit(): Promise<void> {
    if (!form || props.busy) return;
    const success = form.kind === "delete" ? await props.onRemove(form.paths) : await props.onCreate(form.parent, name, form.kind === "folder");
    if ((success || form.kind === "delete") && alive.current) closeForm();
  }
  useLayoutEffect(() => { if (form?.kind === "delete") confirm.current?.focus(); else if (form) field.current?.focus(); }, [form]);
  const count = props.selection.filter(path => path !== ROOT_ID).length;
  return <Box className="lm-explorer" style={{ ...theme.style, backgroundColor: "transparent" }} onKeyDownCapture={keyboard} aria-label={t.title} aria-busy={props.busy || props.loading}>
    <Group className="lm-explorer-toolbar" gap={0} wrap="nowrap">
      <Menu withinPortal={false} position="bottom-start" width="target" offset={4} returnFocus>
        <Menu.Target><Button variant="default" fullWidth justify="space-between" className="lm-explorer-tabs" aria-label={t.tabs} title={t.title} rightSection={<Icon name="expand" />}>{t.title}</Button></Menu.Target>
        <Menu.Dropdown className="lm-explorer-menu lm-explorer-tab-menu"><Menu.Item aria-current="page" title={t.title}>{t.title}</Menu.Item></Menu.Dropdown>
      </Menu>
      <Menu opened={menu} onChange={setMenu} withinPortal={false} position="bottom-start" returnFocus={false} onClose={focusTree}>
        <Menu.Target><Box className="lm-explorer-menu-anchor" aria-hidden="true" tabIndex={-1} /></Menu.Target>
        <Menu.Dropdown className="lm-explorer-menu">
          {["newFile", "newFolder", "rename", "copy", "cut", "paste", "remove", "refresh"].map(action => <Menu.Item key={action}
            disabled={props.busy || (action === "paste" && !props.canPaste) || (action === "rename" && count !== 1) || (["copy", "cut", "remove"].includes(action) && count === 0)}
            onClick={() => command(action)}>{t[action]}</Menu.Item>)}
        </Menu.Dropdown>
      </Menu>
    </Group>
    {props.error && <Group className="lm-explorer-message" gap="xs"><Text role="alert">{props.error}</Text><Button disabled={props.busy} onClick={props.onRefresh}>{t.retry}</Button></Group>}
    {props.degraded && <Text role="status" className="lm-explorer-message">{props.degraded}</Text>}
    {form && <Paper className="lm-explorer-form" component="form" onSubmit={event => { event.preventDefault(); void submit(); }} onKeyDown={event => {
      if (event.key === "Escape") { event.stopPropagation(); event.preventDefault(); if (!props.busy) closeForm(); }
    }}>
      <Stack gap="xs">
        {form.kind === "delete" ? <><Text fw={500}>{t.confirmDelete}</Text><Text>{t.deleteWarning}</Text><Box component="ul">{form.paths.map(path => <li key={path}>{path}</li>)}</Box></>
          : <><Text size="sm" title={form.parent || t.root}>{form.parent || t.root}</Text><TextInput ref={field} label={t.name} value={name} disabled={props.busy} onChange={event => setName(event.currentTarget.value)} /></>}
        <Group gap="xs"><Button ref={confirm} type="submit" disabled={props.busy || (form.kind !== "delete" && !name)}>{form.kind === "delete" ? t.remove : t.create}</Button><Button disabled={props.busy} onClick={closeForm}>{t.cancel}</Button></Group>
      </Stack>
    </Paper>}
    <Box ref={host} className="lm-explorer-tree">
      {!props.data.length && <Text role="status" className="lm-explorer-message">{props.loading ? t.loading : t.empty}</Text>}
      <ExplorerContext.Provider value={{ props, surface: () => host.current?.closest<HTMLElement>(".lm-explorer") ?? null,
        context(path) { const node = tree.current?.get(path); if (node && !node.isSelected) node.select(); setMenu(true); } }}>
        <Tree<Entry> ref={tree} data={data} width="100%" height={Math.max(1, size.height - (!props.data.length ? size.row : 0))} rowHeight={size.row} indent={size.row * 0.6}
          openByDefault={false} selectionFollowsFocus initialOpenState={Object.fromEntries([ROOT_ID, ...props.expanded].map(path => [path, true]))} aria-label={t.title!} rowClassName="lm-explorer-row"
          renderRow={ExplorerRow} renderCursor={ExplorerCursor} renderDragPreview={ExplorerDragPreview}
          disableEdit={node => props.busy || node.id === ROOT_ID} disableDrag={node => props.busy || node.id === ROOT_ID || !["file", "directory"].includes(node.kind)}
          disableDrop={({ parentNode, dragNodes }) => props.busy || (!parentNode.isRoot && !parentNode.isInternal) || dragNodes.some(node => parentNode.id === node.id || parentNode.id.startsWith(`${node.id}/`))}
          onToggle={path => { if (!synchronizing.current && path !== ROOT_ID) props.onToggle(path, tree.current?.isOpen(path) ?? false); }}
          onSelect={nodes => { if (!synchronizing.current && !initializing.current) props.onSelection(nodes.map(node => node.id).filter(path => path !== ROOT_ID)); }}
          onActivate={node => { if (node.isInternal && !props.busy) node.toggle(); }}
          onRename={async ({ id, name }) => { if (id !== ROOT_ID) await props.onRename(id, name); }}
          onMove={async ({ dragIds, parentId }) => { if (!dragIds.includes(ROOT_ID)) await props.onMove(dragIds, parentId === ROOT_ID ? "" : parentId ?? ""); }}
          onContextMenu={event => { event.preventDefault(); setMenu(true); }}>{ExplorerNode}</Tree>
      </ExplorerContext.Provider>
    </Box>
  </Box>;
}
