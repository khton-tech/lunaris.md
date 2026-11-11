import type { ActiveDocumentApi, DocumentTransition } from "@lunaris/active-document";
import type { ActiveScreenApi, ScreenSnapshot } from "@lunaris/active-screen";
import type { FileMutation, FileTarget } from "@lunaris/filesystem";

type Destination =
  | { readonly kind: "blank" }
  | { readonly kind: "screen"; readonly screenId: string }
  | { readonly kind: "file"; readonly screenId: string; readonly target: FileTarget };
type Tab = Destination & { readonly id: string };
type Message = "newTab" | "workspaceView" | "tabs" | "closeTab" | "back" | "forward" | "tabFailed";

const blank = { kind: "blank" } as const;
const sameFile = (a: FileTarget | null, b: FileTarget) => a?.vaultId === b.vaultId && a.path === b.path;
const inside = (file: FileTarget, root: FileTarget) =>
  file.vaultId === root.vaultId && (file.path === root.path || file.path.startsWith(root.path + "/"));

interface Options {
  readonly vaultId: string;
  readonly screens: ActiveScreenApi;
  readonly documents: ActiveDocumentApi | undefined;
  readonly live: () => boolean;
  readonly refresh: () => void;
  readonly text: (message: Message) => string;
  readonly report: (level: "info" | "warn" | "error", message: string, error?: unknown) => void;
}

export class WorkspaceTabs {
  #tabs: Tab[] = [];
  #history: string[] = [];
  #cursor = -1;
  #serial = 0;
  #busy = false;
  #failed = false;
  #selected: string | null = null;

  constructor(private readonly options: Options) {}

  synchronize(snapshot: ScreenSnapshot): void {
    if (this.#busy) return;
    for (const tab of this.#tabs) {
      if (tab.kind !== "blank" && !snapshot.screens.some(screen => screen.id === tab.screenId)) this.#remove(tab.id);
    }
    const screen = snapshot.screens.find(item => item.id === snapshot.activeId);
    const current = this.options.documents?.current();
    if (screen?.document && this.options.documents) {
      this.#observe(current?.vaultId === this.options.vaultId ? { kind: "file", screenId: screen.id, target: current } : blank);
    } else {
      this.#observe(screen ? { kind: "screen", screenId: screen.id } : blank);
    }
  }

  transition(change: DocumentTransition): void {
    if (!this.options.live()) return;
    const { previous, current, reason } = change;
    if (previous?.vaultId === this.options.vaultId) {
      if (reason === "relocate" && current) this.#relocate(previous, current);
      if (reason === "reconcile" || (reason === "close" && !this.#busy)) {
        const tab = this.#tabs.find(item => item.kind === "file" && sameFile(item.target, previous));
        if (tab) this.#remove(tab.id);
      }
    }
    this.options.refresh();
  }

  fileMutated(change: FileMutation): void {
    if (!this.options.live() || change.source.vaultId !== this.options.vaultId) return;
    // ActiveDocument publishes its own relocation or reconciliation for the current file.
    const current = this.options.documents?.current() ?? null;
    if (change.operation === "move" && change.destination) this.#relocate(change.source, change.destination, current);
    if (change.operation === "remove") {
      for (const tab of this.#tabs) {
        if (tab.kind === "file" && !sameFile(current, tab.target) && inside(tab.target, change.source)) this.#remove(tab.id);
      }
    }
    this.options.refresh();
  }

  presentation(snapshot: ScreenSnapshot) {
    const { text } = this.options;
    const tabs = this.#tabs.map(tab => {
      if (tab.kind === "file") {
        const path = tab.target.path;
        const name = path.slice(path.lastIndexOf("/") + 1);
        const dot = name.lastIndexOf(".");
        const hasExtension = dot > 0 && dot < name.length - 1;
        const title = hasExtension ? name.slice(0, dot) : name;
        const suffix = hasExtension ? name.slice(dot + 1).toLowerCase() : "";
        return { id: tab.id, title, description: path, location: path.slice(0, -name.length) + title,
          extension: suffix === "md" ? "" : suffix, closable: true };
      }
      const props = tab.kind === "screen" ? snapshot.screens.find(screen => screen.id === tab.screenId)?.props : undefined;
      const title = [props?.tabTitle, props?.title].find((value): value is string => typeof value === "string" && value.trim().length > 0);
      const label = title ?? text(tab.kind === "blank" ? "newTab" : "workspaceView");
      return { id: tab.id, title: label, description: label, location: label, closable: tab.kind !== "blank" || this.#tabs.length > 1 };
    });
    return {
      tabs, selectedId: this.#selected, busy: this.#busy, error: this.#failed ? text("tabFailed") : "",
      labels: { tabs: text("tabs"), add: text("newTab"), close: text("closeTab"), back: text("back"), forward: text("forward") },
      canGoBack: this.#cursor > 0, canGoForward: this.#cursor < this.#history.length - 1,
      onAdd: () => this.#run("Blank workspace tab opened", async () => {
        if (!await this.#activate(blank)) return false;
        this.#append(blank);
        return true;
      }),
      onSelect: (id: string) => this.#select(id),
      onClose: (id: string) => this.#close(id),
      onReorder: (id: string, targetId: string, edge: "before" | "after") => this.#reorder(id, targetId, edge),
      onNavigate: (step: -1 | 1) => {
        const index = this.#cursor + step;
        const id = this.#history[index];
        return id === undefined ? Promise.resolve(false) : this.#select(id, index);
      },
    };
  }

