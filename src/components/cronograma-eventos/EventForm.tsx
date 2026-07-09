import { useEffect, useMemo, useState } from 'react';
import { CalendarPlus, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cronogramaCommissionOptions } from '@/data/fenasoja2028CronogramaSeed';
import {
  statusLabels,
  priorityLabels,
  typeLabels,
  type CronogramaEvent,
} from '@/lib/cronograma-eventos';

interface EventFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event?: CronogramaEvent | null;
  onSubmit: (payload: Partial<CronogramaEvent> & Pick<CronogramaEvent, 'title' | 'category' | 'eventType'>) => Promise<void>;
  isSubmitting?: boolean;
}

const defaultState = {
  title: '',
  description: '',
  category: 'Planejamento, comissões, mídia e captação',
  eventType: 'planejamento' as CronogramaEvent['eventType'],
  sourceYear: 2028 as 2026 | 2027 | 2028,
  startDate: '',
  endDate: '',
  status: 'planejado' as CronogramaEvent['status'],
  priority: 'media' as CronogramaEvent['priority'],
  commissionSlug: 'none',
  responsibleName: '',
  location: '',
  sourceNote: '',
};

export default function EventForm({ open, onOpenChange, event, onSubmit, isSubmitting }: EventFormProps) {
  const [form, setForm] = useState(defaultState);

  useEffect(() => {
    if (!open) return;
    if (!event) {
      setForm(defaultState);
      return;
    }
    setForm({
      title: event.title,
      description: event.description ?? '',
      category: event.category,
      eventType: event.eventType,
      sourceYear: event.sourceYear,
      startDate: event.startDate ?? '',
      endDate: event.endDate ?? '',
      status: event.status,
      priority: event.priority,
      commissionSlug: event.commissionSlug ?? 'none',
      responsibleName: event.responsibleName ?? '',
      location: event.location ?? '',
      sourceNote: event.sourceNote ?? '',
    });
  }, [event, open]);

  const selectedCommission = useMemo(
    () => cronogramaCommissionOptions.find((commission) => commission.slug === form.commissionSlug),
    [form.commissionSlug],
  );

  const submit = async () => {
    await onSubmit({
      title: form.title.trim(),
      description: form.description.trim() || null,
      category: form.category.trim(),
      eventType: form.eventType,
      sourceYear: form.sourceYear,
      startDate: form.startDate || null,
      endDate: form.endDate || null,
      hasExactDate: Boolean(form.startDate),
      status: form.status,
      priority: form.priority,
      commissionSlug: form.commissionSlug !== 'none' ? form.commissionSlug : null,
      commissionName: selectedCommission?.name ?? null,
      linkedCommissions: selectedCommission ? [selectedCommission] : [],
      responsibleName: form.responsibleName.trim() || null,
      location: form.location.trim() || null,
      sourceNote: form.sourceNote.trim() || null,
      sourceSheet: event?.sourceSheet ?? 'Cadastro manual',
      isOfficialSeed: event?.isOfficialSeed ?? false,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92dvh] max-w-3xl flex-col border-border/70 bg-card/95 p-0 shadow-2xl backdrop-blur-2xl">
        <DialogHeader>
          <div className="border-b border-border/70 px-6 py-5">
          <DialogTitle className="flex items-center gap-2 text-xl font-black">
            <CalendarPlus className="h-5 w-5 text-gold" />
            {event ? 'Editar evento do cronograma' : 'Novo evento do cronograma'}
          </DialogTitle>
          <DialogDescription className="font-semibold text-muted-foreground">
            Campos administrativos do cronograma oficial.
          </DialogDescription>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <div className="grid gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="cronograma-title">Título *</Label>
              <Input
                id="cronograma-title"
                value={form.title}
                onChange={(e) => setForm((current) => ({ ...current, title: e.target.value }))}
                placeholder="Ex: Lançamento Fenasoja 2028"
                className="rounded-xl"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cronograma-description">Descrição / observações</Label>
              <Textarea
                id="cronograma-description"
                rows={3}
                value={form.description}
                onChange={(e) => setForm((current) => ({ ...current, description: e.target.value }))}
                placeholder="Detalhes operacionais, histórico, observações ou decisões pendentes"
                className="rounded-xl"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5">
                <Label>Ano</Label>
                <Select value={String(form.sourceYear)} onValueChange={(value) => setForm((current) => ({ ...current, sourceYear: Number(value) as 2026 | 2027 | 2028 }))}>
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2026">2026</SelectItem>
                    <SelectItem value="2027">2027</SelectItem>
                    <SelectItem value="2028">2028</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cronograma-start">Data inicial</Label>
                <Input id="cronograma-start" type="date" value={form.startDate} onChange={(e) => setForm((current) => ({ ...current, startDate: e.target.value }))} className="rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cronograma-end">Data final</Label>
                <Input id="cronograma-end" type="date" value={form.endDate} onChange={(e) => setForm((current) => ({ ...current, endDate: e.target.value }))} className="rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(value) => setForm((current) => ({ ...current, status: value as CronogramaEvent['status'] }))}>
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(statusLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5 lg:col-span-2">
                <Label htmlFor="cronograma-category">Categoria</Label>
                <Input id="cronograma-category" value={form.category} onChange={(e) => setForm((current) => ({ ...current, category: e.target.value }))} className="rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={form.eventType} onValueChange={(value) => setForm((current) => ({ ...current, eventType: value as CronogramaEvent['eventType'] }))}>
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(typeLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Prioridade</Label>
                <Select value={form.priority} onValueChange={(value) => setForm((current) => ({ ...current, priority: value as CronogramaEvent['priority'] }))}>
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(priorityLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Comissão vinculada</Label>
                <Select value={form.commissionSlug} onValueChange={(value) => setForm((current) => ({ ...current, commissionSlug: value }))}>
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem comissão definida</SelectItem>
                    {cronogramaCommissionOptions.map((commission) => <SelectItem key={commission.slug} value={commission.slug}>{commission.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cronograma-responsible">Responsável</Label>
                <Input id="cronograma-responsible" value={form.responsibleName} onChange={(e) => setForm((current) => ({ ...current, responsibleName: e.target.value }))} placeholder="Nome do responsável" className="rounded-xl" />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cronograma-location">Local</Label>
                <Input id="cronograma-location" value={form.location} onChange={(e) => setForm((current) => ({ ...current, location: e.target.value }))} placeholder="Local do evento" className="rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cronograma-note">Observação de origem</Label>
                <Input id="cronograma-note" value={form.sourceNote} onChange={(e) => setForm((current) => ({ ...current, sourceNote: e.target.value }))} placeholder="Nota histórica ou origem complementar" className="rounded-xl" />
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-border/70 bg-white/80 px-6 py-4 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={isSubmitting || !form.title.trim() || !form.category.trim()}>
            <Save className="h-4 w-4" />
            {isSubmitting ? 'Salvando...' : 'Salvar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
