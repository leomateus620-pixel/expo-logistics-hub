import { useEffect, useState } from 'react';
import { CalendarClock, Layers3, Plus, Save, Trash2, X } from 'lucide-react';
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
import { categoryLabels, priorityLabels, statusLabels } from './cronogramaData';
import type {
  CronogramaCategory,
  CronogramaEvent,
  CronogramaKind,
  CronogramaPriority,
  CronogramaStatus,
} from './types';

const kindLabels: Record<CronogramaKind, string> = {
  milestone: 'Marco',
  event: 'Evento',
  meeting: 'Reunião',
  deadline: 'Prazo',
  decision: 'Decisão',
};

const defaultForm: CronogramaEvent = {
  id: '',
  title: '',
  summary: '',
  date: null,
  startTime: '',
  endTime: '',
  year: 2028,
  category: 'governanca',
  status: 'planned',
  priority: 'medium',
  kind: 'event',
  location: '',
  owner: '',
  commission: '',
  pendingReason: '',
  decisionNeeded: '',
  subevents: [],
};

type SubeventFormItem = NonNullable<CronogramaEvent['subevents']>[number];

export function EventForm({
  event,
  onSubmit,
  onCancel,
  submitLabel = 'Salvar alterações',
}: {
  event?: CronogramaEvent | null;
  onSubmit: (event: CronogramaEvent) => void;
  onCancel: () => void;
  submitLabel?: string;
}) {
  const [form, setForm] = useState<CronogramaEvent>(() => ({ ...defaultForm, ...(event || {}) }));

  useEffect(() => {
    setForm({ ...defaultForm, ...(event || {}) });
  }, [event]);

  const update = <K extends keyof CronogramaEvent>(key: K, value: CronogramaEvent[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const updateSubevent = <K extends keyof SubeventFormItem>(index: number, key: K, value: SubeventFormItem[K]) => {
    setForm((current) => ({
      ...current,
      subevents: (current.subevents ?? []).map((subevent, itemIndex) => (
        itemIndex === index ? { ...subevent, [key]: value } : subevent
      )),
    }));
  };

  const addSubevent = () => {
    setForm((current) => ({
      ...current,
      subevents: [
        ...(current.subevents ?? []),
        { title: '', date: null, owner: '', status: 'planned' },
      ],
    }));
  };

  const removeSubevent = (index: number) => {
    setForm((current) => ({
      ...current,
      subevents: (current.subevents ?? []).filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const handleSubmit = () => {
    const normalizedDate = form.date?.trim() ? form.date : null;
    const nextYear = normalizedDate ? Number(normalizedDate.slice(0, 4)) : Number(form.year || 2028);
    const normalizedSubevents = (form.subevents ?? [])
      .map((subevent) => ({
        ...subevent,
        title: subevent.title.trim(),
        date: subevent.date?.trim() || null,
        owner: subevent.owner?.trim() || undefined,
      }))
      .filter((subevent) => subevent.title.length > 0);

    onSubmit({
      ...form,
      title: form.title.trim() || 'Novo evento do cronograma',
      summary: form.summary.trim() || 'Descrição executiva a complementar.',
      date: normalizedDate,
      year: nextYear,
      startTime: form.startTime?.trim() || undefined,
      endTime: form.endTime?.trim() || undefined,
      location: form.location?.trim() || undefined,
      owner: form.owner?.trim() || undefined,
      commission: form.commission?.trim() || undefined,
      pendingReason: form.pendingReason?.trim() || undefined,
      decisionNeeded: form.decisionNeeded?.trim() || undefined,
      subevents: normalizedSubevents,
    });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/60 bg-white/58 p-4 shadow-[inset_0_1px_0_rgb(255_255_255/0.62)]">
        <div className="mb-3 flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-gold" />
          <h3 className="text-sm font-black uppercase tracking-[0.14em] text-foreground/72">Identidade do evento</h3>
        </div>
        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="cronograma-title">Título</Label>
            <Input
              id="cronograma-title"
              value={form.title}
              onChange={(event) => update('title', event.target.value)}
              placeholder="Ex: Abertura oficial Fenasoja 2028"
              className="bg-white/72"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cronograma-summary">Resumo executivo</Label>
            <Textarea
              id="cronograma-summary"
              rows={3}
              value={form.summary}
              onChange={(event) => update('summary', event.target.value)}
              placeholder="Síntese clara para leitura rápida no cronograma."
              className="rounded-2xl bg-white/72"
            />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-white/60 bg-white/58 p-4 shadow-[inset_0_1px_0_rgb(255_255_255/0.62)]">
        <div className="mb-3 flex items-center gap-2">
          <Layers3 className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-black uppercase tracking-[0.14em] text-foreground/72">Classificação</h3>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField
            label="Categoria"
            value={form.category}
            onChange={(value) => update('category', value as CronogramaCategory)}
            items={categoryLabels}
          />
          <SelectField
            label="Status"
            value={form.status}
            onChange={(value) => update('status', value as CronogramaStatus)}
            items={statusLabels}
          />
          <SelectField
            label="Prioridade"
            value={form.priority}
            onChange={(value) => update('priority', value as CronogramaPriority)}
            items={priorityLabels}
          />
          <SelectField
            label="Tipo"
            value={form.kind}
            onChange={(value) => update('kind', value as CronogramaKind)}
            items={kindLabels}
          />
        </div>
      </div>

      <div className="rounded-2xl border border-white/60 bg-white/58 p-4 shadow-[inset_0_1px_0_rgb(255_255_255/0.62)]">
        <h3 className="mb-3 text-sm font-black uppercase tracking-[0.14em] text-foreground/72">Data, local e responsáveis</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="cronograma-date">Data</Label>
            <Input
              id="cronograma-date"
              type="date"
              value={form.date || ''}
              onChange={(event) => update('date', event.target.value || null)}
              className="bg-white/72"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cronograma-start">Início</Label>
            <Input
              id="cronograma-start"
              type="time"
              value={form.startTime || ''}
              onChange={(event) => update('startTime', event.target.value)}
              className="bg-white/72"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cronograma-end">Fim</Label>
            <Input
              id="cronograma-end"
              type="time"
              value={form.endTime || ''}
              onChange={(event) => update('endTime', event.target.value)}
              className="bg-white/72"
            />
          </div>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="cronograma-location">Local</Label>
            <Input
              id="cronograma-location"
              value={form.location || ''}
              onChange={(event) => update('location', event.target.value)}
              placeholder="Local ou área do parque"
              className="bg-white/72"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cronograma-owner">Responsável</Label>
            <Input
              id="cronograma-owner"
              value={form.owner || ''}
              onChange={(event) => update('owner', event.target.value)}
              placeholder="Comissão, pessoa ou coordenação"
              className="bg-white/72"
            />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-amber-900/10 bg-gold/[0.07] p-4">
        <h3 className="mb-3 text-sm font-black uppercase tracking-[0.14em] text-amber-950/72">Quando ainda não há data</h3>
        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="cronograma-pending">Motivo da pendência</Label>
            <Input
              id="cronograma-pending"
              value={form.pendingReason || ''}
              onChange={(event) => update('pendingReason', event.target.value)}
              placeholder="Ex: aguardando contrato, fornecedor ou validação externa"
              className="bg-white/72"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cronograma-decision">Decisão necessária</Label>
            <Textarea
              id="cronograma-decision"
              rows={2}
              value={form.decisionNeeded || ''}
              onChange={(event) => update('decisionNeeded', event.target.value)}
              placeholder="Qual decisão destrava este item?"
              className="rounded-2xl bg-white/72"
            />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-white/60 bg-white/58 p-4 shadow-[inset_0_1px_0_rgb(255_255_255/0.62)]">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-black uppercase tracking-[0.14em] text-foreground/72">Subeventos vinculados</h3>
            <p className="mt-1 text-xs text-muted-foreground">Entregas menores, reuniões de apoio ou ações dependentes do evento principal.</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={addSubevent} className="rounded-full bg-white/70 text-xs">
            <Plus className="h-4 w-4" />
            Adicionar subevento
          </Button>
        </div>

        {(form.subevents ?? []).length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/50 bg-white/45 p-4 text-center text-sm text-muted-foreground">
            Nenhum subevento vinculado.
          </div>
        ) : (
          <div className="space-y-3">
            {(form.subevents ?? []).map((subevent, index) => (
              <div key={`${subevent.title}-${index}`} className="rounded-2xl border border-border/35 bg-white/64 p-3">
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_150px]">
                  <div className="space-y-1.5">
                    <Label htmlFor={`cronograma-subevent-title-${index}`}>Título do subevento</Label>
                    <Input
                      id={`cronograma-subevent-title-${index}`}
                      value={subevent.title}
                      onChange={(event) => updateSubevent(index, 'title', event.target.value)}
                      placeholder="Ex: validação de fornecedores"
                      className="bg-white/72"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`cronograma-subevent-date-${index}`}>Data</Label>
                    <Input
                      id={`cronograma-subevent-date-${index}`}
                      type="date"
                      value={subevent.date || ''}
                      onChange={(event) => updateSubevent(index, 'date', event.target.value || null)}
                      className="bg-white/72"
                    />
                  </div>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_170px_auto]">
                  <div className="space-y-1.5">
                    <Label htmlFor={`cronograma-subevent-owner-${index}`}>Responsável</Label>
                    <Input
                      id={`cronograma-subevent-owner-${index}`}
                      value={subevent.owner || ''}
                      onChange={(event) => updateSubevent(index, 'owner', event.target.value)}
                      placeholder="Comissão ou responsável"
                      className="bg-white/72"
                    />
                  </div>
                  <SelectField
                    label="Status"
                    value={subevent.status || 'planned'}
                    onChange={(value) => updateSubevent(index, 'status', value as CronogramaStatus)}
                    items={statusLabels}
                  />
                  <div className="flex items-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeSubevent(index)}
                      className="h-10 w-10 rounded-full text-muted-foreground hover:bg-red-50 hover:text-red-800"
                      aria-label="Remover subevento"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="sticky bottom-0 -mx-1 flex justify-end gap-2 border-t border-white/60 bg-white/80 px-1 py-3 backdrop-blur-xl">
        <Button type="button" variant="outline" onClick={onCancel} className="rounded-full">
          <X className="h-4 w-4" />
          Cancelar
        </Button>
        <Button type="button" onClick={handleSubmit} className="rounded-full">
          <Save className="h-4 w-4" />
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}

function SelectField<T extends string>({
  label,
  value,
  onChange,
  items,
}: {
  label: string;
  value: T;
  onChange: (value: string) => void;
  items: Record<string, string>;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="rounded-2xl border-white/60 bg-white/72">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="rounded-2xl bg-white/95">
          {Object.entries(items).map(([itemValue, itemLabel]) => (
            <SelectItem key={itemValue} value={itemValue} className="rounded-xl">
              {itemLabel}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
