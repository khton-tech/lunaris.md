import { useLayoutEffect, useRef } from "react";

/** Center resting actions while reserving room for the largest inline form. */
export function useVaultActionAlignment(disclosureSelector: string, formSelector: string, layoutKey: boolean, enabled = true) {
  const main = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const panel = main.current;
    const body = content.current;
    const view = panel?.ownerDocument.defaultView;
    if (!enabled || !panel || !body || !view?.ResizeObserver) return;
    const disclosures = [...body.querySelectorAll<HTMLElement>(disclosureSelector)];
    const forms = [...body.querySelectorAll<HTMLElement>(formSelector)];
    const observer = new view.ResizeObserver(() => {
      const padding = view.getComputedStyle(panel);
      const available = panel.clientHeight - parseFloat(padding.paddingTop) - parseFloat(padding.paddingBottom);
      const resting = body.offsetHeight - disclosures.reduce((sum, item) => sum + item.offsetHeight, 0);
      const expansion = Math.max(0, ...forms.map(form => {
        const style = view.getComputedStyle(form);
        return form.offsetHeight + parseFloat(style.marginTop) + parseFloat(style.marginBottom);
      }));
      const offset = `${Math.max(0, Math.min((available - resting) / 2, available - resting - expansion))}px`;
      if (panel.style.getPropertyValue("--vault-center-offset") !== offset) panel.style.setProperty("--vault-center-offset", offset);
    });
    observer.observe(panel);
    observer.observe(body);
    for (const form of forms) observer.observe(form);
    return () => observer.disconnect();
  }, [disclosureSelector, formSelector, layoutKey, enabled]);
  return { main, content };
}