  #create(destination: Destination, id = `tab-${++this.#serial}`): Tab {
    return { ...destination, id };
  }

  #observe(destination: Destination): void {
    const active = this.#tabs.find(tab => tab.id === this.#selected);
    if (active?.kind === "blank" && destination.kind === "blank") return;
    const existing = this.#tabs.find(tab => tab.kind === "file"
      ? destination.kind === "file" && tab.screenId === destination.screenId && sameFile(tab.target, destination.target)
      : tab.kind === "screen" ? destination.kind === "screen" && tab.screenId === destination.screenId : destination.kind === "blank");
    if (existing) { this.#record(existing.id); return; }
    if (active?.kind === "blank") {
      this.#tabs[this.#tabs.indexOf(active)] = this.#create(destination, active.id);
      return;
    }
    this.#append(destination);
  }

  #append(destination: Destination): void {
    const tab = this.#create(destination);
    this.#tabs.push(tab);
    this.#record(tab.id);
  }

  #reorder(id: string, targetId: string, edge: "before" | "after"): void {
    if (!this.options.live() || this.#busy || id === targetId) return;
    const from = this.#tabs.findIndex(tab => tab.id === id);
    const target = this.#tabs.findIndex(tab => tab.id === targetId);
    if (from === -1 || target === -1) return;
    const to = target + Number(edge === "after") - Number(from < target);
    if (from === to) return;
    const [tab] = this.#tabs.splice(from, 1);
    this.#tabs.splice(to, 0, tab!);
    this.options.report("info", "Workspace tabs reordered");
    this.options.refresh();
  }

  #record(id: string, index?: number): void {
    if (id !== this.#selected) this.#failed = false;
    if (index !== undefined && this.#history[index] === id) this.#cursor = index;
    else if (id !== this.#history[this.#cursor]) {
      this.#history.splice(this.#cursor + 1, this.#history.length, id);
      this.#cursor = this.#history.length - 1;
    }
    this.#selected = id;
  }

  #remove(id: string): void {
    this.#tabs = this.#tabs.filter(tab => tab.id !== id);
    for (let i = this.#history.length - 1; i >= 0; i--) {
      if (this.#history[i] !== id) continue;
      this.#history.splice(i, 1);
      if (i <= this.#cursor) this.#cursor--;
    }
    // Removing a tab can bring equal visits together across the removed entry.
    for (let i = this.#history.length - 1; i > 0; i--) {
      if (this.#history[i] !== this.#history[i - 1]) continue;
      this.#history.splice(i, 1);
      if (i <= this.#cursor) this.#cursor--;
    }
    if (id === this.#selected) this.#selected = null;
  }

  #relocate(source: FileTarget, destination: FileTarget, skip: FileTarget | null = null): void {
    if (source.vaultId !== destination.vaultId) return;
    const moving = this.#tabs.filter(tab => tab.kind === "file" && !sameFile(skip, tab.target) && inside(tab.target, source));
    for (const tab of moving) {
      if (tab.kind !== "file") continue;
      const target = { vaultId: destination.vaultId, path: destination.path + tab.target.path.slice(source.path.length) };
      const duplicate = this.#tabs.find(item => item.kind === "file" && item.id !== tab.id && item.screenId === tab.screenId && sameFile(item.target, target));
      if (duplicate?.id === this.#selected || (duplicate?.kind === "file" && sameFile(skip, duplicate.target))) {
        this.#remove(tab.id);
      } else {
        if (duplicate) this.#remove(duplicate.id);
        this.#tabs = this.#tabs.map(item => item.id === tab.id ? { ...tab, target } : item);
      }
    }
  }

  async #activate(destination: Destination, closing?: Tab): Promise<boolean> {
    const { screens, documents, live, report } = this.options;
    const current = documents?.current() ?? null;
    const closeFile = destination.kind === "blank" || (destination.kind === "screen" && closing?.kind === "file" && sameFile(current, closing.target));
    const openFile = destination.kind === "file" && !sameFile(current, destination.target);
    if (documents && (openFile || (current && closeFile))) {
      const result = destination.kind === "file" ? await documents.open(destination.target) : await documents.close();
      if (!live()) return false;
      if (!result.ok) {
        report("warn", "Document tab navigation declined", result.error);
        if (destination.kind === "file" && ["NOT_FOUND", "NOT_DIRECTORY", "NOT_FILE", "INVALID_ARGUMENT"].includes(result.error.code)) {
          const stale = this.#tabs.find(tab => tab.kind === "file" && sameFile(tab.target, destination.target));
          if (stale && stale.id !== this.#selected && !sameFile(documents.current(), destination.target)) this.#remove(stale.id);
        }
        return false;
      }
      if (destination.kind === "file" && !sameFile(documents.current(), destination.target)) return false;
    }
    const result = screens.select(destination.kind === "blank" ? null : destination.screenId);
    if (!result.ok) { report("warn", "Cannot select tab screen", result.error); return false; }
    return true;
  }

  #select(id: string, index?: number): Promise<boolean> {
    const tab = this.#tabs.find(item => item.id === id);
    if (!tab || (id === this.#selected && index === undefined)) return Promise.resolve(false);
    return this.#run("Workspace tab selected", async () => {
      if (!await this.#activate(tab)) return false;
      this.#record(id, index);
      return true;
    });
  }

  #close(id: string): Promise<boolean> {
    const index = this.#tabs.findIndex(item => item.id === id);
    const tab = this.#tabs[index];
    if (!tab || (tab.kind === "blank" && this.#tabs.length === 1)) return Promise.resolve(false);
    return this.#run("Workspace tab closed", async () => {
      const next = this.#tabs[index + 1] ?? this.#tabs[index - 1];
      if (id === this.#selected) {
        if (!await this.#activate(next ?? blank, tab)) return false;
        this.#remove(id);
        if (next && this.#tabs.some(item => item.id === next.id)) this.#record(next.id);
        else this.#observe(blank);
      } else {
        const { documents } = this.options;
        if (documents && tab.kind === "file" && sameFile(documents.current(), tab.target)) {
          const result = await documents.close();
          if (!this.options.live()) return false;
          if (!result.ok) { this.options.report("warn", "Cannot close document tab", result.error); return false; }
        }
        this.#remove(id);
      }
      return true;
    });
  }

  async #run(message: string, operation: () => Promise<boolean>): Promise<boolean> {
    if (!this.options.live() || this.#busy) return false;
    this.#busy = true;
    this.#failed = false;
    try {
      this.options.refresh();
      const completed = await operation();
      this.#failed = !completed;
      if (completed && this.options.live()) this.options.report("info", message);
      return completed;
    } catch (error) {
      this.#failed = true;
      if (this.options.live()) this.options.report("error", "Workspace tab operation failed", error);
      return false;
    } finally {
      this.#busy = false;
      if (this.options.live()) this.options.refresh();
    }
  }
}
