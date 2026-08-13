import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  Check,
  CheckCircle2,
  Edit3,
  History,
  Layers3,
  Loader2,
  LockKeyhole,
  MapPin,
  Route,
  Save,
  Sparkles,
  Trash2,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { resolveCronogramaReturnFocus } from '@/lib/cronograma-focus';
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
} from './CronogramaBadges';
import { EventForm } from './EventForm';
import { formatLongDate, formatLongDateRange } from './dateUtils';
import type { CronogramaEvent, CronogramaHistoryEntry } from './types';
import { EventoAnexosSection } from './EventoAnexosSection';
import {
  EventRelationList,
  getEventCommissionItems,
  splitEventResponsibles,
  type EventRelationItem,
} from './EventRelationFields';

interface EventDrawerProps {
  event: CronogramaEvent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (event: CronogramaEvent) => Promise<void> | void;
  onComplete?: (event: CronogramaEvent) => Promise<void> | void;
  onEditWorkspace?: (event: CronogramaEvent) => void;
  onDelete?: (event: CronogramaEvent) => Promise<void> | void;
  startInEdit?: boolean;
  canManage?: boolean;
  canDelete?: boolean;
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
  onComplete,
  onEditWorkspace,
  onDelete,
  startInEdit = false,
  canManage = false,
  canDelete = false,
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
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const completionPendingRef = useRef(false);


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

