/** Preserve overflow access without visible scrollbar chrome on kit-owned DOM. */
export const surfaceStyle = `
.ln-surface,.ln-surface * { scrollbar-width:none }
.ln-surface::-webkit-scrollbar,.ln-surface *::-webkit-scrollbar { display:none;width:0;height:0 }
`;
