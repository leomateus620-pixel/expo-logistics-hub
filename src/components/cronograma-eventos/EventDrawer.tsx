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
import type { LucideIcon } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { getSubeventProgress } from '@/lib/cronograma-timeline';
import { cn } from '@/lib/utils';
import {
  CronogramaCategoryMarker,
  CronogramaMetaBadge,
  CronogramaPriorityIndicator,
  CronogramaStatusIndicator,
  EventIdentityStrip,
} from './CronogramaBadges';
import { EventForm } from './EventForm';
import { formatLongDate, formatLongDateRange } from './dateUtils';
import type { CronogramaEvent, CronogramaHistoryEntry } from './types';

interface EventDrawerProps {
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
}

export function EventDrawer({
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
}: EventDrawerProps) {
  const [editMode, setEditMode] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  useEffect(() => {
    if (!open) return;
    setEditMode(startInEdit && canManage);
    setDirty(false);
    setSaving(false);
    setSaveError(null);
    setConfirmDiscard(false);
  }, [canManage, event?.id, open, startInEdit]);

  const progress = useMemo(() => (event ? getSubeventProgress(event) : null), [event]);

  if (!event) return null;

  const closeDrawer = () => {
    setDirty(false);
    setConfirmDiscard(false);
    onOpenChange(false);
  };

  const requestClose = () => {
    if (saving) return;
    if (editMode && dirty) {
      setConfirmDiscard(true);
      return;
    }
    closeDrawer();
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      onOpenChange(true);
      return;
    }
    requestClose();
  };

  const handleSave = async (nextEvent: CronogramaEvent) => {
    setSaving(true);
    setSaveError(null);
    try {
      await onSave(nextEvent);
      setDirty(false);
      setEditMode(false);
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : 'Não foi possível salvar as alterações. Tente novamente.',
      );
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    if (dirty) {
      setConfirmDiscard(true);
      return;
    }
    setEditMode(false);
  };

  const handleMarkCompleted = async () => {
    await handleSave({ ...event, status: 'completed' });
  };

  return (
    <>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent
          className="cronograma-drawer"
          overlayClassName="cronograma-drawer-overlay"
          closeLabel="Fechar detalhes do evento"
          onCloseAutoFocus={(closeEvent) => {
            if (!returnFocusRef?.current) return;
            closeEvent.preventDefault();
            returnFocusRef.current.focus({ preventScroll: true });
          }}
          onEscapeKeyDown={(escapeEvent) => {
            if (saving) escapeEvent.preventDefault();
          }}
        >
          <div className="cronograma-drawer-header relative">
            <EventIdentityStrip event={event} className="left-0 inset-y-6" />
            <SheetHeader className="pr-11 text-left">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <CronogramaCategoryMarker category={event.category} />
                {event.isOfficial && (
                  <CronogramaMetaBadge icon={Sparkles} tone="gold">Oficial</CronogramaMetaBadge>
                )}
                {event.isCentralMeeting && (
                  <CronogramaMetaBadge icon={Route} tone="green">Reunião central</CronogramaMetaBadge>
                )}
              </div>
              <SheetTitle className="cronograma-drawer-title">{event.title}</SheetTitle>
              <SheetDescription className="cronograma-drawer-description">
                {editMode ? 'Atualize os dados operacionais e salve para registrar as alterações.' : event.summary}
              </SheetDescription>
            </SheetHeader>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <CronogramaStatusIndicator status={event.status} />
              <CronogramaPriorityIndicator priority={event.priority} />
              {editMode && (
                <span className="cronograma-editing-badge">
                  <Edit3 className="h-3.5 w-3.5" />
                  Modo de edição
                </span>
              )}
            </div>
          </div>

          <div className="cronograma-drawer-body" data-testid="cronograma-drawer-scroll">
            {saveError && !editMode && (
              <p className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-900" role="alert">
                {saveError}
              </p>
            )}
            {editMode ? (
              <EventForm
                event={event}
                formId="cronograma-drawer-edit-form"
                onSubmit={handleSave}
                onCancel={handleCancelEdit}
                showActions={false}
                isSaving={saving}
                submitError={saveError}
                onDirtyChange={setDirty}
              />
            ) : (
              <div className="space-y-5">
                <section className="cronograma-drawer-section grid gap-x-6 sm:grid-cols-2" aria-label="Informações principais">
                  <InfoBlock
                    icon={CalendarClock}
                    label="Data e horário"
                    value={`${formatLongDateRange(event.date, event.endDate)}${event.startTime ? ` · ${event.startTime}` : ''}${event.endTime ? ` às ${event.endTime}` : ''}`}
                  />
                  <InfoBlock icon={MapPin} label="Local" value={event.location || 'Local a definir'} />
                  <InfoBlock icon={UserRound} label="Responsável" value={event.owner || 'Responsável a definir'} />
                  <InfoBlock icon={Layers3} label="Comissão" value={event.commission || 'Comissão a definir'} />
                </section>

                {(event.pendingReason || event.decisionNeeded || !event.date) && (
                  <section className="cronograma-pending-panel" aria-label="Definição pendente">
                    <div className="flex items-start gap-3">
                      <span className="cronograma-pending-icon"><AlertTriangle className="h-4 w-4" /></span>
                      <div>
                        <p className="cronograma-section-eyebrow">Definição pendente</p>
                        <p className="mt-1.5 text-sm leading-relaxed text-foreground/80">
                          {event.pendingReason || 'Este item ainda não possui data oficial definida.'}
                        </p>
                      </div>
                    </div>
                    {event.decisionNeeded && (
                      <div className="cronograma-decision-needed">
                        <strong>Próxima decisão:</strong> {event.decisionNeeded}
                      </div>
                    )}
                  </section>
                )}

                {event.subevents && event.subevents.length > 0 && (
                  <section className="cronograma-drawer-section border-t border-border/50 pt-5" aria-labelledby="cronograma-subevents-title">
                    <div className="mb-4 flex items-start justify-between gap-4">
                      <div>
                        <p className="cronograma-section-eyebrow">Checklist vinculado</p>
                        <h3 id="cronograma-subevents-title" className="mt-1 font-black tracking-tight text-foreground">Entregas e subeventos</h3>
                      </div>
                      <span className="cronograma-progress-label">{progress?.completed ?? 0} de {progress?.total ?? 0}</span>
                    </div>
                    <div className="cronograma-progress-track" aria-label={`${progress?.percent ?? 0}% concluído`}>
                      <span style={{ width: `${progress?.percent ?? 0}%` }} />
                    </div>
                    <div className="mt-4 space-y-2">
                      {event.subevents.map((subevent, index) => {
                        const completed = subevent.status === 'completed';
                        return (
                          <div key={`${subevent.title}-${index}`} className="cronograma-subevent-row">
                            <span className={cn('cronograma-subevent-check', completed && 'is-completed')}>
                              {completed ? <Check className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className={cn('text-sm font-bold leading-tight text-foreground', completed && 'line-through opacity-65')}>{subevent.title}</p>
                              <p className="mt-1 text-xs text-muted-foreground">
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

                <section className="cronograma-drawer-section border-t border-border/50 pt-5" aria-labelledby="cronograma-executive-title">
                  <p className="cronograma-section-eyebrow">Leitura executiva</p>
                  <h3 id="cronograma-executive-title" className="sr-only">Resumo executivo</h3>
                  <p className="mt-2 text-sm leading-relaxed text-foreground/80">{event.summary}</p>
                </section>

                <section className="cronograma-history-panel" aria-label="Rastreabilidade do registro">
                  <FileClock className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div>
                    <p className="text-sm font-bold text-foreground">Rastreabilidade do registro</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {event.sourceSheet ? `Origem: ${event.sourceSheet}. ` : ''}
                      {event.updatedAt
                        ? `Última atualização registrada em ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(event.updatedAt))}.`
                        : 'Registro consolidado a partir do cronograma oficial.'}
                    </p>
                  </div>
                </section>

                {canViewHistory && (
                  <section className="cronograma-audit-section" aria-labelledby="cronograma-history-title">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="cronograma-section-eyebrow">Auditoria</p>
                        <h3 id="cronograma-history-title" className="mt-1 flex items-center gap-2 text-sm font-black text-foreground">
                          <History className="h-4 w-4 text-primary" aria-hidden="true" />
                          Histórico de alterações
                        </h3>
                      </div>
                      {history.length > 0 && <span className="cronograma-progress-label">{history.length}</span>}
                    </div>

                    {historyLoading ? (
                      <div className="mt-3 space-y-2" aria-label="Carregando histórico" aria-busy="true">
                        <div className="h-12 animate-pulse rounded-lg bg-slate-100" />
                        <div className="h-12 animate-pulse rounded-lg bg-slate-100" />
                      </div>
                    ) : historyError ? (
                      <p className="mt-3 rounded-lg border border-amber-900/10 bg-amber-50 p-3 text-xs leading-relaxed text-amber-950">
                        O histórico online não pôde ser carregado agora. Os dados do evento continuam disponíveis.
                      </p>
                    ) : history.length === 0 ? (
                      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">Nenhuma alteração manual registrada para este evento.</p>
                    ) : (
                      <ol className="mt-3 space-y-2">
                        {history.slice(0, 5).map((entry) => (
                          <li key={entry.id} className="cronograma-audit-entry">
                            <span className="cronograma-audit-dot" aria-hidden="true" />
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-bold text-foreground">
                                {entry.changedFields.length > 0
                                  ? `Alteração em ${entry.changedFields.join(', ')}`
                                  : 'Dados operacionais atualizados'}
                              </p>
                              <p className="mt-1 text-[11px] text-muted-foreground">
                                {entry.userLabel} · {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(entry.createdAt))}
                              </p>
                            </div>
                          </li>
                        ))}
                      </ol>
                    )}
                  </section>
                )}
              </div>
            )}
          </div>

          <div className="cronograma-drawer-footer">
            {editMode ? (
              <div className="flex w-full flex-wrap items-center justify-between gap-3">
                <p className="hidden text-xs font-medium text-muted-foreground sm:block">
                  {dirty ? 'Há alterações ainda não salvas.' : 'Nenhuma alteração pendente.'}
                </p>
                <div className="ml-auto flex gap-2">
                  <Button type="button" variant="outline" onClick={handleCancelEdit} disabled={saving} className="rounded-lg">
                    <X className="h-4 w-4" />
                    Cancelar
                  </Button>
                  <Button type="submit" form="cronograma-drawer-edit-form" disabled={saving} className="rounded-lg">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {saving ? 'Salvando…' : 'Salvar alterações'}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex w-full flex-wrap items-center justify-between gap-3">
                {!canManage && (
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                    <LockKeyhole className="h-3.5 w-3.5" /> Somente leitura
                  </span>
                )}
                <div className="ml-auto flex flex-wrap justify-end gap-2">
                  {canManage && event.status !== 'completed' && (
                    <Button type="button" variant="outline" onClick={handleMarkCompleted} disabled={saving} className="cronograma-complete-action rounded-lg">
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                      Marcar concluído
                    </Button>
                  )}
                  <Button type="button" variant="outline" onClick={requestClose} className="rounded-lg">Fechar</Button>
                  {canManage && (
                    <Button type="button" onClick={() => setEditMode(true)} className="rounded-lg">
                      <Edit3 className="h-4 w-4" /> Editar evento
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {confirmDiscard && (
        <AlertDialog open onOpenChange={(nextOpen) => {
          if (!nextOpen) setConfirmDiscard(false);
        }}>
          <AlertDialogContent className="cronograma-discard-dialog">
            <AlertDialogHeader>
              <AlertDialogTitle>Descartar alterações?</AlertDialogTitle>
              <AlertDialogDescription>
                As informações modificadas neste evento ainda não foram salvas.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Continuar editando</AlertDialogCancel>
              <AlertDialogAction onClick={closeDrawer} className="bg-red-700 text-white hover:bg-red-800">
                Descartar e fechar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}

function InfoBlock({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="cronograma-info-row py-3">
      <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
        <Icon className="h-3.5 w-3.5 text-gold" />
        {label}
      </div>
      <p className="text-sm font-semibold leading-relaxed text-foreground">{value}</p>
    </div>
  );
}
