import { Facet } from "@codemirror/state";
import { EditorView, WidgetType } from "@codemirror/view";
import type { ComponentProps, MountedComponent } from "@lunaris/components";

export interface TaskControls {
  readonly label: string;
  active(): boolean;
  toggled(checked: boolean): void;
  mount(target: HTMLElement, props: ComponentProps): MountedComponent | null;
}

export const taskControls = Facet.define<TaskControls, TaskControls | null>({ combine: values => values[0] ?? null });
const mounts = new WeakMap<HTMLElement, MountedComponent>();

/** Only the public component role renders controls; Markdown remains the model. */
export class TaskCheckbox extends WidgetType {
  constructor(readonly from: number, readonly marker: string, readonly disabled: boolean,
    readonly label: string, readonly controls: TaskControls) { super(); }
  override eq(other: TaskCheckbox) {
    return this.from === other.from && this.marker === other.marker && this.disabled === other.disabled
      && this.label === other.label && this.controls === other.controls;
  }
  private props(view: EditorView, dom: HTMLElement): ComponentProps {
    return { checked: this.marker !== "[ ]", disabled: this.disabled, label: this.label,
      presentation: { mode: "embedded", sizing: "content" }, onChange: (checked: boolean) => {
        const state = view.state;
        // Leave React's event stack before the editor updates the embedded root.
        void Promise.resolve().then(() => {
          if (!this.controls.active() || !mounts.has(dom) || view.state !== state || view.state.readOnly || !view.state.facet(EditorView.editable)
            || view.state.sliceDoc(this.from, this.from + 3) !== this.marker) return;
          view.dispatch({ changes: { from: this.from + 1, to: this.from + 2, insert: checked ? "x" : " " }, userEvent: "input.task" });
          this.controls.toggled(checked);
        });
      } };
  }
  toDOM(view: EditorView) {
    const dom = view.dom.ownerDocument.createElement("span");
    dom.className = "cm-preview-task";
    dom.contentEditable = "false";
    const mounted = this.controls.mount(dom, this.props(view, dom));
    if (mounted) mounts.set(dom, mounted);
    else dom.textContent = this.marker;
    return dom;
  }
  override updateDOM(dom: HTMLElement, view: EditorView) {
    const mounted = mounts.get(dom);
    return this.controls.active() && mounted ? mounted.update(this.props(view, dom)).ok : false;
  }
  override destroy(dom: HTMLElement) {
    if (this.controls.active()) mounts.get(dom)?.dispose();
    mounts.delete(dom);
  }
  override ignoreEvent() { return true; }
}
