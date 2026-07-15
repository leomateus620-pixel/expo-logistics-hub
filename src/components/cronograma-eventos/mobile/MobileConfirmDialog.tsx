import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog';

export function MobileConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Continuar editando',
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <AlertDialogPrimitive.Root open={open} onOpenChange={(nextOpen) => !nextOpen && onCancel()}>
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay className="cronograma-mobile-confirm-overlay" />
        <AlertDialogPrimitive.Content className="cronograma-mobile-confirm-dialog">
          <AlertDialogPrimitive.Title className="text-lg font-black tracking-tight text-foreground">
            {title}
          </AlertDialogPrimitive.Title>
          <AlertDialogPrimitive.Description className="mt-2 text-sm leading-6 text-muted-foreground">
            {description}
          </AlertDialogPrimitive.Description>
          <div className="mt-5 grid gap-2">
            <AlertDialogPrimitive.Cancel asChild>
              <button type="button" className="cronograma-mobile-confirm-button is-secondary focus-ring">
                {cancelLabel}
              </button>
            </AlertDialogPrimitive.Cancel>
            <AlertDialogPrimitive.Action asChild>
              <button type="button" onClick={onConfirm} className="cronograma-mobile-confirm-button is-danger focus-ring">
                {confirmLabel}
              </button>
            </AlertDialogPrimitive.Action>
          </div>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  );
}
