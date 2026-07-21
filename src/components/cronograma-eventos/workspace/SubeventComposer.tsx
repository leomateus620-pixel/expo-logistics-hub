import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { CalendarDays, Link2, Loader2, Save, Sparkles, UserRound, X } from 'lucide-react';
import { cronogramaCommissionOptions } from '@/data/fenasoja2028CronogramaSeed';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { statusLabels } from '@/components/cronograma-eventos/cronogramaData';
import type {
  CronogramaStatus,
  CronogramaSubevent,
  CronogramaSubeventInput,
} from '@/components/cronograma-eventos/types';

const editableStatuses: CronogramaStatus[] = [
  'planned',
  'in_progress',
  'in_definition',
  'blocked',
  'completed',
  'cancelled',
];

const emptyInput: CronogramaSubeventInput = {
  title: '',
  description: '',
  date: null,
  startTime: '',
  endTime: '',
  status: 'planned',
  responsible: '',
  commissionSlug: '',
};

function createRelationshipRequestId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function inputFromSubevent(subevent?: CronogramaSubevent | null, defaultDate?: string | null): CronogramaSubeventInput {
  if (!subevent) return { ...emptyInput, date: defaultDate ?? null };
  return {
    title: subevent.title,
    description: subevent.description ?? '',
    date: subevent.date ?? defaultDate ?? null,
    startTime: subevent.startTime ?? '',
    endTime: subevent.endTime ?? '',
    status: subevent.status ?? 'planned',
    responsible: subevent.owner ?? '',
    commissionSlug: subevent.commissionSlug ?? '',
  };
}

