import { EditorSelection } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import type { CancellationSignal } from "@lunaris/sdk";
import type { ContextMenuApi, MenuEntry, MenuSession } from "@lunaris/context-menu";
import type { ClipboardApi } from "@lunaris/clipboard";
import { markupCommand } from "./formatting.js";
import type { Markup } from "./formatting.js";
export interface EditorMenuOptions {
 readonly menus: ContextMenuApi; readonly clipboard: ClipboardApi; readonly owner: CancellationSignal;
 text(key: string): string; active(): boolean; failed(error: unknown): void; completed(operation: string): void;
}
/** Each opening captures a selection, never text in public menu context or logs. */
export function bindEditorMenu(view: EditorView, options: EditorMenuOptions) {
 let opened: MenuSession | undefined; let disposed = false;
 const live = () => !disposed && !options.owner.aborted && options.active();
 const close = () => { opened?.dispose(); opened = undefined; };
 function open(x: number, y: number): void {
  if (!live()) return; close();
  const captured = view.state; const selection = captured.selection.main;
  const writable = !captured.readOnly; const clipboard = options.clipboard.capabilities();
  const valid = () => live() && view.state.doc === captured.doc && view.state.selection.eq(captured.selection) && view.state.readOnly === captured.readOnly;
  const action = (id: string, label: string, icon: string, run: () => void | Promise<void>, disabled = false): MenuEntry => ({ kind:"action",id:"editor."+id,label:options.text(label),icon,disabled,
   async run() { if (!valid()) return; try { await run(); if (live()) options.completed(id); } catch(error) { if (live()) options.failed(error); throw error; } } });
  const format = (id: Markup, label: string = id, icon: string = id): MenuEntry => action(id,label,icon,()=> { if (valid()) { markupCommand(id,options.text("linkText"))(view); view.focus(); } },!writable);
  const selected = captured.sliceDoc(selection.from,selection.to);
  const entries: MenuEntry[] = [
   {kind:"island",id:"editor.formatting",label:options.text("formatting"),order:-100,children:[
    format("bold"),format("italic"),format("code-block"),
    {kind:"group",id:"editor.headings",label:options.text("heading"),icon:"heading",children:([1,2,3,4,5,6] as const).map(level=>format(("heading-"+level) as Markup,"h"+level,"heading"))},
    {kind:"group",id:"editor.lists",label:options.text("list"),icon:"list",children:[format("bullet-list","bulletList","list"),format("ordered-list","orderedList","ordered-list"),format("task-list","taskList","task-list")]},
    format("link"),
   ]},
   action("cut","cut","cut",async()=> {
    const result=await options.clipboard.writeText(selected); if(!result.ok) throw new Error(result.error.message,{cause:result.error});
    if(valid() && !view.state.readOnly) { view.dispatch({changes:{from:selection.from,to:selection.to,insert:""},selection:{anchor:selection.from},userEvent:"delete.cut",scrollIntoView:true});view.focus(); }
   },!writable || selection.empty || !clipboard.write),
   action("copy","copy","copy",async()=> {const result=await options.clipboard.writeText(selected);if(!result.ok) throw new Error(result.error.message,{cause:result.error});if(valid()) view.focus();},selection.empty || !clipboard.write),
   action("paste","paste","paste",async()=> {
    const result=await options.clipboard.readText();if(!result.ok) throw new Error(result.error.message,{cause:result.error});
    if(valid() && !view.state.readOnly) {view.dispatch(view.state.replaceSelection(result.value),{userEvent:"input.paste",scrollIntoView:true});view.focus();}
   },!writable || !clipboard.read),
   action("select-all","selectAll","select-all",()=>{view.dispatch({selection:EditorSelection.range(0,view.state.doc.length)});view.focus();}),
  ];
  const result=options.menus.open({target:view.contentDOM,x,y,label:options.text("editorMenu"),context:{source:"lunaris.text-editor",target:"document",data:{}},entries},options.owner);
  if(result.ok) opened=result.value;else options.failed(new Error(result.error.message,{cause:result.error}));
 }
 const context = (event: MouseEvent) => {
  if(!live()) return; event.preventDefault();
  const position=view.posAtCoords({x:event.clientX,y:event.clientY});const range=view.state.selection.main;
  if(position !== null && (range.empty || position < range.from || position > range.to)) view.dispatch({selection:{anchor:position}});
  open(event.clientX,event.clientY);
 };
 const keyboard = (event: KeyboardEvent) => {
  if(event.key !== "ContextMenu" && !(event.key === "F10" && event.shiftKey)) return;
  if(!live()) return;event.preventDefault();event.stopPropagation();const coords=view.coordsAtPos(view.state.selection.main.head) ?? view.dom.getBoundingClientRect();open(coords.left,coords.bottom);
 };
 view.dom.addEventListener("contextmenu",context);view.dom.addEventListener("keydown",keyboard,true);
 const dispose=()=>{if(disposed)return;disposed=true;close();view.dom.removeEventListener("contextmenu",context);view.dom.removeEventListener("keydown",keyboard,true);options.owner.removeEventListener("abort",dispose);};
 options.owner.addEventListener("abort",dispose,{once:true});
 return {close,dispose};
}
