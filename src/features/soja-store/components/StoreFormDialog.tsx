import { useCallback, useEffect, useId, useImperativeHandle, useRef, useState, type ReactNode, type Ref } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useUnsavedStoreForm } from "../hooks/useUnsavedStoreForm";
import "../soja-store.css";

const discardMessage = "Descartar as alterações que ainda não foram salvas?";

export type StoreFormDialogHandle = { finish: (afterClose: () => void) => void };

export function StoreFormDialog({
  title, description, size = "default", onClose, dirty = false, busy = false,
  initialFocus = "field", formId, submitLabel = "Salvar", submitDisabled = false, footerDetails, handle, children,
}: {
  title: string;
  description?: string;
  size?: "small" | "default" | "wide";
  onClose: () => void;
  dirty?: boolean;
  busy?: boolean;
  initialFocus?: "field" | "title";
  formId: string;
  submitLabel?: string;
  submitDisabled?: boolean;
  footerDetails?: ReactNode;
  handle?: Ref<StoreFormDialogHandle>;
  children: ReactNode;
}) {
  const marker = useId();
  const panel = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const completion = useRef<(() => void) | null>(null);
  const historyEffect = useRef(0);
  const controls = useRef({ dirty, busy, onClose });
  controls.current = { dirty, busy, onClose };
  const [viewportStyle, setViewportStyle] = useState<{ top: number; height: number }>();
  useUnsavedStoreForm(dirty || busy);

  const restoreFocus = useCallback(() => {
    window.requestAnimationFrame(() => {
      const previous = previousFocus.current;
      if (previous?.isConnected && previous !== document.body) {
        previous.focus({ preventScroll: true });
        if (document.activeElement === previous) return;
      }
      const fallback = document.querySelector<HTMLElement>("[data-ss-create-trigger]:not(:disabled)")
        ?? document.querySelector<HTMLElement>(".ss-heading h1");
      fallback?.focus({ preventScroll: true });
    });
  }, []);

  const mayClose = useCallback(() => {
    const current = controls.current;
    return !current.busy && (!current.dirty || window.confirm(discardMessage));
  }, []);

  // BrowserRouter's Back stays on the list while the dialog handles dismissal.
  useEffect(() => {
    const version = ++historyEffect.current;
    const url = window.location.href;
    const baseState = window.history.state;
    const entry = { ...baseState, sojaStoreDialog: marker };
    if (baseState?.sojaStoreDialog !== marker) window.history.pushState(entry, "", url);
    function onBack(event: PopStateEvent) {
      if (window.location.href !== url || event.state?.sojaStoreDialog === marker) return;
      const confirmed = completion.current;
      if (!confirmed && !mayClose()) {
        window.history.pushState(entry, "", url);
        return;
      }
      completion.current = null;
      (confirmed ?? controls.current.onClose)();
    }
    window.addEventListener("popstate", onBack);
    return () => {
      window.removeEventListener("popstate", onBack);
      // A confirmed save can unmount the editor directly.
      if (window.location.href === url && window.history.state?.sojaStoreDialog === marker) {
        queueMicrotask(() => {
          if (historyEffect.current === version && window.location.href === url && window.history.state?.sojaStoreDialog === marker) {
            window.history.back();
          }
        });
      }
    };
  }, [marker, mayClose]);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const adjust = () => {
      setViewportStyle(window.innerHeight - viewport.height > 48 && viewport.scale === 1
        ? { top: viewport.offsetTop, height: viewport.height }
        : undefined);
    };
    adjust();
    viewport.addEventListener("resize", adjust);
    viewport.addEventListener("scroll", adjust);
    return () => {
      viewport.removeEventListener("resize", adjust);
      viewport.removeEventListener("scroll", adjust);
    };
  }, []);

  const finish = useCallback((afterClose: () => void) => {
    if (completion.current) return;
    if (window.history.state?.sojaStoreDialog === marker) {
      completion.current = afterClose;
      window.history.back();
    } else afterClose();
  }, [marker]);
  useImperativeHandle(handle, () => ({ finish }), [finish]);

  function requestClose() {
    if (completion.current || !mayClose()) return;
    finish(onClose);
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) requestClose(); }}>
      <DialogContent ref={panel} className="ss-page ss-form-dialog" data-size={size} closeDisabled={busy}
        viewportClassName="ss-dialog-viewport" overlayClassName="ss-dialog-overlay" viewportStyle={viewportStyle}
        onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") event.stopPropagation();
        }}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
          const first = panel.current?.querySelector<HTMLElement>("form input:not([type=hidden]):not(:disabled), form select:not(:disabled), form textarea:not(:disabled)");
          (initialFocus === "field" && first ? first : heading.current)?.focus({ preventScroll: true });
        }}
        onCloseAutoFocus={(event) => { event.preventDefault(); restoreFocus(); }}>
        <header className="ss-dialog-header">
          <DialogTitle ref={heading} tabIndex={-1}>{title}</DialogTitle>
          <DialogDescription className={description ? undefined : "sr-only"}>
            {description ?? "Preencha os campos e salve para voltar à lista."}
          </DialogDescription>
        </header>
        <div className="ss-dialog-body" aria-busy={busy}>{children}</div>
        <footer className="ss-dialog-footer">
          {footerDetails && <div className="mr-auto min-w-0">{footerDetails}</div>}
          <Button type="button" variant="outline" onClick={requestClose} disabled={busy}>Cancelar</Button>
          <Button type="submit" className="ss-primary" form={formId} disabled={busy || submitDisabled}>
            {busy ? "Salvando…" : submitLabel}
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
