import { useEffect } from "react";

export function useUnsavedStoreForm(unsaved: boolean) {
  useEffect(() => {
    if (!unsaved) return;
    function warnBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    function guardNavigation(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(link instanceof HTMLAnchorElement) || link.target || link.hasAttribute("download")) return;
      if (link.origin === window.location.origin && link.pathname === window.location.pathname && link.search === window.location.search) return;
      if (window.confirm("Descartar as alterações que ainda não foram salvas?")) return;
      event.preventDefault();
      event.stopPropagation();
    }
    window.addEventListener("beforeunload", warnBeforeUnload);
    document.addEventListener("click", guardNavigation, true);
    return () => {
      window.removeEventListener("beforeunload", warnBeforeUnload);
      document.removeEventListener("click", guardNavigation, true);
    };
  }, [unsaved]);
}
