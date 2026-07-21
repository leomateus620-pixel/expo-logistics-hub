import { useCallback, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { cn } from '@/lib/utils';
import { priorityLabels, statusLabels } from './cronogramaData';
import type {
  CronogramaPriority,
  CronogramaStatus,
  CronogramaSubevent,
} from './types';

const editableStatusLabels: Partial<Record<CronogramaStatus, string>> = {
  planned: statusLabels.planned,
  in_progress: statusLabels.in_progress,
  in_definition: statusLabels.in_definition,
  blocked: statusLabels.blocked,
  completed: statusLabels.completed,
  cancelled: statusLabels.cancelled,
};

export interface CronogramaSubeventFormProps {
  value: CronogramaSubevent[];
  onChange: (next: CronogramaSubevent[]) => void;
  /** Optional callback invoked when the user reorders — receives the new ordered ids. */
  onReorderPersist?: (orderedIds: string[]) => void;
  /** Persist delete via RPC when the subevent has an id — otherwise removal is local. */
  onDeletePersist?: (subeventId: string) => Promise<void> | void;
  presentation?: 'desktop' | 'mobile';
  disabled?: boolean;
  emptyLabel?: string;
  defaultDate?: string | null;
}

const stableId = (subevent: CronogramaSubevent, index: number) => (
  subevent.id ?? `draft:${index}`
);

/**
 * Standalone subevent editor with drag-and-drop reordering.
 * Used inside `EventForm` and can be reused wherever subevents are edited.
 */
export function CronogramaSubeventForm({
  value,
  onChange,
  onReorderPersist,
  onDeletePersist,
  presentation = 'desktop',
  disabled = false,
  emptyLabel = 'Nenhum subevento vinculado.',
  defaultDate = null,
}: CronogramaSubeventFormProps) {
  const [pendingDeleteIndex, setPendingDeleteIndex] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const lastReorderRef = useRef<string>('');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const items = useMemo(
    () => value.map((subevent, index) => ({
      id: stableId(subevent, index),
      subevent,
      index,
    })),
    [value],
  );
  const orderedIds = useMemo(() => items.map((item) => item.id), [items]);

  const updateAt = useCallback(<K extends keyof CronogramaSubevent>(
    index: number,
    key: K,
    next: CronogramaSubevent[K],
  ) => {
    onChange(value.map((subevent, itemIndex) => (
      itemIndex === index ? { ...subevent, [key]: next } : subevent
    )));
  }, [onChange, value]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = orderedIds.indexOf(active.id as string);
    const newIndex = orderedIds.indexOf(over.id as string);
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(value, oldIndex, newIndex).map((subevent, itemIndex) => ({
      ...subevent,
      sortOrder: itemIndex,
    }));
    onChange(reordered);
    if (onReorderPersist) {
      const persistIds = reordered
        .map((subevent) => subevent.id)
        .filter((id): id is string => Boolean(id));
      const signature = persistIds.join('|');
      if (signature && signature !== lastReorderRef.current) {
        lastReorderRef.current = signature;
        onReorderPersist(persistIds);
      }
    }
  }, [onChange, onReorderPersist, orderedIds, value]);

  const handleAdd = useCallback(() => {
    onChange([
      ...value,
      {
        title: '',
        date: defaultDate,
        endDate: defaultDate,
        startTime: '',
        endTime: '',
        owner: '',
        status: 'planned',
        priority: 'medium',
        sortOrder: value.length,
      },
    ]);
  }, [defaultDate, onChange, value]);

  const requestDelete = (index: number) => {
    setDeleteError(null);
    setPendingDeleteIndex(index);
  };

  const confirmDelete = async () => {
    if (pendingDeleteIndex === null) return;
    const target = value[pendingDeleteIndex];
    setDeleting(true);
    setDeleteError(null);
    try {
      if (onDeletePersist && target?.id && !target.id.startsWith('draft:') && !target.id.startsWith('embedded:')) {
        await onDeletePersist(target.id);
      }
      onChange(value.filter((_, itemIndex) => itemIndex !== pendingDeleteIndex));
      setPendingDeleteIndex(null);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Não foi possível remover o subevento.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="cronograma-subevent-form" data-presentation={presentation}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-black uppercase tracking-[0.14em] text-foreground/72">
            Subeventos vinculados
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Arraste pela alça para reordenar. As alterações são salvas junto com o evento.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAdd}
          disabled={disabled}
          className="rounded-full bg-white/70 text-xs"
        >
          <Plus className="h-4 w-4" />
          Adicionar subevento
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/50 bg-white/45 p-4 text-center text-sm text-muted-foreground">
          {emptyLabel}
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={orderedIds} strategy={verticalListSortingStrategy}>
            <ol className="space-y-3" aria-label="Lista ordenada de subeventos">
              {items.map(({ id, subevent, index }) => (
                <SortableSubeventRow
                  key={id}
                  id={id}
                  index={index}
                  subevent={subevent}
                  presentation={presentation}
                  disabled={disabled}
                  onUpdate={updateAt}
                  onRequestDelete={requestDelete}
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      )}

      {pendingDeleteIndex !== null && (
        <AlertDialog
          open
          onOpenChange={(nextOpen) => {
            if (!nextOpen && !deleting) setPendingDeleteIndex(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remover este subevento?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta ação não pode ser desfeita. Se o subevento já estiver salvo, ele será excluído permanentemente.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {deleteError && (
              <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs font-semibold text-red-900" role="alert">
                {deleteError}
              </p>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={(event) => {
                  event.preventDefault();
                  void confirmDelete();
                }}
                disabled={deleting}
                className="bg-red-700 text-white hover:bg-red-800"
              >
                {deleting ? 'Removendo…' : 'Remover'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}

interface SortableSubeventRowProps {
  id: string;
  index: number;
  subevent: CronogramaSubevent;
  presentation: 'desktop' | 'mobile';
  disabled: boolean;
  onUpdate: <K extends keyof CronogramaSubevent>(index: number, key: K, value: CronogramaSubevent[K]) => void;
  onRequestDelete: (index: number) => void;
}

function SortableSubeventRow({
  id,
  index,
  subevent,
  presentation,
  disabled,
  onUpdate,
  onRequestDelete,
}: SortableSubeventRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 20 : undefined,
  };
  const rowId = `subevent-${id.replace(/[^a-z0-9]+/gi, '-')}`;

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        'rounded-2xl border border-border/35 bg-white/64 p-3',
        isDragging && 'shadow-xl ring-2 ring-primary/30',
      )}
      data-testid={`cronograma-subevent-row-${index}`}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          {...attributes}
          {...listeners}
          disabled={disabled}
          className="mt-1 flex h-8 w-8 flex-shrink-0 cursor-grab items-center justify-center rounded-lg text-muted-foreground hover:bg-primary/10 active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40"
          aria-label={`Reordenar subevento ${index + 1}`}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1 space-y-3">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_150px_120px_120px]">
            <div className="space-y-1.5">
              <Label htmlFor={`${rowId}-title`}>Título do subevento</Label>
              <Input
                id={`${rowId}-title`}
                value={subevent.title}
                onChange={(event) => onUpdate(index, 'title', event.target.value)}
                placeholder="Ex: validação de fornecedores"
                className="bg-white/72"
                disabled={disabled}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${rowId}-date`}>Data</Label>
              <Input
                id={`${rowId}-date`}
                type="date"
                value={subevent.date || ''}
                onChange={(event) => onUpdate(index, 'date', event.target.value || null)}
                className="bg-white/72"
                disabled={disabled}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${rowId}-start-time`}>Início</Label>
              <Input
                id={`${rowId}-start-time`}
                type="time"
                value={subevent.startTime || ''}
                onChange={(event) => onUpdate(index, 'startTime', event.target.value)}
                className="bg-white/72"
                disabled={disabled}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${rowId}-end-time`}>Fim</Label>
              <Input
                id={`${rowId}-end-time`}
                type="time"
                value={subevent.endTime || ''}
                onChange={(event) => onUpdate(index, 'endTime', event.target.value)}
                className="bg-white/72"
                disabled={disabled}
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_170px_170px_auto]">
            <div className="space-y-1.5">
              <Label htmlFor={`${rowId}-owner`}>Responsável</Label>
              <Input
                id={`${rowId}-owner`}
                value={subevent.owner || ''}
                onChange={(event) => onUpdate(index, 'owner', event.target.value)}
                placeholder="Comissão ou responsável"
                className="bg-white/72"
                disabled={disabled}
              />
            </div>
            <MiniSelect
              id={`${rowId}-status`}
              label="Status"
              value={subevent.status || 'planned'}
              onChange={(nextValue) => onUpdate(index, 'status', nextValue as CronogramaStatus)}
              items={editableStatusLabels}
              mobile={presentation === 'mobile'}
              disabled={disabled}
            />
            <MiniSelect
              id={`${rowId}-priority`}
              label="Prioridade"
              value={subevent.priority || 'medium'}
              onChange={(nextValue) => onUpdate(index, 'priority', nextValue as CronogramaPriority)}
              items={priorityLabels}
              mobile={presentation === 'mobile'}
              disabled={disabled}
            />
            <div className="flex items-end">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => onRequestDelete(index)}
                disabled={disabled}
                className="h-10 w-10 rounded-full text-muted-foreground hover:bg-red-50 hover:text-red-800"
                aria-label={`Remover subevento ${index + 1}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${rowId}-desc`}>Descrição</Label>
            <Textarea
              id={`${rowId}-desc`}
              rows={2}
              value={subevent.description || ''}
              onChange={(event) => onUpdate(index, 'description', event.target.value)}
              placeholder="Detalhes operacionais (opcional)"
              className="rounded-2xl bg-white/72"
              disabled={disabled}
            />
          </div>
        </div>
      </div>
    </li>
  );
}

interface MiniSelectProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  items: Record<string, string | undefined>;
  mobile?: boolean;
  disabled?: boolean;
}

function MiniSelect({ id, label, value, onChange, items, mobile, disabled }: MiniSelectProps) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger id={id} aria-label={label} className="rounded-2xl border-white/60 bg-white/72">
          <SelectValue />
        </SelectTrigger>
        <SelectContent
          className={mobile
            ? 'cronograma-event-select-content z-[95] max-h-[min(22rem,70dvh)] rounded-2xl bg-white/95'
            : 'rounded-2xl bg-white/95'}
        >
          {Object.entries(items)
            .filter(([, itemLabel]) => Boolean(itemLabel))
            .map(([itemValue, itemLabel]) => (
              <SelectItem key={itemValue} value={itemValue} className="rounded-xl">
                {itemLabel}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>
    </div>
  );
}
