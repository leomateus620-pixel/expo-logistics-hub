import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

// A detail -> edit transition shares the original page opener, even after the
// detail's edit button unmounts. The entries live only for the mounted elements.
const sheetOpeners = new WeakMap<HTMLElement, HTMLElement>();

export interface WorkspaceSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eyebrow?: string;
  title: string;
  description?: string;
  /** Optional element rendered in the header next to the title. */
  headerAside?: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  children: ReactNode;
  className?: string;
}

/**
 * Right-side panel on desktop, full-screen page on mobile. Shares the same
 * chrome (header, scrollable body, sticky footer) across detail, form and
 * filters so every overlay in the workspace behaves the same way.
 */
export function WorkspaceSheet({ open, onOpenChange, eyebrow, title, description, headerAside, footer, wide = false, children, className }: WorkspaceSheetProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [viewportStyle, setViewportStyle] = useState<CSSProperties>();
  useEffect(() => {
    if (!open) return;
    const viewport = window.visualViewport;
    const syncViewport = () => {
      setViewportStyle(window.innerWidth < 640 && viewport ? { top: viewport.offsetTop, height: viewport.height, bottom: 'auto' } : undefined);
    };
    syncViewport();
    window.addEventListener('resize', syncViewport);
    viewport?.addEventListener('resize', syncViewport);
    viewport?.addEventListener('scroll', syncViewport);
    return () => {
      window.removeEventListener('resize', syncViewport);
      viewport?.removeEventListener('resize', syncViewport);
      viewport?.removeEventListener('scroll', syncViewport);
    };
  }, [open]);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        ref={contentRef}
        side="right"
        className={cn('unit-workspace ua-sheet w-full sm:w-full', wide && 'ua-sheet--wide', className)}
        overlayClassName="commission-workspace-sheet-overlay"
        style={viewportStyle}
        onEscapeKeyDown={(event) => {
          // Let an open inline selector consume Escape before dismissing the form.
          if (event.target instanceof HTMLElement && event.target.closest('.ua-relation[data-open="true"]')) event.preventDefault();
        }}
        closeLabel="Fechar"
        // Focus the scrollable body instead of the first action so the panel
        // opens without a highlighted button; keyboard users start from the top.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          const active = document.activeElement;
          if (active instanceof HTMLElement) {
            const previousSheet = active.closest<HTMLElement>('.unit-workspace.ua-sheet');
            returnFocusRef.current = previousSheet ? sheetOpeners.get(previousSheet) ?? active : active;
            if (contentRef.current) sheetOpeners.set(contentRef.current, returnFocusRef.current);
          }
          bodyRef.current?.focus({ preventScroll: true });
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const closingSheet = event.target instanceof HTMLElement ? event.target : null;
          const opener = (closingSheet ? sheetOpeners.get(closingSheet) : null) ?? returnFocusRef.current;
          // Closing the detail must not steal focus from the edit form opening.
          const anotherDialog = document.querySelector<HTMLElement>('[role="dialog"][data-state="open"]');
          if (anotherDialog?.matches('.unit-workspace.ua-sheet') && opener?.isConnected) {
            // React may have removed the detail before the form captures focus.
            sheetOpeners.set(anotherDialog, opener);
          } else if (!anotherDialog && opener?.isConnected) {
            opener.focus({ preventScroll: true });
          }
        }}
      >
        <div className="ua-sheet__header">
          <div className="ua-sheet__header-title">
            {eyebrow && <span className="ws-label">{eyebrow}</span>}
            <SheetTitle className="ws-section-title" style={{ color: 'var(--text-primary)' }}>{title}</SheetTitle>
            {description ? (
              <SheetDescription className="ws-meta-secondary">{description}</SheetDescription>
            ) : (
              <SheetDescription className="sr-only">{title}</SheetDescription>
            )}
          </div>
          {headerAside}
        </div>
        <div ref={bodyRef} className="ua-sheet__body" tabIndex={-1}>{children}</div>
        {footer && <div className="ua-sheet__footer">{footer}</div>}
      </SheetContent>
    </Sheet>
  );
}
