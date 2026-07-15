import { useEffect, useMemo, useState, type RefObject } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  Check,
  CheckCircle2,
  Edit3,
  FileClock,
  History,
  Layers3,
  Loader2,
  LockKeyhole,
  MapPin,
  Route,
  Save,
  Sparkles,
  UserRound,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getSubeventProgress } from '@/lib/cronograma-timeline';
import { cn } from '@/lib/utils';
import {
  CronogramaCategoryMarker,
  CronogramaMetaBadge,
  CronogramaPriorityIndicator,
  CronogramaStatusIndicator,
} from '../CronogramaBadges';
import { formatLongDate, formatLongDateRange } from '../dateUtils';
import { EventForm } from '../EventForm';
import type { CronogramaEvent, CronogramaHistoryEntry } from '../types';
import { MobileConfirmDialog } from './MobileConfirmDialog';
import { MobileDialogFrame } from './MobileDialogFrame';
import { useMobileOverlayHistory } from './useMobileOverlayHistory';

type DiscardTarget = 'close' | 'read' | null;

export function MobileEventScreen({
  event,
  open,
  onOpenChange,
  onSave,
  startInEdit = false,
  canManage = false,
  returnFocusRef,
  history = [],
  historyLoading = false,
  historyError,
  canViewHistory = false,
  sourceUnavailable = false,
}: {
  event: CronogramaEvent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (event: CronogramaEvent) => Promise<void> | void;
  startInEdit?: boolean;
  canManage?: boolean;
  returnFocusRef?: RefObject<HTMLElement>;
  history?: CronogramaHistoryEntry[];
  historyLoading?: boolean;
  historyError?: unknown;
  canViewHistory?: boolean;
  sourceUnavailable?: boolean;
}) {
  const [editMode, setEditMode] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [discardTarget, setDiscardTarget] = useState<DiscardTarget>(null);
  const eventIdentity = event?.sourceKey ?? event?.id;

  useEffect(() => {
    if (!open) return;
    setEditMode(startInEdit && canManage);
    setDirty(false);
    setSaving(false);
    setSaveError(null);
    setDiscardTarget(null);
  }, [canManage, eventIdentity, open, startInEdit]);

  const progress = useMemo(() => (event ? getSubeventProgress(event) : null), [event]);
  const overlayHistory = useMobileOverlayHistory({
    open: open && Boolean(event),
    dirty: (editMode && dirty) || saving,
    onClose: () => onOpenChange(false),
    onDirtyClose: () => {
      if (!saving) setDiscardTarget('close');
    },
  });
  const requestOverlayClose = overlayHistory.requestClose;

  useEffect(() => {
    if (!open || !sourceUnavailable || saving) return;
    requestOverlayClose();
  }, [open, requestOverlayClose, saving, sourceUnavailable]);

  if (!event) return null;

  const performSave = async (nextEvent: CronogramaEvent, leaveEditMode = true) => {
    if (saving) return;
    if (sourceUnavailable) {
      setSaveError('Este evento não está mais disponível na base sincronizada. Revise os dados antes de descartar o formulário.');
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await onSave(nextEvent);
      setDirty(false);
      if (leaveEditMode) setEditMode(false);
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : 'Não foi possível salvar as alterações. Seus dados continuam no formulário.',
      );
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    if (saving) return;
    if (dirty) {
      setDiscardTarget('read');
      return;
    }
    setEditMode(false);
  };

  const handleConfirmDiscard = () => {
    const target = discardTarget;
    setDiscardTarget(null);
    setDirty(false);
    if (target === 'close') {
      overlayHistory.discardAndClose();
      return;
    }
    setEditMode(false);
  };

  const handleToggleSubevent = async (index: number) => {
    if (!canManage || saving || !event.subevents) return;
    const nextSubevents = event.subevents.map((subevent, itemIndex) => {
      if (itemIndex !== index) return subevent;
      return {
        ...subevent,
        status: subevent.status === 'completed' ? 'planned' as const : 'completed' as const,
      };
    });
    await performSave({ ...event, subevents: nextSubevents }, false);
  };

  const headerContent = (
    <>
      <div className="cronograma-mobile-event-header-meta">
        <CronogramaCategoryMarker category={event.category} />
        {event.isOfficial && <CronogramaMetaBadge icon={Sparkles} tone="gold">Oficial</CronogramaMetaBadge>}
        {event.isCentralMeeting && <CronogramaMetaBadge icon={Route} tone="green">Reunião central</CronogramaMetaBadge>}
      </div>
      <p className="cronograma-mobile-dialog-event-title">{event.title}</p>
      <div className="cronograma-mobile-event-statuses">
        <CronogramaStatusIndicator status={event.status} />
        <CronogramaPriorityIndicator priority={event.priority} />
        {editMode && <span className="cronograma-editing-badge"><Edit3 className="h-3.5 w-3.5" />Editando</span>}
      </div>
    </>
  );

  return (
    <>
      <MobileDialogFrame
        open={open}
        title={event.title}
        description={editMode ? 'Atualize os dados operacionais e salve as alterações.' : event.summary}
        headerContent={headerContent}
        onRequestClose={() => {
          if (!saving) overlayHistory.requestClose();
        }}
        closeDisabled={saving}
        closeLabel="Fechar detalhes do evento"
        returnFocusRef={returnFocusRef}
        testId="cronograma-mobile-event-dialog"
        footer={editMode ? (
          <div className="cronograma-mobile-event-actions is-editing">
            <Button type="button" variant="outline" onClick={handleCancelEdit} disabled={saving} className="rounded-xl">
              <X className="h-4 w-4" />Cancelar
            </Button>
            <Button type="submit" form="cronograma-mobile-event-form" disabled={saving || sourceUnavailable} className="rounded-xl">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? 'Salvando…' : 'Salvar'}
            </Button>
          </div>
        ) : (
          <div className="cronograma-mobile-event-actions">
            {!canManage ? (
              <Button type="button" variant="outline" onClick={overlayHistory.requestClose} className="is-wide rounded-xl">
                <LockKeyhole className="h-4 w-4" />Fechar detalhes
              </Button>
            ) : (
              <>
                {event.status !== 'completed' && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => performSave({ ...event, status: 'completed' }, false)}
                    disabled={saving}
                    className="is-wide rounded-xl"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    Marcar como concluído
                  </Button>
                )}
                <Button type="button" variant="outline" onClick={overlayHistory.requestClose} disabled={saving} className="rounded-xl">
                  Fechar
                </Button>
                <Button type="button" onClick={() => setEditMode(true)} disabled={saving} className="rounded-xl">
                  <Edit3 className="h-4 w-4" />Editar
                </Button>
              </>
            )}
          </div>
        )}
      >
        {sourceUnavailable && (
          <p className="cronograma-mobile-event-error" role="alert">
            Este evento não está mais disponível na base sincronizada. O rascunho local foi preservado para revisão antes do descarte.
          </p>
        )}
        {saveError && <p className="cronograma-mobile-event-error" role="alert">{saveError}</p>}

        {editMode ? (
          <EventForm
            event={event}
            formId="cronograma-mobile-event-form"
            presentation="mobile"
            onSubmit={(nextEvent) => performSave(nextEvent)}
            onCancel={handleCancelEdit}
            showActions={false}
            isSaving={saving}
            submitError={saveError}
            onDirtyChange={setDirty}
          />
        ) : (
          <div>
            <section className="cronograma-mobile-event-section" aria-labelledby="cronograma-mobile-essential-title">
              <p className="cronograma-mobile-section-kicker">Informações essenciais</p>
              <h2 id="cronograma-mobile-essential-title" className="mt-1 text-base font-black tracking-tight text-foreground">
                Quando, onde e com quem
              </h2>
              <div className="cronograma-mobile-info-list">
                <MobileInfo
                  icon={CalendarClock}
                  label="Data e horário"
                  value={`${formatLongDateRange(event.date, event.endDate)}${event.startTime ? ` · ${event.startTime}` : ''}${event.endTime ? ` às ${event.endTime}` : ''}`}
                />
                <MobileInfo icon={MapPin} label="Local" value={event.location || 'Local a definir'} />
                <MobileInfo icon={UserRound} label="Responsável" value={event.owner || 'Responsável a definir'} />
                <MobileInfo icon={Layers3} label="Comissão" value={event.commission || 'Comissão a definir'} />
              </div>
            </section>

            {(event.pendingReason || event.decisionNeeded || !event.date) && (
              <section className="cronograma-mobile-event-section" aria-labelledby="cronograma-mobile-pending-title">
                <div className="flex items-start gap-3">
                  <span className="cronograma-mobile-info-icon bg-amber-50 text-amber-800" aria-hidden="true">
                    <AlertTriangle className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="cronograma-mobile-section-kicker">Definição pendente</p>
                    <h2 id="cronograma-mobile-pending-title" className="mt-1 text-sm font-black text-foreground">
                      Próximo encaminhamento necessário
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-foreground/80">
                      {event.pendingReason || 'Este item ainda não possui data oficial definida.'}
                    </p>
                    {event.decisionNeeded && <p className="mt-2 text-sm font-semibold text-amber-950">{event.decisionNeeded}</p>}
                  </div>
                </div>
              </section>
            )}

            <section className="cronograma-mobile-event-section" aria-labelledby="cronograma-mobile-summary-title">
              <p className="cronograma-mobile-section-kicker">Descrição executiva</p>
              <h2 id="cronograma-mobile-summary-title" className="sr-only">Descrição do evento</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground/82">
                {event.summary || 'Nenhuma descrição executiva foi informada.'}
              </p>
            </section>

            {event.subevents && event.subevents.length > 0 && (
              <section className="cronograma-mobile-event-section" aria-labelledby="cronograma-mobile-subevents-title">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="cronograma-mobile-section-kicker">Checklist</p>
                    <h2 id="cronograma-mobile-subevents-title" className="mt-1 text-base font-black text-foreground">
                      Entregas e subeventos
                    </h2>
                  </div>
                  <span className="cronograma-progress-label">{progress?.completed ?? 0}/{progress?.total ?? 0}</span>
                </div>
                <div className="cronograma-progress-track mt-3" aria-label={`${progress?.percent ?? 0}% concluído`}>
                  <span style={{ width: `${progress?.percent ?? 0}%` }} />
                </div>
                <div className="mt-2">
                  {event.subevents.map((subevent, index) => {
                    const completed = subevent.status === 'completed';
                    return (
                      <div key={`${index}-${subevent.date ?? 'sem-data'}`} className="cronograma-mobile-subevent">
                        <button
                          type="button"
                          disabled={!canManage || saving || sourceUnavailable}
                          onClick={() => handleToggleSubevent(index)}
                          className={cn('cronograma-mobile-subevent-toggle focus-ring', completed && 'is-completed')}
                          aria-label={completed ? `Reabrir subevento ${subevent.title}` : `Concluir subevento ${subevent.title}`}
                        >
                          {completed ? <Check className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
                        </button>
                        <div className="min-w-0">
                          <p className={cn('text-sm font-bold leading-5 text-foreground', completed && 'line-through opacity-65')}>
                            {subevent.title}
                          </p>
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">
                            {subevent.date ? formatLongDate(subevent.date) : 'Sem data vinculada'}
                            {subevent.owner ? ` · ${subevent.owner}` : ''}
                          </p>
                        </div>
                        {subevent.status && <CronogramaStatusIndicator status={subevent.status} compact />}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            <section className="cronograma-mobile-event-section" aria-labelledby="cronograma-mobile-trace-title">
              <div className="flex items-start gap-3">
                <span className="cronograma-mobile-info-icon" aria-hidden="true"><FileClock className="h-4 w-4" /></span>
                <div className="min-w-0">
                  <p className="cronograma-mobile-section-kicker">Rastreabilidade</p>
                  <h2 id="cronograma-mobile-trace-title" className="mt-1 text-sm font-black text-foreground">Origem do registro</h2>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    {event.sourceSheet ? `Origem: ${event.sourceSheet}. ` : ''}
                    {event.updatedAt
                      ? `Atualizado em ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(event.updatedAt))}.`
                      : 'Registro consolidado a partir do cronograma oficial.'}
                  </p>
                </div>
              </div>
            </section>

            {canViewHistory && (
              <section className="cronograma-mobile-event-section" aria-labelledby="cronograma-mobile-history-title">
                <details>
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 focus-ring">
                    <span>
                      <span className="cronograma-mobile-section-kicker">Auditoria</span>
                      <span id="cronograma-mobile-history-title" className="mt-1 flex items-center gap-2 text-sm font-black text-foreground">
                        <History className="h-4 w-4 text-primary" />Histórico de alterações
                      </span>
                    </span>
                    {history.length > 0 && <span className="cronograma-progress-label">{history.length}</span>}
                  </summary>
                  {historyLoading ? (
                    <div className="mt-3 space-y-2" aria-busy="true" aria-label="Carregando histórico">
                      <div className="h-12 animate-pulse rounded-lg bg-slate-100" />
                      <div className="h-12 animate-pulse rounded-lg bg-slate-100" />
                    </div>
                  ) : historyError ? (
                    <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-950">
                      O histórico online não pôde ser carregado. Os dados do evento continuam disponíveis.
                    </p>
                  ) : history.length === 0 ? (
                    <p className="mt-3 text-xs leading-5 text-muted-foreground">Nenhuma alteração manual registrada.</p>
                  ) : (
                    <ol className="mt-3 space-y-2">
                      {history.slice(0, 5).map((entry) => (
                        <li key={entry.id} className="rounded-lg border border-border bg-slate-50/70 p-3">
                          <p className="text-xs font-bold text-foreground">
                            {entry.changedFields.length > 0 ? `Alteração em ${entry.changedFields.join(', ')}` : 'Dados atualizados'}
                          </p>
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            {entry.userLabel} · {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(entry.createdAt))}
                          </p>
                        </li>
                      ))}
                    </ol>
                  )}
                </details>
              </section>
            )}
          </div>
        )}
      </MobileDialogFrame>

      <MobileConfirmDialog
        open={discardTarget !== null}
        title="Descartar alterações?"
        description="As informações modificadas continuam somente neste formulário e ainda não foram salvas."
        confirmLabel={discardTarget === 'close' ? 'Descartar e fechar' : 'Descartar alterações'}
        onConfirm={handleConfirmDiscard}
        onCancel={() => setDiscardTarget(null)}
      />
    </>
  );
}

function MobileInfo({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CalendarClock;
  label: string;
  value: string;
}) {
  return (
    <div className="cronograma-mobile-info-item">
      <span className="cronograma-mobile-info-icon" aria-hidden="true"><Icon className="h-4 w-4" /></span>
      <div className="min-w-0">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
        <p className="mt-1 break-words text-sm font-semibold leading-5 text-foreground">{value}</p>
      </div>
    </div>
  );
}
