/** Scoped product styles. All colors and geometry are inherited theme tokens. */
export const selectorStyle = `
.ln-vault { display:grid;grid-template-columns:minmax(0,1fr) minmax(0,2fr);flex:1 1 0%;min-height:0;min-width:0;overflow:auto;
 background:var(--vault-background);color:var(--vault-text);font-family:var(--vault-font);font-size:var(--vault-font-size);line-height:var(--vault-line-height);user-select:none }
.ln-vault * { box-sizing:border-box;min-width:0 }
.ln-vault [hidden] { display:none!important }
.ln-vault button,.ln-vault input { font:inherit;color:inherit }
.ln-vault button { display:flex;align-items:center;gap:calc(var(--vault-space)*3);border:var(--vault-border) solid transparent;border-radius:var(--vault-radius);background:transparent;padding:calc(var(--vault-space)*3);cursor:pointer;text-align:start;overflow-wrap:anywhere }
.ln-vault button:enabled:hover { background:var(--vault-hover) }
.ln-vault :is(button,input):focus-visible { outline:var(--vault-focus-width) solid var(--vault-focus);outline-offset:var(--vault-focus-offset) }
.ln-vault button:disabled { opacity:.5;cursor:default }
.ln-vault svg { width:1.25em;height:1.25em;flex-shrink:0 }
.ln-vault .ln-vault-recents { background:var(--vault-panel);border-inline-end:var(--vault-border) solid var(--vault-separator);padding:clamp(1rem,4cqw,2.5rem);overflow-wrap:anywhere }
.ln-vault h2 { font-size:1em;font-weight:500;margin:0 0 calc(var(--vault-space)*5) }
.ln-vault p { margin:0;color:var(--vault-secondary);overflow-wrap:anywhere }
.ln-vault ul { list-style:none;padding:0;margin:0;display:grid;gap:var(--vault-space) }
.ln-vault li button { width:100% }
.ln-vault .ln-vault-recent-text { display:grid;gap:var(--vault-space);flex:1 }
.ln-vault small { font:inherit;font-size:.85em;color:var(--vault-secondary);overflow-wrap:anywhere }
.ln-vault .ln-vault-main { display:flex;flex-direction:column;justify-content:safe center;align-items:center;padding:clamp(1rem,5cqw,4rem);gap:calc(var(--vault-space)*8) }
.ln-vault .ln-vault-content { width:100%;max-width:34rem;container-type:inline-size }
.ln-vault pre { font-family:var(--vault-mono);font-size:min(10px,1.85cqw);line-height:1.2;white-space:pre;margin:0 0 calc(var(--vault-space)*10);text-align:center;max-width:100%;overflow:hidden }
.ln-vault .ln-vault-actions { display:grid;gap:calc(var(--vault-space)*3) }
.ln-vault .ln-vault-action { border:var(--vault-border) solid var(--vault-separator);border-radius:var(--vault-radius);overflow:hidden }
.ln-vault .ln-vault-toggle { width:100%;padding:calc(var(--vault-space)*4) }
.ln-vault .ln-vault-toggle span { flex:1 }
.ln-vault .ln-vault-toggle[aria-expanded=true] > svg:last-child { transform:rotate(90deg) }
.ln-vault form { display:grid;gap:calc(var(--vault-space)*4);padding:0 calc(var(--vault-space)*4) calc(var(--vault-space)*4);animation:ln-vault-reveal .14s ease-out }
.ln-vault label { display:grid;gap:calc(var(--vault-space)*2);color:var(--vault-secondary);font-size:.9em }
.ln-vault input { width:100%;padding:calc(var(--vault-space)*2.5) calc(var(--vault-space)*3);border:var(--vault-border) solid var(--vault-control-border);border-radius:var(--vault-radius);background:var(--vault-background);user-select:text }
.ln-vault .ln-vault-folder { display:flex;gap:calc(var(--vault-space)*2) }
.ln-vault .ln-vault-folder button { border-color:var(--vault-control-border);justify-content:center;flex-shrink:0 }
.ln-vault .ln-vault-folder button span { display:none }
.ln-vault .ln-vault-next { justify-self:end;background:var(--vault-accent);color:var(--vault-on-accent);padding-inline:calc(var(--vault-space)*4) }
.ln-vault .ln-vault-next:enabled:hover { background:var(--vault-accent-hover) }
.ln-vault .ln-vault-next svg { order:1 }
.ln-vault .ln-vault-message { margin-top:calc(var(--vault-space)*4) }
.ln-vault .ln-vault-status { margin-bottom:calc(var(--vault-space)*5);overflow-wrap:anywhere }
@keyframes ln-vault-reveal { from { opacity:0;transform:translateY(-.25rem) } to { opacity:1;transform:translateY(0) } }
@media(prefers-reduced-motion:reduce) { .ln-vault form { animation:none } }
@container(max-width:40rem) { .ln-vault { grid-template-columns:minmax(0,1fr) } .ln-vault .ln-vault-main { grid-row:1;padding-block:calc(var(--vault-space)*8) } .ln-vault .ln-vault-recents { border-inline-end:0;border-block-start:var(--vault-border) solid var(--vault-separator) } }
`;
