import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { CSSProperties, ReactNode, RefObject } from 'react';
import { resolveCronogramaReturnFocus } from '@/lib/cronograma-focus';
import { useMobileViewport } from './useMobileViewport';

interface MobileDialogFrameProps {
  open: boolean;
  title: string;
  eyebrow?: string;
  description?: string;
  headerContent?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  onRequestClose: () => void;
  closeLabel?: string;
  returnFocusRef?: RefObject<HTMLElement>;
  testId?: string;
  closeDisabled?: boolean;
}

export function MobileDialogFrame({
  open,
  title,
  eyebrow,
  description,
  headerContent,
  children,
  footer,
  onRequestClose,
  closeLabel = 'Fechar painel',
  returnFocusRef,
  testId,
  closeDisabled = false,
}: MobileDialogFrameProps) {
  const viewport = useMobileViewport();
  const viewportStyle = {
    '--cronograma-mobile-viewport-height': viewport.height ? `${viewport.height}px` : '100dvh',
    '--cronograma-mobile-viewport-offset': `${viewport.offsetTop}px`,
  } as CSSProperties;

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !closeDisabled) onRequestClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="cronograma-mobile-dialog-overlay" />
        <DialogPrimitive.Content
          className="cronograma-mobile-dialog"
          style={viewportStyle}
          data-keyboard-open={viewport.keyboardOpen || undefined}
          data-testid={testId}
          onEscapeKeyDown={(event) => {
            event.preventDefault();
            if (!closeDisabled) onRequestClose();
          }}
          onPointerDownOutside={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => {
            const focusTarget = resolveCronogramaReturnFocus(returnFocusRef?.current);
            if (!focusTarget) return;
            event.preventDefault();
            focusTarget.focus({ preventScroll: true });
          }}
        >
          <header className="cronograma-mobile-dialog-header">
            <div className="cronograma-mobile-dialog-heading">
              {headerContent ?? (
                <>
                  {eyebrow && <p className="cronograma-mobile-dialog-eyebrow">{eyebrow}</p>}
                  <DialogPrimitive.Title className="cronograma-mobile-dialog-title">
                    {title}
                  </DialogPrimitive.Title>
                  {description && (
                    <DialogPrimitive.Description className="cronograma-mobile-dialog-description">
                      {description}
                    </DialogPrimitive.Description>
                  )}
                </>
              )}
              {headerContent && <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>}
              {headerContent && description && (
                <DialogPrimitive.Description className="sr-only">{description}</DialogPrimitive.Description>
              )}
            </div>
            <button
              type="button"
              onClick={onRequestClose}
              disabled={closeDisabled}
              className="cronograma-mobile-dialog-close focus-ring"
              aria-label={closeLabel}
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </header>

          <div className="cronograma-mobile-dialog-body" data-testid={testId ? `${testId}-scroll` : undefined}>
            {children}
          </div>

          {footer && <footer className="cronograma-mobile-dialog-footer">{footer}</footer>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