export function SubeventComposer({
  initialSubevent,
  connectedTo,
  mode = 'create',
  defaultDate = null,
  onSubmit,
  onCancel,
}: {
  initialSubevent?: CronogramaSubevent | null;
  connectedTo: string;
  mode?: 'create' | 'edit';
  defaultDate?: string | null;
  onSubmit: (input: CronogramaSubeventInput) => Promise<void> | void;
  onCancel: () => void;
}) {
  const instanceId = useId().replace(/:/g, '');
  const requestIdRef = useRef(mode === 'create' ? createRelationshipRequestId() : undefined);
  const initialInput = useMemo(() => inputFromSubevent(initialSubevent, defaultDate), [defaultDate, initialSubevent]);
  const [form, setForm] = useState(initialInput);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(initialInput);
    setTitleError(null);
    setSubmitError(null);
  }, [initialInput]);

  const fieldId = (name: string) => `${instanceId}-${name}`;
  const update = <K extends keyof CronogramaSubeventInput>(key: K, value: CronogramaSubeventInput[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    if (!form.title.trim()) {
      setTitleError('Informe um título para conectar este subevento.');
      document.getElementById(fieldId('title'))?.focus();
      return;
    }

    setSaving(true);
    setSubmitError(null);
    try {
      await onSubmit({
        ...form,
        requestId: requestIdRef.current,
        title: form.title.trim(),
        description: form.description.trim(),
        startTime: form.startTime?.trim() || undefined,
        endTime: form.endTime?.trim() || undefined,
        responsible: form.responsible.trim(),
      });
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Não foi possível salvar este subevento.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className="cronograma-thought-composer"
      data-mode={mode}
      data-testid={mode === 'create' ? 'subevent-composer' : 'subevent-editor'}
      onSubmit={handleSubmit}
      noValidate
    >
      <span className="cronograma-thought-tail" aria-hidden="true" />
      <div className="cronograma-thought-composer-heading">
        <span className="cronograma-thought-composer-icon" aria-hidden="true">
          {mode === 'create' ? <Sparkles /> : <Link2 />}
        </span>
        <div className="min-w-0">
          <p>{mode === 'create' ? 'Nova conexão' : 'Ajustar conexão'}</p>
          <h3>{mode === 'create' ? 'Adicionar subevento' : 'Editar subevento'}</h3>
          <span>Ligado a: {connectedTo}</span>
        </div>
        <button
          type="button"
          className="cronograma-thought-close focus-ring"
          onClick={onCancel}
          disabled={saving}
          aria-label="Fechar painel de subevento"
        >
          <X aria-hidden="true" />
        </button>
      </div>

      <div className="cronograma-thought-fields">
        <div className="cronograma-thought-field is-wide">
          <Label htmlFor={fieldId('title')}>Título</Label>
          <Input
            id={fieldId('title')}
            value={form.title}
            onChange={(event) => {
              update('title', event.target.value);
              if (titleError) setTitleError(null);
            }}
            placeholder="Ex: confirmar fornecedores da operação"
            autoFocus
            aria-invalid={Boolean(titleError) || undefined}
            aria-describedby={titleError ? fieldId('title-error') : undefined}
          />
          {titleError && <p id={fieldId('title-error')} className="cronograma-thought-error" role="alert">{titleError}</p>}
        </div>

        <div className="cronograma-thought-field is-wide">
          <Label htmlFor={fieldId('description')}>Descrição</Label>
          <Textarea
            id={fieldId('description')}
            value={form.description}
            onChange={(event) => update('description', event.target.value)}
            placeholder="Contexto curto, resultado esperado ou dependência."
            rows={3}
          />
        </div>

        <div className="cronograma-thought-field">
          <Label htmlFor={fieldId('date')} className="inline-flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" /> Data ou prazo
          </Label>
          <Input
            id={fieldId('date')}
            type="date"
            value={form.date ?? ''}
            onChange={(event) => update('date', event.target.value || null)}
          />
        </div>

        <div className="cronograma-thought-field">
          <Label htmlFor={fieldId('start-time')}>Início</Label>
          <Input
            id={fieldId('start-time')}
            type="time"
            value={form.startTime ?? ''}
            onChange={(event) => update('startTime', event.target.value)}
          />
        </div>

        <div className="cronograma-thought-field">
          <Label htmlFor={fieldId('end-time')}>Fim</Label>
          <Input
            id={fieldId('end-time')}
            type="time"
            value={form.endTime ?? ''}
            onChange={(event) => update('endTime', event.target.value)}
          />
        </div>

        <div className="cronograma-thought-field">
          <Label htmlFor={fieldId('status')}>Status</Label>
          <select
            id={fieldId('status')}
            className="cronograma-thought-select focus-ring"
            value={form.status}
            onChange={(event) => update('status', event.target.value as CronogramaStatus)}
          >
            {editableStatuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
          </select>
        </div>

        <div className="cronograma-thought-field">
          <Label htmlFor={fieldId('responsible')} className="inline-flex items-center gap-1.5">
            <UserRound className="h-3.5 w-3.5" aria-hidden="true" /> Responsável
          </Label>
          <Input
            id={fieldId('responsible')}
            value={form.responsible}
            onChange={(event) => update('responsible', event.target.value)}
            placeholder="Pessoa ou coordenação"
          />
        </div>

        <div className="cronograma-thought-field">
          <Label htmlFor={fieldId('commission')}>Comissão / categoria</Label>
          <select
            id={fieldId('commission')}
            className="cronograma-thought-select focus-ring"
            value={form.commissionSlug}
            onChange={(event) => update('commissionSlug', event.target.value)}
          >
            <option value="">A definir</option>
            {cronogramaCommissionOptions.map((commission) => (
              <option key={commission.slug} value={commission.slug}>{commission.name}</option>
            ))}
          </select>
        </div>
      </div>

      {submitError && <p className="cronograma-thought-submit-error" role="alert">{submitError}</p>}

      <div className="cronograma-thought-actions">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={saving} className="rounded-xl">
          Cancelar
        </Button>
        <Button type="submit" disabled={saving} className="rounded-xl">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? 'Conectando…' : mode === 'create' ? 'Conectar subevento' : 'Salvar conexão'}
        </Button>
      </div>
    </form>
  );
}
