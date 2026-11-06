/** Shared kit controls. Consumers map semantic theme tokens on their surface. */
export const controlStyle = `
.ln-control-button, .ln-control-input { box-sizing:border-box;max-width:100%;font:inherit;color:inherit;border-radius:var(--control-radius); }
.ln-control-button { display:flex;align-items:center;gap:var(--control-gap);border:0;background:transparent;padding:var(--control-padding);cursor:pointer;text-align:start;overflow-wrap:anywhere;
 transition:box-shadow var(--control-fast) var(--control-easing),background-color var(--control-fast) var(--control-easing),color var(--control-fast) var(--control-easing),opacity var(--control-fast) var(--control-easing); }
.ln-control-button:focus { outline:none; }
.ln-control-button:focus-visible { outline:var(--control-focus-width) solid var(--control-focus);outline-offset:var(--control-focus-offset); }
.ln-control-button:disabled { cursor:default;color:var(--control-secondary);opacity:.55; }
.ln-control-button:enabled:active { background:var(--control-pressed); }
.ln-control-input { width:100%;padding:var(--control-padding);border:var(--control-border-width) solid var(--control-field-border,var(--control-border));background:var(--control-background);user-select:text;outline:none;
 transition:border-color var(--control-fast) var(--control-easing),background-color var(--control-fast) var(--control-easing); }
.ln-control-input:focus { border-color:var(--control-focus); }
.ln-control-input::selection { background:var(--control-selection);color:var(--control-text); }
.ln-control-input:disabled { opacity:.55; }
@media(hover:hover) { .ln-control-button:enabled:hover:not(:active) { box-shadow:inset 0 0 0 var(--control-border-width) color-mix(in srgb,var(--control-border) 45%,transparent); } }
@media(prefers-reduced-motion:reduce) { .ln-control-button,.ln-control-input { transition:none; } }
`;
