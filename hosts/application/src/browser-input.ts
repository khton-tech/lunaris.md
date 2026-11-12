import { observeVirtualKeyboard, usesTouchInput } from "@lunaris/components";
import type { KeyboardViewport } from "@lunaris/components";

export function bindBrowserInput(window: Window): () => void {
  const { document } = window;
  const shell = document.body;
  const contextMenu = (event: MouseEvent) => {
    if (!usesTouchInput(window, event)) event.preventDefault();
  };
  document.addEventListener("contextmenu", contextMenu, true);
  const update = (viewport: KeyboardViewport | null) => {
    if (viewport) {
      shell.style.setProperty("--keyboard-viewport-height", `${viewport.height}px`);
      shell.style.setProperty("--keyboard-viewport-top", `${viewport.top}px`);
    } else {
      shell.style.removeProperty("--keyboard-viewport-height");
      shell.style.removeProperty("--keyboard-viewport-top");
    }
    shell.toggleAttribute("data-keyboard-viewport", viewport !== null);
  };
  const unsubscribe = observeVirtualKeyboard(window, update);
  return () => {
    unsubscribe();
    document.removeEventListener("contextmenu", contextMenu, true);
    update(null);
  };
}
