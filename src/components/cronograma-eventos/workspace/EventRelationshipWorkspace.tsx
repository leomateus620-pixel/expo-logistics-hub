import { useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  ArrowLeft,
  BrainCircuit,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleDot,
  Edit3,
  Eye,
  GitBranch,
  Layers3,
  Link2,
  Loader2,
  LockKeyhole,
  MapPin,
  Network,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  UserRound,
} from 'lucide-react';
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
import { formatLongDate, formatLongDateRange } from '@/components/cronograma-eventos/dateUtils';
import {
  CronogramaCategoryMarker,
  CronogramaPriorityIndicator,
  CronogramaStatusIndicator,
} from '@/components/cronograma-eventos/CronogramaBadges';
import { EventForm } from '@/components/cronograma-eventos/EventForm';
import type {
  CronogramaEvent,
  CronogramaSubevent,
  CronogramaSubeventInput,
} from '@/components/cronograma-eventos/types';
import { SubeventComposer } from './SubeventComposer';

type WorkspaceFilter = 'all' | 'open' | 'completed';

function isCompleted(subevent: CronogramaSubevent) {
  return subevent.status === 'completed';
}

function subeventIdentity(subevent: CronogramaSubevent, index: number) {
  return subevent.id ?? `subevent-${index}-${subevent.title}`;
}

