import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { ActionIcon, Badge, Box, Button, Group, Menu, Paper, Stack, Text, TextInput } from "@mantine/core";
import { Tree } from "react-arborist";
import type { CursorProps, DragPreviewProps, NodeRendererProps, RowRendererProps, TreeApi } from "react-arborist";
import type { ComponentProps } from "@lunaris/components";
import type { MenuOpenRequest, MenuSession } from "@lunaris/context-menu";
import type { resolveTheme } from "./theme.js";
import { Icon } from "./icons.js";
import { VaultSwitcher, validVaultSwitcher } from "./vault-switcher.js";
import type { VaultSwitcherProps } from "./vault-switcher.js";

// Absolute paths never occur in the Vault-relative controller tree.
const ROOT_ID = "/";
const DRAFT_ID = "//create";
interface Entry { id: string; name: string; kind: string; children?: Entry[]; draft?: boolean }
type Form = { kind: "file" | "folder"; parent: string; initialName?: string } | { kind: "delete"; paths: string[] };
interface Draft { form: Form | null; name: string }
interface ExplorerProps {
  sortDirection?: "asc" | "desc"; expanding?: boolean;
  onSort?: (direction: "asc" | "desc") => void; onExpandAll?: () => Promise<void>;
  vaultSwitcher?: VaultSwitcherProps;
  supportedExtensions?: readonly string[];
  activePath?: string | null; onOpen?: (path: string) => Promise<void>;
  vaultId: string; data: Entry[]; expanded: string[]; selection: string[]; busy: boolean; loading: boolean; error: string; degraded: string; canPaste: boolean;
  workspace?: { vaultId: string; vaultName?: string }; text: Record<string, string>;
  onToggle(path: string, open: boolean): void; onSelection(paths: string[]): void; onBuffer(paths: string[], cut: boolean): void;
  onCreate(parent: string, name: string, directory: boolean): Promise<boolean>; onRename(path: string, name: string): Promise<boolean>;
  onMove(paths: string[], destination: string): Promise<boolean>; onPaste(destination: string): Promise<boolean>;
  onRemove(paths: string[]): Promise<boolean>; onRefresh(): void;
  initialDraft: Draft; onDraft(draft: Draft): void;
  onContextMenu(request: Omit<MenuOpenRequest, "context"> & { path: string | null; kind: string; selection: readonly string[]; destination: string }): MenuSession | undefined;
}
export function explorerProps(value: ComponentProps): ExplorerProps {
  if ((value.sortDirection !== undefined && !["asc", "desc"].includes(value.sortDirection as string)) ||
    (value.expanding !== undefined && typeof value.expanding !== "boolean") ||
    ["onSort", "onExpandAll"].some(key => value[key] !== undefined && typeof value[key] !== "function")) throw new TypeError("Invalid explorer toolbar props.");
  if (value.vaultSwitcher !== undefined && !validVaultSwitcher(value.vaultSwitcher)) throw new TypeError("Invalid Vault switcher props.");
  const validEntries = (items: unknown, ids = new Set<string>()): boolean => Array.isArray(items) && items.every(item => {
    if (!item || typeof item.id !== "string" || !item.id || ids.has(item.id) || typeof item.name !== "string" || !["file", "directory", "symlink", "other"].includes(item.kind)) return false;
    ids.add(item.id);
    return item.kind === "directory" ? validEntries(item.children, ids) : item.children === undefined;
  });
  if (!validEntries(value.data) || !["vaultId", "error", "degraded"].every(key => typeof value[key] === "string") ||
    !["busy", "loading", "canPaste"].every(key => typeof value[key] === "boolean") ||
    !["expanded", "selection"].every(key => Array.isArray(value[key]) && (value[key] as unknown[]).every(item => typeof item === "string")) ||
    !value.text || typeof value.text !== "object" || Object.values(value.text).some(item => typeof item !== "string") ||
    !["onToggle", "onSelection", "onBuffer", "onCreate", "onRename", "onMove", "onPaste", "onRemove", "onRefresh", "onDraft", "onContextMenu"].every(key => typeof value[key] === "function")) throw new TypeError("Invalid file explorer props.");
  if (value.supportedExtensions !== undefined && (!Array.isArray(value.supportedExtensions) || value.supportedExtensions.some(item => typeof item !== "string" || !/^[a-z0-9]+$/i.test(item)))) throw new TypeError("Invalid supported extensions.");
  if (value.activePath !== undefined && value.activePath !== null && typeof value.activePath !== "string") throw new TypeError("Invalid active document path.");
  if (value.onOpen !== undefined && typeof value.onOpen !== "function") throw new TypeError("Invalid document activation callback.");
  const draft = value.initialDraft as Draft | undefined;
  if (!draft || typeof draft.name !== "string" || (draft.form !== null && (!draft.form ||
    (draft.form.kind === "delete" ? !Array.isArray(draft.form.paths) || draft.form.paths.some(path => typeof path !== "string") :
      !["file", "folder"].includes(draft.form.kind) || typeof draft.form.parent !== "string")))) throw new TypeError("Invalid explorer draft.");
  if (draft.form && draft.form.kind !== "delete" && draft.form.initialName !== undefined && typeof draft.form.initialName !== "string") throw new TypeError("Invalid initial draft name.");
  return value as unknown as ExplorerProps;
}
function fileLabel(name: string, kind: string, extensions: readonly string[] = []) {
  const dot = name.lastIndexOf(".");
  if (kind !== "file" || dot <= 0 || dot === name.length - 1) return { name, suffix: "", badge: "" };
  const suffix = name.slice(dot);
  const supported = extensions.some(extension => extension.toLowerCase() === suffix.slice(1).toLowerCase());
  return { name: name.slice(0, dot), suffix, badge: supported ? "" : suffix.slice(1).toLowerCase() };
}
function withSuffix(name: string, suffix: string): string {
  return suffix && name.toLowerCase().endsWith(suffix.toLowerCase()) ? name.slice(0, -suffix.length) + suffix : name + suffix;
}
function ExtensionBadge({ extension }: { extension: string }) {
  return extension ? <Badge className="lm-explorer-extension" size="xs" radius="xl" variant="light">{extension}</Badge> : null;
}
interface Creation { name: string; kind: "file" | "folder"; pending: boolean; onName(name: string): void; submit(restoreFocus?: boolean): Promise<void>; cancel(restoreFocus?: boolean): void }
const ExplorerContext = createContext<{ props: ExplorerProps; creation: Creation | null; surface(): HTMLElement | null; context(path: string, x: number, y: number): void } | null>(null);
function ExplorerRow({ node, attrs, innerRef, children }: RowRendererProps<Entry>) {
  const { props } = useContext(ExplorerContext)!;
  return <div {...attrs} ref={innerRef} style={{ ...attrs.style, minWidth: 0 }} onFocus={event => {
    event.stopPropagation();
    if (node.data.draft && event.target === event.currentTarget) event.currentTarget.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true });
  }}
    onClick={event => {
      if (node.data.draft) return;
      // A plain click selects without changing the geometry under a drag source.
      if (event.ctrlKey || event.metaKey || event.shiftKey) node.handleClick(event);
      else { node.select(); if (node.data.kind === "file" && !props.busy) void props.onOpen?.(node.id); }
    }} onDoubleClick={event => { if (!event.ctrlKey && !event.metaKey && !event.shiftKey) node.activate(); }}>{children}</div>;
}
function CreateInput() {
  const { props, creation } = useContext(ExplorerContext)!; const input = useRef<HTMLInputElement>(null); const wasPending = useRef(false);
  const suffix = useRef(fileLabel(creation?.name ?? "", creation?.kind ?? "", props.supportedExtensions).suffix).current;
  const visibleName = creation?.name && suffix && creation.name.endsWith(suffix) ? creation.name.slice(0, -suffix.length) : creation?.name ?? "";
  useLayoutEffect(() => {
    const field = input.current; if (!field) return;
    field.focus({ preventScroll: true });
    field.select();
  }, []);
  useLayoutEffect(() => {
    if (wasPending.current && !creation?.pending && !props.busy) { input.current?.focus(); wasPending.current = false; }
    if (creation?.pending) wasPending.current = true;
  }, [creation?.pending, props.busy]);
  if (!creation) return null;
  return <><TextInput ref={input} className="lm-explorer-rename lm-explorer-create" aria-label={creation.kind === "folder" ? props.text.newFolder : props.text.newFile}
    value={visibleName} disabled={props.busy || creation.pending} onChange={event => { const value = event.currentTarget.value; creation.onName(value.trim() ? withSuffix(value, suffix) : ""); }}
    onBlur={event => {
      const row = event.currentTarget.closest("[role=treeitem]");
      if (event.relatedTarget && row?.contains(event.relatedTarget as Node)) return;
      if (props.busy || creation.pending) return;
      if (!event.currentTarget.value.trim()) creation.cancel(false);
      else void creation.submit(false);
    }}
    onClick={event => event.stopPropagation()} onKeyDown={event => {
      event.stopPropagation();
      if (event.key === "Escape") { event.preventDefault(); if (!props.busy && !creation.pending) creation.cancel(); }
      if (event.key === "Enter") { event.preventDefault(); void creation.submit(); }
    }} /></>;
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
  const label = fileLabel(node.data.name, node.data.kind, props.supportedExtensions);
  useLayoutEffect(() => { input.current?.focus(); input.current?.select(); }, []);
  return <><TextInput ref={input} className="lm-explorer-rename" aria-label={props.text.rename} defaultValue={label.name} disabled={props.busy}
    onClick={event => event.stopPropagation()} onBlur={() => { if (!submitted.current) node.reset(); }}
    onKeyDown={event => {
      event.stopPropagation();
      if (event.key === "Escape") { event.preventDefault(); node.reset(); }
      if (event.key === "Enter" && !props.busy && !submitted.current) { event.preventDefault(); if (!event.currentTarget.value.trim()) return; submitted.current = true; node.submit(withSuffix(event.currentTarget.value, label.suffix)); }
    }} /><ExtensionBadge extension={label.badge} /></>;
}
function ExplorerNode(payload: NodeRendererProps<Entry>) {
  const { node, tree, style, dragHandle } = payload; const { props, context } = useContext(ExplorerContext)!;
  const label = fileLabel(node.data.name, node.data.kind, props.supportedExtensions);
  return <Box ref={dragHandle} style={style} className="lm-explorer-node" data-directory={node.data.kind === "directory" || undefined} data-root={node.id === ROOT_ID || undefined} data-active={props.activePath === node.id || undefined} aria-current={props.activePath === node.id ? "page" : undefined} data-selected={node.isSelected || undefined} data-focused={node.isFocused || undefined} data-drop={node.willReceiveDrop || undefined}
    title={node.id === ROOT_ID ? node.data.name : node.id} onContextMenu={event => { event.preventDefault(); event.stopPropagation(); context(node.id, event.clientX, event.clientY); }}>
    {node.level > 0 && <span className="lm-explorer-indent-guides" aria-hidden="true"
      style={{ width: node.level * tree.indent, backgroundSize: `${tree.indent}px 100%` }} />}
    {node.isInternal ? <ActionIcon className="lm-explorer-disclosure" variant="subtle" size="xs" tabIndex={-1} aria-label={node.data.name} aria-expanded={node.isOpen}
      disabled={props.busy} onClick={event => { event.stopPropagation(); node.toggle(); }}><span data-open={node.isOpen || undefined}><Icon name="expand" /></span></ActionIcon>
      : <span className="lm-explorer-spacer" />}
    <Box component="span" className="lm-explorer-entry-icon" aria-hidden="true"><Icon name={node.data.draft ? node.data.kind === "directory" ? "folder" : "file" : node.isInternal ? node.isOpen ? "browse" : "folder" : "file"} /></Box>
    {node.data.draft ? <CreateInput /> : node.isEditing ? <RenameInput {...payload} /> : <><Text component="span" className="lm-explorer-filename">{label.name}</Text><ExtensionBadge extension={label.badge} /></>}
  </Box>;
}
export function FileExplorer({ props, theme }: { props: ExplorerProps; theme: ReturnType<typeof resolveTheme> }) {
  // Workspace can mount the new Vault before Sidebar receives fresh controller
  // props. Never show the previous Vault's tree or callbacks in that interval.
  if (props.workspace && props.workspace.vaultId !== props.vaultId) return <Box className="lm-explorer" style={theme.contentStyle}><Text role="status" className="lm-explorer-message">{props.text.loading}</Text></Box>;
  return <ExplorerView key={props.vaultId} props={props} theme={theme} />;
}
function ExplorerView({ props, theme }: { props: ExplorerProps; theme: ReturnType<typeof resolveTheme> }) {
  const host = useRef<HTMLDivElement>(null); const tree = useRef<TreeApi<Entry>>(null); const alive = useRef(true);
  const synchronizing = useRef(false);
  const initializing = useRef(true);
  const [size, setSize] = useState({ height: 1, row: 28 });
  const [keyboardNavigation, setKeyboardNavigation] = useState(false);
  const menu = useRef<MenuSession | undefined>(undefined);
  useEffect(() => () => { const previous = menu.current; void Promise.resolve().then(() => previous?.dispose()); }, []);
  const [form, setForm] = useState<Form | null>(() => props.initialDraft.form); const [name, setName] = useState(() => props.initialDraft.name);
  const confirm = useRef<HTMLButtonElement>(null); const submitting = useRef(false); const closing = useRef(false); const [pending, setPending] = useState(false);
  const t = props.text;
  const data = useMemo<Entry[]>(() => {
    const creation = form && form.kind !== "delete" ? form : null;
    const placeholder: Entry = { id: DRAFT_ID, name: creation?.initialName ?? props.initialDraft.name, kind: creation?.kind === "folder" ? "directory" : "file", draft: true };
    const insert = (items: Entry[], parent: string): Entry[] => {
      const children = items.map(item => item.children ? { ...item, children: insert(item.children, item.id) } : item);
      return creation?.parent === parent ? [...children, placeholder].sort((a, b) => Number(b.kind === "directory") - Number(a.kind === "directory") || a.name.localeCompare(b.name) * (props.sortDirection === "desc" ? -1 : 1)) : children;
    };
    return [{ id: ROOT_ID, name: props.workspace?.vaultName || t.root!, kind: "directory", children: insert(props.data, "") }];
  }, [props.data, props.workspace?.vaultName, props.sortDirection, t.root, form]);
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
  }, [theme.contentStyle.fontSize]);
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
  const revealedDocument = useRef<string | null>(null);
  useEffect(() => {
    if (!props.activePath) { revealedDocument.current = null; return; }
    if (revealedDocument.current !== props.activePath && tree.current?.get(props.activePath)) {
      revealedDocument.current = props.activePath; void tree.current.scrollTo(props.activePath);
    }
  }, [props.activePath, props.data]);
  function selected(): string[] { return (tree.current ? [...tree.current.selectedIds] : props.selection).filter(path => path !== ROOT_ID && path !== DRAFT_ID); }
  function destination(): string {
    const api = tree.current; const paths = selected(); const node = paths.length === 1 ? api?.get(paths[0]!) : null;
    const path = node?.isInternal ? node.id : node?.parent?.isRoot ? "" : node?.parent?.id ?? "";
    return path === ROOT_ID ? "" : path;
  }
  function focusTree(): void { host.current?.querySelector<HTMLElement>("[role=tree]")?.focus({ preventScroll: true }); }
  function clearSelection(): void {
    tree.current?.focus(ROOT_ID, { scroll: false }); tree.current?.deselectAll(); props.onSelection([]);
  }
  function closeForm(restoreFocus = true): void { closing.current = true; setForm(null); if (restoreFocus) focusTree(); }
  function command(command: string, paths = selected(), parent = destination()): void {
    if (props.busy || !alive.current) return;
    if (command === "newFile" || command === "newFolder") {
      const kind = command === "newFolder" ? "folder" : "file";
      const base = kind === "file" ? t.unnamedFile ?? "Unnamed.md" : t.unnamedFolder ?? "Unnamed folder";
      const siblings = tree.current?.get(parent || ROOT_ID)?.data.children ?? [];
      const used = new Set(siblings.map(entry => entry.name.toLocaleLowerCase()));
      const dot = kind === "file" ? base.lastIndexOf(".") : -1;
      const stem = dot > 0 ? base.slice(0, dot) : base; const extension = dot > 0 ? base.slice(dot) : "";
      let initialName = base;
      for (let index = 2; used.has(initialName.toLocaleLowerCase()); index++) initialName = `${stem} ${index}${extension}`;
      closing.current = false; setName(initialName); setForm({ kind, parent, initialName });
    }
    else if (command === "rename" && paths.length === 1) void tree.current?.edit(paths[0]!);
    else if ((command === "copy" || command === "cut") && paths.length) props.onBuffer(paths, command === "cut");
    else if (command === "paste") void props.onPaste(parent);
    else if (command === "remove" && paths.length) { closing.current = false; setForm({ kind: "delete", paths }); }
    else if (command === "refresh") props.onRefresh();
  }
  function openMenu(path: string | null, x: number, y: number): void {
    if (form || props.busy) return;
    const node = path === null ? undefined : tree.current?.get(path);
    if (path === null || path === ROOT_ID) clearSelection();
    if (node && path !== ROOT_ID && !node.isSelected) node.select();
    const paths = path === null || path === ROOT_ID ? [] : selected();
    const parent = path === null || path === ROOT_ID ? "" : node?.isInternal ? node.id : node?.parent?.id === ROOT_ID ? "" : node?.parent?.id ?? "";
    const container = (path === null || path === ROOT_ID || node?.isInternal) && paths.length <= 1;
    const actions = [...(container ? ["newFile", "newFolder", "paste", "refresh"] : []), ...(paths.length ? ["rename", "copy", "cut", "remove"] : [])];
    const target = host.current?.querySelector<HTMLElement>("[role=tree]");
    if (!target) return;
    // Selection publishes first; the menu then receives the new controller state.
    void Promise.resolve().then(() => {
      if (!alive.current) return;
      menu.current = props.onContextMenu({ target, x, y, label: t.title!, path: path === ROOT_ID ? "" : path,
        kind: path === null ? "background" : path === ROOT_ID ? "root" : node?.data.kind ?? "background", selection: paths, destination: parent,
        entries: actions.map((action, order) => ({
          kind: "action", id: `lunaris.file-explorer.${action}`, label: t[action]!, order,
          icon: ({ newFile: "file-plus", newFolder: "folder-plus", rename: "rename", copy: "copy", cut: "cut", paste: "paste", remove: "trash", refresh: "refresh" } as Record<string, string>)[action]!,
          disabled: (action === "paste" && !props.canPaste) || (action === "rename" && paths.length !== 1) || (["copy", "cut", "remove"].includes(action) && paths.length === 0),
          run: () => command(action, paths, parent),
        })),
      });
    });
  }
  function keyboard(event: KeyboardEvent): void {
    const target = event.target as HTMLElement;
    if (target.closest(".lm-vault-switcher")) return;
    if (target.closest("input,textarea,[contenteditable=true]") || form) return;
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"].includes(event.key) && target.closest("[role=tree]")) setKeyboardNavigation(true);
    if (event.key === "Enter" && target.closest("[role=tree]")) {
      event.preventDefault(); event.stopPropagation();
      const node = tree.current?.focusedNode;
      if (!props.busy && node?.isInternal) node.toggle();
      else if (!props.busy && node?.data.kind === "file") void props.onOpen?.(node.id);
      return;
    }
    let action: string | undefined;
    if (event.key === "F2") action = "rename";
    else if (event.key === "Delete") action = "remove";
    else if (event.key === "F5") action = "refresh";
    else if (event.ctrlKey || event.metaKey) action = ({ c: "copy", x: "cut", v: "paste", n: event.shiftKey ? "newFolder" : "newFile" } as Record<string, string>)[event.key.toLowerCase()];
    if (action) { event.preventDefault(); event.stopPropagation(); command(action); }
    if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
      event.preventDefault(); event.stopPropagation();
      const focused = target.closest<HTMLElement>("[role=treeitem]") ?? host.current!.querySelector<HTMLElement>("[data-focused]")?.closest<HTMLElement>("[role=treeitem]");
      const bounds = focused?.getBoundingClientRect() ?? host.current!.getBoundingClientRect();
      openMenu(tree.current?.focusedNode?.id ?? selected()[0] ?? null, bounds.left, bounds.bottom);
    }
  }
  async function submit(restoreFocus = true): Promise<void> {
    if (!form || closing.current || props.busy || submitting.current || (form.kind !== "delete" && !name.trim())) return;
    submitting.current = true; setPending(true);
    try {
      const success = form.kind === "delete" ? await props.onRemove(form.paths) : await props.onCreate(form.parent, name, form.kind === "folder");
      if ((success || form.kind === "delete") && alive.current) closeForm(restoreFocus);
    } finally { submitting.current = false; if (alive.current) setPending(false); }
  }
  useLayoutEffect(() => {
    if (form?.kind === "delete") confirm.current?.focus();
    else if (form) { tree.current?.openParents(DRAFT_ID); tree.current?.focus(DRAFT_ID, { scroll: false }); void tree.current?.scrollTo(DRAFT_ID); }
  }, [form, props.data]);
  const empty = !props.data.length && (!form || form.kind === "delete");
  return <Box className="lm-explorer" style={theme.contentStyle} onKeyDownCapture={keyboard}
    onPointerDownCapture={() => setKeyboardNavigation(false)} data-keyboard-navigation={keyboardNavigation || undefined} aria-label={t.title} aria-busy={props.busy || props.loading}>
    <Group className="lm-explorer-toolbar" gap={0} wrap="nowrap">
      <Menu withinPortal={false} position="bottom-start" width="target" offset={6} transitionProps={{ transition: "fade" }} returnFocus>
        <Menu.Target><Button variant="subtle" fullWidth justify="space-between" className="lm-explorer-tabs" aria-label={t.tabs} title={t.title} rightSection={<Icon name="expand" />}>{t.title}</Button></Menu.Target>
        <Menu.Dropdown className="lm-explorer-menu lm-explorer-tab-menu"><Menu.Item aria-current="page" title={t.title} rightSection={<Icon name="check" />}>{t.title}</Menu.Item></Menu.Dropdown>
      </Menu>
    </Group>
    <Group className="lm-explorer-actions" gap={0} wrap="nowrap" role="group" aria-label={t.actions}>
      <ActionIcon variant="subtle" aria-label={t.newFile} title={t.newFile} disabled={props.busy || props.loading || !!form} onClick={() => command("newFile")}><Icon name="file-plus" /></ActionIcon>
      <ActionIcon variant="subtle" aria-label={t.newFolder} title={t.newFolder} disabled={props.busy || props.loading || !!form} onClick={() => command("newFolder")}><Icon name="folder-plus" /></ActionIcon>
      <Menu withinPortal={false} position="bottom-start" offset={4} returnFocus>
        <Menu.Target><ActionIcon variant="subtle" aria-label={t.sort} title={t.sort} disabled={props.busy || !!form || !props.onSort}><Icon name="sort" /></ActionIcon></Menu.Target>
        <Menu.Dropdown className="lm-explorer-menu lm-explorer-tab-menu">
          {(["asc", "desc"] as const).map(direction => <Menu.Item key={direction} aria-current={(props.sortDirection ?? "asc") === direction ? "true" : undefined} rightSection={(props.sortDirection ?? "asc") === direction ? <Icon name="check" /> : undefined} onClick={() => props.onSort?.(direction)}>{direction === "asc" ? t.sortAscending : t.sortDescending}</Menu.Item>)}
        </Menu.Dropdown>
      </Menu>
      <ActionIcon variant="subtle" aria-label={t.expandAll} title={t.expandAll} disabled={props.busy || props.loading || props.expanding || !!form || !props.onExpandAll} onClick={() => { tree.current?.open(ROOT_ID); void props.onExpandAll?.(); }}><Icon name="expand-all" /></ActionIcon>
    </Group>
    {props.error && <Group className="lm-explorer-message" gap="xs"><Text role="alert">{props.error}</Text><Button disabled={props.busy} onClick={props.onRefresh}>{t.retry}</Button></Group>}
    {props.degraded && <Text role="status" className="lm-explorer-message">{props.degraded}</Text>}
    {form?.kind === "delete" && <Paper className="lm-explorer-form" component="form" onSubmit={event => { event.preventDefault(); void submit(); }} onKeyDown={event => {
      if (event.key === "Escape") { event.stopPropagation(); event.preventDefault(); if (!props.busy) closeForm(); }
    }}>
      <Stack gap="xs">
        <Text fw={500}>{t.confirmDelete}</Text><Text>{t.deleteWarning}</Text><Box component="ul">{form.paths.map(path => <li key={path}>{path}</li>)}</Box>
        <Group gap="xs"><Button ref={confirm} type="submit" disabled={props.busy || pending}>{t.remove}</Button><Button disabled={props.busy || pending} onClick={() => closeForm()}>{t.cancel}</Button></Group>
      </Stack>
    </Paper>}
    <Box ref={host} className="lm-explorer-tree" onClick={event => {
      if (!(event.target as HTMLElement).closest("[role=treeitem]") && !form) clearSelection();
    }} onContextMenu={event => { event.preventDefault(); event.stopPropagation(); openMenu(null, event.clientX, event.clientY); }}>
      {empty && <Text role="status" className="lm-explorer-message">{props.loading ? t.loading : t.empty}</Text>}
      <ExplorerContext.Provider value={{ props, creation: form && form.kind !== "delete" ? { name, kind: form.kind, pending, onName: setName, submit, cancel: closeForm } : null, surface: () => host.current?.closest<HTMLElement>(".lm-explorer") ?? null,
        context: openMenu }}>
        <Tree<Entry> ref={tree} data={data} width="100%" height={Math.max(1, size.height - (empty ? size.row : 0))} rowHeight={size.row} indent={size.row * 0.6}
          openByDefault={false} selectionFollowsFocus={!form || form.kind === "delete"} initialOpenState={Object.fromEntries([ROOT_ID, ...props.expanded].map(path => [path, true]))} aria-label={t.title!} rowClassName="lm-explorer-row"
          renderRow={ExplorerRow} renderCursor={ExplorerCursor} renderDragPreview={ExplorerDragPreview}
          disableSelect={node => node.draft === true}
          disableEdit={node => props.busy || node.id === ROOT_ID || node.draft === true} disableDrag={node => props.busy || node.id === ROOT_ID || node.draft === true || !["file", "directory"].includes(node.kind)}
          disableDrop={({ parentNode, dragNodes }) => props.busy || (!parentNode.isRoot && !parentNode.isInternal) || dragNodes.some(node => parentNode.id === node.id || parentNode.id.startsWith(`${node.id}/`))}
          onToggle={path => { if (!synchronizing.current && path !== ROOT_ID) props.onToggle(path, tree.current?.isOpen(path) ?? false); }}
          onSelect={nodes => { if (!synchronizing.current && !initializing.current) props.onSelection(nodes.map(node => node.id).filter(path => path !== ROOT_ID && path !== DRAFT_ID)); }}
          onActivate={node => { if (node.isInternal && !props.busy) node.toggle(); }}
          onRename={async ({ id, name }) => { if (id !== ROOT_ID) await props.onRename(id, name); }}
          onMove={async ({ dragIds, parentId }) => { if (!dragIds.includes(ROOT_ID)) await props.onMove(dragIds, parentId === ROOT_ID ? "" : parentId ?? ""); }}>{ExplorerNode}</Tree>
      </ExplorerContext.Provider>
    </Box>
    {props.vaultSwitcher && <VaultSwitcher props={props.vaultSwitcher} text={t} />}
  </Box>;
}
