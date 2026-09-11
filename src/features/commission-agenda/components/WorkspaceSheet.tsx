import type { ReactNode } from 'react';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

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
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={cn('unit-workspace ua-sheet w-full sm:w-full', wide && 'ua-sheet--wide', className)}
        closeLabel="Fechar"
      >
        <div className="ua-sheet__header">
          <div className="ua-sheet__header-title">
            {eyebrow && <span className="ws-label">{eyebrow}</span>}
            <SheetTitle className="ws-section-title truncate" style={{ color: 'var(--text-primary)' }}>{title}</SheetTitle>
            {description ? (
              <SheetDescription className="ws-meta-secondary">{description}</SheetDescription>
            ) : (
              <SheetDescription className="sr-only">{title}</SheetDescription>
            )}
          </div>
          {headerAside}
        </div>
        <div className="ua-sheet__body">{children}</div>
        {footer && <div className="ua-sheet__footer">{footer}</div>}
      </SheetContent>
    </Sheet>
  );
}