export function EventRelationshipWorkspace({
  event,
  onBack,
  onSaveEvent,
  onCreateSubevent,
  onUpdateSubevent,
  onRemoveSubevent,
  canManage,
  canDeleteSubevents,
  relationshipsUnavailable = false,
}: {
  event: CronogramaEvent;
  onBack: () => void;
  onSaveEvent: (event: CronogramaEvent) => Promise<void> | void;
  onCreateSubevent: (input: CronogramaSubeventInput) => Promise<void> | void;
  onUpdateSubevent: (subevent: CronogramaSubevent, input: CronogramaSubeventInput) => Promise<void> | void;
  onRemoveSubevent: (subevent: CronogramaSubevent) => Promise<void> | void;
  canManage: boolean;
  canDeleteSubevents: boolean;
  relationshipsUnavailable?: boolean;
}) {
  const [composerOpen, setComposerOpen] = useState(false);
  const [editingMain, setEditingMain] = useState(false);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [expandedNodeId, setExpandedNodeId] = useState<string | null>(null);
  const [removalTarget, setRemovalTarget] = useState<CronogramaSubevent | null>(null);
  const [filter, setFilter] = useState<WorkspaceFilter>('all');
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [mainSaving, setMainSaving] = useState(false);
  const [mainSaveError, setMainSaveError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const addBubbleRef = useRef<HTMLButtonElement>(null);

  const subevents = useMemo(
    () => [...(event.subevents ?? [])].sort((left, right) => (
      (left.sortOrder ?? 0) - (right.sortOrder ?? 0)
    )),
    [event.subevents],
  );
  const completed = subevents.filter(isCompleted).length;
  const progress = subevents.length > 0 ? Math.round((completed / subevents.length) * 100) : 0;
  const filteredSubevents = subevents.filter((subevent) => {
    if (filter === 'completed') return isCompleted(subevent);
    if (filter === 'open') return !isCompleted(subevent);
    return true;
  });

  const handleCreate = async (input: CronogramaSubeventInput) => {
    await onCreateSubevent(input);
    setComposerOpen(false);
    setAnnouncement(`${input.title} foi conectado ao evento principal. A ação Adicionar subevento está pronta novamente.`);
    window.requestAnimationFrame(() => addBubbleRef.current?.focus({ preventScroll: true }));
  };

  const handleUpdate = async (subevent: CronogramaSubevent, input: CronogramaSubeventInput) => {
    await onUpdateSubevent(subevent, input);
    setEditingNodeId(null);
    setAnnouncement(`${input.title} foi atualizado na árvore de execução.`);
  };

  const handleToggleCompleted = async (subevent: CronogramaSubevent, index: number) => {
    const identity = subeventIdentity(subevent, index);
    setPendingAction(identity);
    setActionError(null);
    try {
      await onUpdateSubevent(subevent, {
        title: subevent.title,
        description: subevent.description ?? '',
        date: subevent.date ?? null,
        status: isCompleted(subevent) ? 'planned' : 'completed',
        responsible: subevent.owner ?? '',
        commissionSlug: subevent.commissionSlug ?? '',
      });
      setAnnouncement(
        isCompleted(subevent)
          ? `${subevent.title} foi reaberto.`
          : `${subevent.title} foi marcado como concluído.`,
      );
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Não foi possível atualizar o subevento.');
    } finally {
      setPendingAction(null);
    }
  };

  const handleRemove = async () => {
    if (!removalTarget) return;
    const target = removalTarget;
    setPendingAction(target.id ?? target.title);
    setActionError(null);
    try {
      await onRemoveSubevent(target);
      setRemovalTarget(null);
      setAnnouncement(`${target.title} foi removido da árvore de execução.`);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Não foi possível remover o subevento.');
      setRemovalTarget(null);
    } finally {
      setPendingAction(null);
    }
  };

  const handleSaveMain = async (nextEvent: CronogramaEvent) => {
    setMainSaving(true);
    setMainSaveError(null);
    try {
      await onSaveEvent(nextEvent);
      setEditingMain(false);
      setAnnouncement('Os dados principais do evento foram atualizados.');
    } catch (error) {
      setMainSaveError(error instanceof Error ? error.message : 'Não foi possível atualizar o evento principal.');
    } finally {
      setMainSaving(false);
    }
  };

  return (
    <section className="cronograma-relationship-workspace" data-testid="event-relationship-workspace">
      <p className="sr-only" aria-live="polite">{announcement}</p>

      <header className="cronograma-workspace-toolbar">
        <div className="cronograma-workspace-toolbar-inner">
          <button
            type="button"
            onClick={onBack}
            className="cronograma-workspace-back focus-ring"
            aria-label="Voltar ao cronograma"
          >
            <ArrowLeft aria-hidden="true" />
            <span>Voltar ao cronograma</span>
          </button>

          <div className="cronograma-workspace-heading">
            <span className="cronograma-workspace-heading-icon" aria-hidden="true"><BrainCircuit /></span>
            <div>
              <p>Workspace de relações</p>
              <h1>Planejamento conectado</h1>
            </div>
          </div>

          <div className="cronograma-workspace-summary" aria-label="Resumo das conexões">
            <span><GitBranch aria-hidden="true" /> {subevents.length} conexões</span>
            <span><CheckCircle2 aria-hidden="true" /> {completed} concluídas</span>
            <strong>{progress}%</strong>
          </div>
        </div>
      </header>

      <div className="cronograma-workspace-canvas">
        <div className="cronograma-workspace-ambient ambient-one" aria-hidden="true" />
        <div className="cronograma-workspace-ambient ambient-two" aria-hidden="true" />
        <div className="cronograma-workspace-grid" aria-hidden="true" />

        <div className="cronograma-workspace-intro">
          <div>
            <p className="cronograma-workspace-eyebrow"><Network aria-hidden="true" /> Fluxo de execução</p>
            <h2>Conecte cada demanda ao resultado principal.</h2>
            <p>O evento ancora a estratégia. Cada ramo abaixo transforma planejamento em responsabilidade, prazo e entrega verificável.</p>
          </div>
          <div className="cronograma-workspace-filter" role="group" aria-label="Filtrar conexões">
            <button type="button" onClick={() => setFilter('all')} aria-pressed={filter === 'all'}>Todas <span>{subevents.length}</span></button>
            <button type="button" onClick={() => setFilter('open')} aria-pressed={filter === 'open'}>Em curso <span>{subevents.length - completed}</span></button>
            <button type="button" onClick={() => setFilter('completed')} aria-pressed={filter === 'completed'}>Concluídas <span>{completed}</span></button>
          </div>
        </div>

        {relationshipsUnavailable && (
          <div className="cronograma-workspace-sync-warning" role="alert">
            <LockKeyhole aria-hidden="true" />
            <div>
              <strong>Relacionamentos em modo protegido</strong>
              <p>Os eventos continuam visíveis, mas novas conexões ficam bloqueadas até a sincronização online responder.</p>
            </div>
          </div>
        )}

        <article className="cronograma-main-anchor" aria-labelledby="cronograma-main-anchor-title">
          <span className="cronograma-main-anchor-orbit orbit-one" aria-hidden="true" />
          <span className="cronograma-main-anchor-orbit orbit-two" aria-hidden="true" />
          <div className="cronograma-main-anchor-topline">
            <span className="cronograma-main-anchor-label"><Sparkles aria-hidden="true" /> Evento principal</span>
            <div className="flex flex-wrap items-center gap-2">
              <CronogramaStatusIndicator status={event.status} />
              <CronogramaPriorityIndicator priority={event.priority} />
            </div>
          </div>
          <div className="cronograma-main-anchor-body">
            <span className="cronograma-main-anchor-symbol" aria-hidden="true"><CircleDot /></span>
            <div className="min-w-0">
              <CronogramaCategoryMarker category={event.category} />
              <h2 id="cronograma-main-anchor-title">{event.title}</h2>
              <p>{event.summary}</p>
            </div>
          </div>
          <dl className="cronograma-main-anchor-meta">
            <div><dt><CalendarDays aria-hidden="true" /> Data</dt><dd>{formatLongDateRange(event.date, event.endDate)}</dd></div>
            <div><dt><UserRound aria-hidden="true" /> Responsável</dt><dd>{event.owner || 'A definir'}</dd></div>
            <div><dt><Layers3 aria-hidden="true" /> Comissão</dt><dd>{event.commission || 'A definir'}</dd></div>
            <div><dt><MapPin aria-hidden="true" /> Local</dt><dd>{event.location || 'A definir'}</dd></div>
          </dl>
          {canManage && (
            <div className="cronograma-main-anchor-actions">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditingMain((current) => !current)}
                className="rounded-xl"
                aria-expanded={editingMain}
              >
                <Edit3 className="h-4 w-4" aria-hidden="true" />
                {editingMain ? 'Fechar ajustes' : 'Ajustar evento principal'}
              </Button>
            </div>
          )}
          <span className="cronograma-main-anchor-port" aria-hidden="true"><Link2 /></span>
        </article>

        {editingMain && (
          <div className="cronograma-main-editor" data-testid="main-event-editor">
            <div className="cronograma-main-editor-heading">
              <div>
                <p>Ajuste contextual</p>
                <h3>Dados do evento principal</h3>
              </div>
              <span>As conexões permanecem preservadas.</span>
            </div>
            <EventForm
              event={event}
              onSubmit={handleSaveMain}
              onCancel={() => setEditingMain(false)}
              isSaving={mainSaving}
              submitError={mainSaveError}
              showSubevents={false}
              submitLabel="Salvar evento principal"
            />
          </div>
        )}

        <div className="cronograma-relationship-tree" data-empty={subevents.length === 0 ? 'true' : undefined}>
          <span className="cronograma-relationship-spine" aria-hidden="true" />

          {subevents.length === 0 && (
            <div className="cronograma-relationship-empty" role="status">
              <span className="empty-thought thought-a" aria-hidden="true" />
              <span className="empty-thought thought-b" aria-hidden="true" />
              <span className="cronograma-relationship-empty-icon" aria-hidden="true"><GitBranch /></span>
              <p>Nenhuma ramificação criada ainda.</p>
              <strong>Comece conectando a primeira demanda operacional.</strong>
            </div>
          )}

          {subevents.length > 0 && filteredSubevents.length === 0 && (
            <div className="cronograma-relationship-filter-empty" role="status">
              Nenhuma conexão corresponde a este filtro.
            </div>
          )}

          <ol className="cronograma-relationship-branches" aria-label="Subeventos conectados ao evento principal">
            {filteredSubevents.map((subevent, index) => {
              const originalIndex = subevents.indexOf(subevent);
              const identity = subeventIdentity(subevent, originalIndex);
              const side = originalIndex % 2 === 0 ? 'left' : 'right';
              const editing = editingNodeId === identity;
              return (
                <li key={identity} className="cronograma-relationship-branch" data-side={side} style={{ '--branch-index': originalIndex } as CSSProperties}>
                  <span className="cronograma-branch-joint" aria-hidden="true"><span /></span>
                  <div className="cronograma-branch-content">
                    <SubeventNode
                      subevent={subevent}
                      index={originalIndex}
                      expanded={expandedNodeId === identity}
                      pending={pendingAction === identity}
                      canManage={canManage}
                      canDelete={canDeleteSubevents}
                      onView={() => setExpandedNodeId((current) => current === identity ? null : identity)}
                      onEdit={() => {
                        setComposerOpen(false);
                        setEditingNodeId((current) => current === identity ? null : identity);
                      }}
                      onToggleCompleted={() => handleToggleCompleted(subevent, originalIndex)}
                      onRemove={() => setRemovalTarget(subevent)}
                    />
                    {editing && (
                      <SubeventComposer
                        initialSubevent={subevent}
                        connectedTo={event.title}
                        mode="edit"
                        onSubmit={(input) => handleUpdate(subevent, input)}
                        onCancel={() => setEditingNodeId(null)}
                      />
                    )}
                  </div>
                </li>
              );
            })}
          </ol>

          <div className="cronograma-add-branch">
            <span className="cronograma-add-branch-joint" aria-hidden="true"><span /></span>
            <button
              ref={addBubbleRef}
              type="button"
              className="cronograma-add-thought focus-ring"
              onClick={() => {
                if (!canManage || relationshipsUnavailable) return;
                setEditingNodeId(null);
                setComposerOpen((current) => !current);
              }}
              disabled={!canManage || relationshipsUnavailable}
              aria-label="Adicionar subevento"
              aria-expanded={composerOpen}
              aria-controls="cronograma-new-subevent-composer"
            >
              <span className="cronograma-add-thought-icon" aria-hidden="true">
                {canManage && !relationshipsUnavailable ? <Plus /> : <LockKeyhole />}
              </span>
              <span>
                <strong>Adicionar subevento</strong>
                <small>
                  {relationshipsUnavailable
                    ? 'Aguardando sincronização online'
                    : canManage
                      ? 'Criar uma nova conexão'
                      : 'Disponível para perfis de gestão'}
                </small>
              </span>
              <Sparkles className="cronograma-add-thought-spark" aria-hidden="true" />
            </button>

            {composerOpen && (
              <div id="cronograma-new-subevent-composer" className="cronograma-add-composer-wrap">
                <SubeventComposer
                  connectedTo={event.title}
                  onSubmit={handleCreate}
                  onCancel={() => setComposerOpen(false)}
                />
              </div>
            )}
          </div>
        </div>

        {actionError && <p className="cronograma-workspace-action-error" role="alert">{actionError}</p>}
      </div>

      <AlertDialog open={Boolean(removalTarget)} onOpenChange={(open) => {
        if (!open && !pendingAction) setRemovalTarget(null);
      }}>
        <AlertDialogContent className="cronograma-workspace-remove-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Remover esta conexão?</AlertDialogTitle>
            <AlertDialogDescription>
              “{removalTarget?.title}” deixará de fazer parte da árvore deste evento. O evento principal e as demais conexões serão preservados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(pendingAction)}>Manter conexão</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemove} disabled={Boolean(pendingAction)} className="bg-red-700 text-white hover:bg-red-800">
              {pendingAction ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Remover subevento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function SubeventNode({
  subevent,
  index,
  expanded,
  pending,
  canManage,
  canDelete,
  onView,
  onEdit,
  onToggleCompleted,
  onRemove,
}: {
  subevent: CronogramaSubevent;
  index: number;
  expanded: boolean;
  pending: boolean;
  canManage: boolean;
  canDelete: boolean;
  onView: () => void;
  onEdit: () => void;
  onToggleCompleted: () => void;
  onRemove: () => void;
}) {
  const completed = isCompleted(subevent);
  return (
    <article
      className="cronograma-subevent-node"
      data-status={subevent.status ?? 'planned'}
      data-completed={completed ? 'true' : undefined}
      data-testid="subevent-node"
    >
      <div className="cronograma-subevent-node-kicker">
        <span><GitBranch aria-hidden="true" /> Conexão {String(index + 1).padStart(2, '0')}</span>
        <CronogramaStatusIndicator status={subevent.status ?? 'planned'} compact />
      </div>
      <h3>{subevent.title}</h3>
      {subevent.description && <p className="cronograma-subevent-preview">{subevent.description}</p>}
      <div className="cronograma-subevent-node-meta">
        <span><CalendarDays aria-hidden="true" /> {subevent.date ? formatLongDate(subevent.date) : 'Prazo a definir'}</span>
        <span><UserRound aria-hidden="true" /> {subevent.owner || 'Responsável a definir'}</span>
        <span><Layers3 aria-hidden="true" /> {subevent.commission || 'Comissão a definir'}</span>
      </div>

      {expanded && (
        <div className="cronograma-subevent-expanded" role="region" aria-label={`Detalhes de ${subevent.title}`}>
          <p>{subevent.description || 'Nenhuma descrição adicional foi registrada para esta conexão.'}</p>
          <div>
            <span>Origem</span>
            <strong>{subevent.storage === 'relational' ? 'Relação persistida' : 'Registro consolidado legado'}</strong>
          </div>
        </div>
      )}

      <div className="cronograma-subevent-node-actions" aria-label={`Ações de ${subevent.title}`}>
        <button
          type="button"
          onClick={onView}
          className="focus-ring"
          aria-expanded={expanded}
          aria-label={`${expanded ? 'Recolher detalhes de' : 'Ver detalhes de'} ${subevent.title}`}
        >
          <Eye aria-hidden="true" /> <span>{expanded ? 'Recolher' : 'Ver'}</span>
          {expanded ? <ChevronUp className="chevron" aria-hidden="true" /> : <ChevronDown className="chevron" aria-hidden="true" />}
        </button>
        {canManage && (
          <>
            <button type="button" onClick={onEdit} className="focus-ring" aria-label={`Editar subevento ${subevent.title}`}>
              <Edit3 aria-hidden="true" /> <span>Editar</span>
            </button>
            <button
              type="button"
              onClick={onToggleCompleted}
              disabled={pending}
              className="focus-ring is-complete"
              aria-label={`${completed ? 'Reabrir' : 'Concluir'} subevento ${subevent.title}`}
            >
              {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : completed ? <RotateCcw aria-hidden="true" /> : <Check aria-hidden="true" />}
              <span>{completed ? 'Reabrir' : 'Concluir'}</span>
            </button>
          </>
        )}
        {canDelete && (
          <button type="button" onClick={onRemove} disabled={pending} className="focus-ring is-remove" aria-label={`Remover subevento ${subevent.title}`}>
            <Trash2 aria-hidden="true" /> <span>Remover</span>
          </button>
        )}
      </div>
    </article>
  );
}