  const commissionItems = getEventCommissionItems(event);
  const { responsible, guests } = splitEventResponsibles(event);


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
    const completesEvent = event.status !== 'completed' && nextEvent.status === 'completed' && Boolean(onComplete);
    if (completesEvent && completionPendingRef.current) return;
    if (completesEvent) completionPendingRef.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      if (completesEvent && onComplete) await onComplete(nextEvent);
      else await onSave(nextEvent);
      setDirty(false);
      setEditMode(false);
      if (completesEvent) {
        setSaving(false);
        closeDrawer();
      }
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : 'Não foi possível salvar as alterações. Tente novamente.',
      );
    } finally {
      if (completesEvent) completionPendingRef.current = false;
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
    if (saving || completionPendingRef.current) return;
    completionPendingRef.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      if (onComplete) await onComplete(event);
      else await onSave({ ...event, status: 'completed' });
      setDirty(false);
      setSaving(false);
      closeDrawer();
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : 'Não foi possível concluir o evento. Ele permanece na Linha do tempo.',
      );
    } finally {
      completionPendingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent
          className="cronograma-drawer"
          overlayClassName="cronograma-drawer-overlay"
          closeLabel="Fechar detalhes do evento"
          onCloseAutoFocus={(closeEvent) => {
            const focusTarget = resolveCronogramaReturnFocus(returnFocusRef?.current);
            if (!focusTarget) return;
            closeEvent.preventDefault();
            focusTarget.focus({ preventScroll: true });
          }}
          onEscapeKeyDown={(escapeEvent) => {
            if (saving) escapeEvent.preventDefault();
          }}
        >
          <div className="cronograma-drawer-header relative">
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
              <SheetDescription className={editMode ? 'sr-only' : 'cronograma-drawer-description'}>
                {editMode ? `Formulário de edição de ${event.title}.` : event.summary}
              </SheetDescription>
            </SheetHeader>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <CronogramaStatusIndicator status={event.status} />
              <CronogramaPriorityIndicator priority={event.priority} />
              {editMode && (
                <span className="cronograma-editing-badge">
                  <Edit3 className="h-3.5 w-3.5" />
                  Editando
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
                <section className="cronograma-drawer-section" aria-label="Informações principais">
                  <div className="cronograma-info-grid">
                    <InfoCard
                      icon={CalendarClock}
                      label="Data e horário"
                      value={`${formatLongDateRange(event.date, event.endDate)}${event.startTime ? ` · ${event.startTime}` : ''}${event.endTime ? ` às ${event.endTime}` : ''}`}
                    />
                    <InfoCard icon={MapPin} label="Local" value={event.location || 'Local a definir'} />
                    <RelationCard
                      icon={UserRound}
                      label="Responsável"
                      items={responsible ? [responsible] : []}
                      emptyLabel="Responsável a definir"
                    />
                    {guests.length > 0 && (
                      <RelationCard
                        icon={UsersRound}
                        label={guests.length > 1 ? 'Convidados' : 'Convidado'}
                        items={guests}
                        emptyLabel="Nenhum convidado"
                      />
                    )}
                    <RelationCard
                      icon={Layers3}
                      label={commissionItems.length > 1 ? 'Comissões' : 'Comissão'}
                      items={commissionItems}
                      emptyLabel="Comissão a definir"
                    />
                  </div>
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
                        <h3 id="cronograma-subevents-title" className="font-black tracking-tight text-foreground">Subeventos</h3>
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
                                {subevent.date ? formatLongDate(subevent.date) : 'Sem data'}
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

                {event.id && <EventoAnexosSection eventId={event.id} />}

                {canViewHistory && (
                  <section className="cronograma-audit-section" aria-labelledby="cronograma-history-title">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 id="cronograma-history-title" className="flex items-center gap-2 text-sm font-black text-foreground">
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
                        Não foi possível carregar o histórico agora.
                      </p>
                    ) : history.length === 0 ? (
                      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">Nenhuma alteração registrada.</p>
                    ) : (
                      <ol className="mt-3 space-y-2">
                        {history.slice(0, 5).map((entry) => (
                          <li key={entry.id} className="cronograma-audit-entry">
                            <span className="cronograma-audit-dot" aria-hidden="true" />
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-bold text-foreground">
                                {entry.changedFields.length > 0
                                  ? `Alteração em ${entry.changedFields.join(', ')}`
                                  : 'Evento atualizado'}
                              </p>
                              <p className="mt-1 text-[11px] text-muted-foreground">
                                {entry.userLabel} · {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(entry.createdAt))}
                              </p>
                              {entry.changes && entry.changes.length > 0 && (
                                <ul className="cronograma-audit-diff" aria-label="Detalhes da alteração">
                                  {entry.changes.map((change) => (
                                    <li key={change.field}>
                                      <span className="cronograma-audit-diff__field">{change.label}</span>
                                      <span className="cronograma-audit-diff__values">
                                        <span className={change.before ? 'cronograma-audit-diff__old' : 'cronograma-audit-diff__old is-empty'}>
                                          {change.before ?? '—'}
                                        </span>
                                        <span className="cronograma-audit-diff__arrow" aria-hidden="true">→</span>
                                        <span className={change.after ? 'cronograma-audit-diff__new' : 'cronograma-audit-diff__new is-empty'}>
                                          {change.after ?? '—'}
                                        </span>
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              )}
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
                {dirty && (
                  <p className="hidden text-xs font-medium text-muted-foreground sm:block">Alterações não salvas.</p>
                )}
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
                  {canManage && canDelete && onDelete && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setConfirmDelete(true)}
                      disabled={saving || deleting}
                      className="rounded-lg border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
                    >
                      <Trash2 className="h-4 w-4" />
                      Excluir
                    </Button>
                  )}
                  {canManage && event.status !== 'completed' && (
                    <Button type="button" variant="outline" onClick={handleMarkCompleted} disabled={saving} className="cronograma-complete-action rounded-lg">
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                      Marcar concluído
                    </Button>
                  )}
                  <Button type="button" variant="outline" onClick={requestClose} disabled={saving} className="rounded-lg">Fechar</Button>
                  {canManage && (
                    <Button
                      type="button"
                      onClick={() => onEditWorkspace ? onEditWorkspace(event) : setEditMode(true)}
                      disabled={saving}
                      className="rounded-lg"
                    >
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

      {confirmDelete && onDelete && (
        <AlertDialog open onOpenChange={(nextOpen) => { if (!nextOpen && !deleting) setConfirmDelete(false); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir evento?</AlertDialogTitle>
              <AlertDialogDescription>
                O evento <strong>{event.title}</strong> será removido do cronograma e do Google Agenda de todos os usuários conectados. Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={async (e) => {
                  e.preventDefault();
                  setDeleting(true);
                  try {
                    await onDelete(event);
                    setConfirmDelete(false);
                    closeDrawer();
                  } catch (error) {
                    setSaveError(
                      error instanceof Error
                        ? error.message
                        : 'Não foi possível excluir o evento. Tente novamente.',
                    );
                    setConfirmDelete(false);
                  } finally {
                    setDeleting(false);
                  }
                }}
                disabled={deleting}
                className="bg-red-700 text-white hover:bg-red-800"
              >
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                {deleting ? 'Excluindo…' : 'Sim, excluir'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}

function InfoCard({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="cronograma-info-card">
      <span className="cronograma-info-card-icon" aria-hidden="true">
        <Icon />
      </span>
      <div className="min-w-0 flex-1">
        <p className="cronograma-info-card-label">{label}</p>
        <p className="cronograma-info-card-value">{value}</p>
      </div>
    </div>
  );
}

function RelationCard({
  icon,
  label,
  items,
  emptyLabel,
}: {
  icon: LucideIcon;
  label: string;
  items: EventRelationItem[];
  emptyLabel: string;
}) {
  const Icon = icon;
  return (
    <div className={cn('cronograma-info-card cronograma-info-card--relation', items.length > 1 && 'is-multi')}>
      <span className="cronograma-info-card-icon" aria-hidden="true">
        <Icon />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="cronograma-info-card-label">{label}</p>
          {items.length > 1 && (
            <span className="cronograma-relation-count" aria-label={`${items.length} vínculos`}>
              {items.length}
            </span>
          )}
        </div>
        <EventRelationList
          items={items}
          emptyLabel={emptyLabel}
          icon={Icon}
          collapseAfter={5}
          className="mt-1.5"
        />
      </div>
    </div>
  );
}
