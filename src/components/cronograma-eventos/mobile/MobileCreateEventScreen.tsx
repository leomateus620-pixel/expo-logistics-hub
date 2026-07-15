import { useEffect, useId, useState } from 'react';
import { CalendarDays, Loader2, Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EventForm } from '../EventForm';
import type { CronogramaEvent } from '../types';
import { MobileConfirmDialog } from './MobileConfirmDialog';
import { MobileDialogFrame } from './MobileDialogFrame';
import { useMobileOverlayHistory } from './useMobileOverlayHistory';

export function MobileCreateEventScreen({
  open,
  onOpenChange,
  onSubmit,
  isSaving = false,
  submitError,
  defaultYear = 2026,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (event: CronogramaEvent) => Promise<void> | void;
  isSaving?: boolean;
  submitError?: string | null;
  defaultYear?: CronogramaEvent['year'];
}) {
  const formId = `cronograma-mobile-create-${useId().replace(/:/g, '')}`;
  const [dirty, setDirty] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [localSaving, setLocalSaving] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const saving = isSaving || localSaving;

  const overlayHistory = useMobileOverlayHistory({
    open,
    dirty: dirty || saving,
    onClose: () => onOpenChange(false),
    onDirtyClose: () => {
      if (!saving) setConfirmDiscard(true);
    },
  });

  useEffect(() => {
    if (!open) return;
    setDirty(false);
    setConfirmDiscard(false);
    setLocalSaving(false);
    setLocalError(null);
  }, [open]);

  const requestClose = () => {
    if (saving) return;
    overlayHistory.requestClose();
  };

  const handleSubmit = async (event: CronogramaEvent) => {
    if (saving) return;
    setLocalSaving(true);
    setLocalError(null);
    try {
      await onSubmit(event);
      setDirty(false);
      overlayHistory.discardAndClose();
    } catch (error) {
      setLocalError(
        error instanceof Error
          ? error.message
          : 'Não foi possível criar o evento. Seus dados continuam no formulário.',
      );
    } finally {
      setLocalSaving(false);
    }
  };

  return (
    <>
      <MobileDialogFrame
        open={open}
        title="Novo evento do cronograma"
        eyebrow="Cadastro operacional"
        description="Comece pelas informações essenciais. A data e os detalhes complementares podem ser definidos depois."
        onRequestClose={requestClose}
        closeDisabled={saving}
        closeLabel="Fechar criação de evento"
        testId="cronograma-mobile-create-dialog"
        footer={(
          <div className="cronograma-mobile-event-actions is-editing">
            <Button type="button" variant="outline" onClick={requestClose} disabled={saving} className="rounded-xl">
              <X className="h-4 w-4" />Cancelar
            </Button>
            <Button type="submit" form={formId} disabled={saving} className="rounded-xl">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? 'Criando…' : 'Criar evento'}
            </Button>
          </div>
        )}
      >
        <div className="mb-3 flex items-center gap-3 rounded-xl border border-primary/10 bg-primary/[0.045] p-3">
          <span className="cronograma-mobile-info-icon" aria-hidden="true"><CalendarDays className="h-4 w-4" /></span>
          <p className="text-xs leading-5 text-foreground/75">
            É possível salvar uma ação sem data e completar o planejamento quando a decisão estiver confirmada.
          </p>
        </div>
        <EventForm
          formId={formId}
          presentation="mobile"
          onSubmit={handleSubmit}
          onCancel={requestClose}
          showActions={false}
          isSaving={saving}
          submitError={localError || submitError}
          onDirtyChange={setDirty}
          defaultYear={defaultYear}
        />
      </MobileDialogFrame>

      <MobileConfirmDialog
        open={confirmDiscard}
        title="Descartar novo evento?"
        description="Os dados preenchidos ainda não foram salvos no cronograma."
        confirmLabel="Descartar cadastro"
        onConfirm={() => {
          setConfirmDiscard(false);
          setDirty(false);
          overlayHistory.discardAndClose();
        }}
        onCancel={() => setConfirmDiscard(false)}
      />
    </>
  );
}
