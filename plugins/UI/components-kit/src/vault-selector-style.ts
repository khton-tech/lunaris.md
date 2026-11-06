import { controlStyle } from "./controls-style.js";
import { panelStyle } from "./panel-style.js";
import { surfaceStyle } from "./surface-style.js";

/** Quiet surfaces; interaction states and motion come from the active theme. */
export const selectorStyle = `${controlStyle}${panelStyle}${surfaceStyle}
.ln-vault { box-sizing:border-box;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,2fr);grid-template-rows:minmax(0,1fr);gap:calc(var(--vault-space)*3);padding:calc(var(--vault-space)*3);flex:1 1 0%;min-height:0;min-width:0;overflow:auto;
 background:var(--vault-background);color:var(--vault-text);font-family:var(--vault-font);font-size:var(--vault-font-size);line-height:var(--vault-line-height);user-select:none;
 --panel-background:var(--vault-panel);--panel-radius:var(--vault-radius);
 --control-radius:var(--vault-radius);--control-gap:calc(var(--vault-space)*3);--control-padding:calc(var(--vault-space)*3);
 --control-background:color-mix(in srgb,var(--vault-content) 65%,var(--vault-panel));--control-text:var(--vault-text);--control-secondary:var(--vault-secondary);
 --control-field-border:color-mix(in srgb,var(--vault-control-border) 65%,var(--vault-panel));
 --control-border:var(--vault-control-border);--control-border-width:var(--vault-border);--control-focus:var(--vault-focus);
 --control-focus-width:var(--vault-focus-width);--control-focus-offset:var(--vault-focus-offset);--control-selection:var(--vault-selection);
 --control-hover:color-mix(in srgb,var(--vault-hover) 45%,transparent);--control-pressed:color-mix(in srgb,var(--vault-selection) 65%,transparent);
 --control-fast:var(--vault-motion-fast);--control-easing:var(--vault-motion-easing); }
.ln-vault * { box-sizing:border-box;min-width:0 }
.ln-vault [hidden] { display:none!important }
.ln-vault svg { width:1.15em;height:1.15em;flex-shrink:0 }
.ln-vault .ln-vault-recents { min-height:0;overflow:auto;padding:calc(var(--vault-space)*3);overflow-wrap:anywhere }
.ln-vault h2 { font-size:.9em;font-weight:500;color:var(--vault-secondary);margin:0 calc(var(--vault-space)*2) calc(var(--vault-space)*3) }
.ln-vault p { margin:0;color:var(--vault-secondary);overflow-wrap:anywhere }
.ln-vault ul { list-style:none;padding:0;margin:0;display:grid;gap:var(--vault-space) }
.ln-vault li button { width:100%;padding:calc(var(--vault-space)*2);gap:calc(var(--vault-space)*2) }
.ln-vault li button > svg { color:var(--vault-secondary) }
.ln-vault li button[aria-current=true] { box-shadow:inset 0 0 0 var(--vault-border) color-mix(in srgb,var(--vault-accent) 45%,transparent) }
.ln-vault li button[aria-current=true] > svg { color:var(--vault-accent) }
.ln-vault .ln-vault-recent-text { display:grid;gap:0;flex:1 }
.ln-vault small { font:inherit;font-size:.85em;color:var(--vault-secondary);overflow-wrap:anywhere }
.ln-vault .ln-vault-main { display:flex;flex-direction:column;align-items:center;min-height:0;overflow:auto;padding:clamp(1rem,5cqw,4rem) }
.ln-vault .ln-vault-main::before { content:"";flex:0 0 var(--vault-center-offset,0px) }
.ln-vault .ln-vault-content { flex-shrink:0;width:100%;max-width:32rem;container-type:inline-size;display:flow-root }
.ln-vault pre { color:var(--vault-sub);font-family:var(--vault-mono);font-size:min(9px,1.7cqw);line-height:1.2;white-space:pre;margin:0 0 calc(var(--vault-space)*8);text-align:center;max-width:100%;overflow:hidden }
.ln-vault .ln-vault-actions { display:grid;gap:calc(var(--vault-space)*2) }
.ln-vault .ln-vault-action { border-radius:var(--vault-radius) }
.ln-vault .ln-vault-toggle { width:100%;padding:calc(var(--vault-space)*4) }
.ln-vault .ln-vault-toggle span { flex:1 }
.ln-vault .ln-vault-toggle > svg { color:var(--vault-secondary) }
.ln-vault .ln-vault-toggle > svg:last-child { transition:transform var(--vault-motion-normal) var(--vault-motion-easing) }
.ln-vault .ln-vault-toggle[aria-expanded=true] > svg:last-child { transform:rotate(90deg) }
.ln-vault .ln-vault-disclosure { display:grid;grid-template-rows:0fr;opacity:0;visibility:hidden;
 transition:grid-template-rows var(--vault-motion-normal) var(--vault-motion-easing),opacity var(--vault-motion-normal) var(--vault-motion-easing),visibility var(--vault-motion-normal) }
.ln-vault .ln-vault-action[data-open=true] .ln-vault-disclosure { grid-template-rows:1fr;opacity:1;visibility:visible }
.ln-vault .ln-vault-disclosure-body { overflow:hidden;min-height:0 }
.ln-vault form { display:grid;gap:calc(var(--vault-space)*4);padding:calc(var(--vault-space)*2) calc(var(--vault-space)*4) calc(var(--vault-space)*4) }
.ln-vault label,.ln-vault .ln-vault-field { display:grid;gap:calc(var(--vault-space)*2);color:var(--vault-secondary);font-size:.9em }
.ln-vault input { padding:calc(var(--vault-space)*2.5) calc(var(--vault-space)*3);color:var(--vault-text);caret-color:var(--vault-caret) }
.ln-vault .ln-vault-folder { display:flex;align-items:center;gap:var(--vault-space);padding:var(--vault-space);background:var(--control-background);border:var(--vault-border) solid var(--control-field-border);border-radius:var(--control-radius);
 transition:border-color var(--vault-motion-fast) var(--vault-motion-easing) }
.ln-vault .ln-vault-folder:focus-within { border-color:var(--vault-focus) }
.ln-vault .ln-vault-path { padding-inline:calc(var(--vault-space)*2);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--vault-text) }
.ln-vault .ln-vault-path[data-empty=true] { color:var(--vault-secondary) }
.ln-vault .ln-vault-folder button { padding:calc(var(--vault-space)*2);justify-content:center;flex-shrink:0 }
.ln-vault .ln-vault-folder button:focus-visible { outline:none }
.ln-vault .ln-vault-folder button span { display:none }
.ln-vault .ln-vault-next { justify-self:end;background:var(--vault-accent);color:var(--vault-on-accent);padding:calc(var(--vault-space)*2) calc(var(--vault-space)*4) }
.ln-vault .ln-vault-next:disabled { background:var(--control-hover);color:var(--vault-secondary);opacity:1 }
.ln-vault .ln-vault-next svg { order:1 }
.ln-vault [role=alert] { color:var(--vault-error) }
.ln-vault .ln-vault-message { margin-top:calc(var(--vault-space)*4) }
.ln-vault .ln-vault-status { min-height:1.5em;margin-bottom:calc(var(--vault-space)*4);font-size:.9em;overflow-wrap:anywhere }
.ln-vault .ln-vault-status:empty { visibility:hidden }
.ln-vault .ln-vault-status:focus { outline:none }
.ln-vault .ln-vault-next:enabled:active { background:var(--vault-accent-hover) }
@media(hover:hover) {
 .ln-vault .ln-vault-next:enabled:hover:not(:active) { background:var(--vault-accent-hover) }
 .ln-vault li button[aria-current=true]:enabled:hover:not(:active) { box-shadow:inset 0 0 0 var(--vault-border) color-mix(in srgb,var(--vault-accent) 60%,transparent) }
}
@media(prefers-reduced-motion:reduce) { .ln-vault .ln-vault-disclosure,.ln-vault .ln-vault-toggle > svg:last-child,.ln-vault .ln-vault-folder { transition:none } }
@container(max-height:44rem) {
 .ln-vault .ln-vault-main { padding:calc(var(--vault-space)*4) }
 .ln-vault pre { margin-bottom:calc(var(--vault-space)*3) }
 .ln-vault .ln-vault-status:empty { min-height:0;margin-bottom:0 }
 .ln-vault .ln-vault-toggle { padding-block:calc(var(--vault-space)*3) }
 .ln-vault form { gap:calc(var(--vault-space)*3) }
}
@container(max-width:40rem) {
 .ln-vault { grid-template-columns:minmax(0,1fr);grid-template-rows:auto auto;align-content:start }
 .ln-vault .ln-vault-main { grid-row:1;overflow:visible;padding:calc(var(--vault-space)*4) }
 .ln-vault .ln-vault-recents { overflow:visible }
 .ln-vault .ln-vault-main::before { display:none }
}
`;
