import { EditorSelection } from "@codemirror/state";
import type { StateCommand } from "@codemirror/state";
export type Markup = "bold" | "italic" | "code-block" | "bullet-list" | "ordered-list" | "task-list" | "link" | "heading-1" | "heading-2" | "heading-3" | "heading-4" | "heading-5" | "heading-6";
export function markupCommand(kind: Markup, linkText = "Link text"): StateCommand {
 return ({state, dispatch}) => {
  if (state.readOnly) return false;
  if (kind === "bold" || kind === "italic" || kind === "link") {
   const changes = state.changeByRange(range => {
    const selected = state.sliceDoc(range.from, range.to);
    let insert: string; let from = range.from; let to = range.to; let start: number; let end: number;
    if (kind === "link") {
     const isUrl = /^[a-z][a-z0-9+.-]*:\S/i.test(selected); const alias = isUrl || !selected ? linkText : selected.replace(/[\[\]]/g, char => "\\" + char);
     const url = isUrl ? selected.replace(/[()\s]/g, char => encodeURIComponent(char)) : "https://";
     insert = "[" + alias + "](" + url + ")";
     start = isUrl ? 1 : alias.length + 3; end = isUrl ? alias.length + 1 : start + url.length;
    } else {
     const mark = kind === "bold" ? "**" : "*";
     const oddStars = (text: string, ending = false) => ((ending ? /\*+$/.exec(text) : /^\*+/.exec(text))?.[0].length ?? 0) % 2 === 1;
     const selectedMarker = kind === "bold" || (oddStars(selected) && oddStars(selected, true));
     const surroundingMarker = kind === "bold" || (oddStars(state.sliceDoc(0, range.from), true) && oddStars(state.sliceDoc(range.to)));
     if (selectedMarker && selected.startsWith(mark) && selected.endsWith(mark) && selected.length >= mark.length * 2) {
      insert = selected.slice(mark.length, -mark.length); start = 0; end = insert.length;
     } else if (surroundingMarker && range.from >= mark.length && state.sliceDoc(range.from-mark.length, range.from) === mark && state.sliceDoc(range.to, range.to+mark.length) === mark) {
      from -= mark.length; to += mark.length; insert = selected; start = 0; end = insert.length;
     } else { insert = mark + selected + mark; start = mark.length; end = start + selected.length; }
    }
    return { changes: {from, to, insert}, range: EditorSelection.range(from + state.toText(insert.slice(0, start)).length, from + state.toText(insert.slice(0, end)).length) };
   });
   dispatch(state.update(changes, {userEvent:"input", scrollIntoView:true})); return true;
  }
  if (kind === "code-block") {
   const range = state.selection.main; const first = state.doc.lineAt(range.from);
   const last = state.doc.lineAt(range.to > range.from && state.doc.lineAt(range.to).from === range.to ? range.to-1 : range.to);
   const content = state.sliceDoc(first.from,last.to); const tick = String.fromCharCode(96);
   const runs = content.match(/`+/g) ?? []; const fence = tick.repeat(runs.reduce((length,run)=>Math.max(length,run.length+1),3));
   const before = fence + state.lineBreak; const insert = before + content + state.lineBreak + fence;
   const contentStart = first.from + state.toText(before).length;
   dispatch(state.update({changes:{from:first.from,to:last.to,insert},selection:EditorSelection.range(contentStart,contentStart+last.to-first.from),userEvent:"input",scrollIntoView:true})); return true;
  }
  const lines = new Set<number>();
  for (const range of state.selection.ranges) {
   const first = state.doc.lineAt(range.from).number;
   const last = state.doc.lineAt(range.to > range.from && state.doc.lineAt(range.to).from === range.to ? range.to-1 : range.to).number;
   for(let number=first;number<=last;number++) lines.add(number);
  }
  const changes = [...lines].sort((a,b)=>a-b).map((number,index)=> {
   const line=state.doc.line(number); const heading=kind.startsWith("heading-");
   const match=(heading ? /^([ \t]*)(?:#{1,6}[ \t]+)?/ : /^([ \t]*)(?:(?:[-+*]|\d+[.)])[ \t]+(\[[ xX]\][ \t]*)?)?/).exec(line.text)!;
   const prefix=heading ? "#".repeat(Number(kind.at(-1)))+" " : kind === "bullet-list" ? "- " : kind === "task-list" ? "- " + (match[2]?.slice(0,3) ?? "[ ]") + " " : String(index+1)+". ";
   return {from:line.from,to:line.from+match[0].length,insert:match[1]+prefix};
  });
  const selection = state.selection.map(state.changes(changes), 1);
  dispatch(state.update({changes,selection,userEvent:"input",scrollIntoView:true})); return true;
 };
}
