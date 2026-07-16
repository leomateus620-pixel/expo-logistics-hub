import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { useFenasojaEvents } from '@/hooks/useFenasojaEvents';
import { useOrgMembers } from '@/hooks/useOrgMembers';
import { useCommissions } from '@/hooks/useCommissions';
import { toast } from 'sonner';
import { utcToSPLocal, ensureSPOffset } from '@/lib/utils';
import { Sparkles } from 'lucide-react';

interface EventFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: any | null;
}

const empty = {
  titulo: '',
  descricao: '',
  inicio_em: '',
  fim_em: '',
  local: '',
  tipo_tag: '',
  responsavel_user_id: 'none',
  commission_id: 'none',
  repetir_diariamente: false,
};

export default function EventForm({ open, onOpenChange, editing }: EventFormProps) {
  const { create, update } = useFenasojaEvents();
  const { members } = useOrgMembers();
  const { commissions } = useCommissions();

  const [form, setForm] = useState(() => {
    if (editing) {
      return {
        titulo: editing.titulo || '',
        descricao: editing.descricao || '',
        inicio_em: editing.inicio_em ? utcToSPLocal(editing.inicio_em) : '',
        fim_em: editing.fim_em ? utcToSPLocal(editing.fim_em) : '',
        local: editing.local || '',
        tipo_tag: editing.tipo_tag || '',
        responsavel_user_id: editing.responsavel_user_id || 'none',
        commission_id: editing.commission_id || 'none',
        repetir_diariamente: false,
      };
    }
    return empty;
  });

  const isSubmitting = create.isPending || update.isPending;

  const handleSave = async () => {
    if (!form.titulo.trim()) {
      toast.error('Informe o título do evento');
      return;
    }
    if (!form.inicio_em || !form.fim_em) {
      toast.error('Defina início e fim');
      return;
    }

    const payload = {
      titulo: form.titulo.toUpperCase(),
      descricao: form.descricao || null,
      inicio_em: ensureSPOffset(form.inicio_em),
      fim_em: ensureSPOffset(form.fim_em),
      local: form.local || null,
      tipo_tag: form.tipo_tag || null,
      responsavel_user_id: form.responsavel_user_id !== 'none' ? form.responsavel_user_id : null,
      commission_id: form.commission_id !== 'none' ? form.commission_id : null,
    };

    // Format a Date as YYYY-MM-DDTHH:MM in São Paulo timezone (no offset)
    const toSPLocalString = (d: Date): string => {
      const raw = d.toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' });
      const [date, time] = raw.split(' ');
      return `${date}T${time?.slice(0, 5) || '00:00'}`;
    };

    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, ...payload });
        toast.success('Evento atualizado');
      } else if (form.repetir_diariamente) {
        // Use full ISO with SP offset as anchor, then add days
        const startISO = ensureSPOffset(form.inicio_em);
        const endISO = ensureSPOffset(form.fim_em);
        const start = new Date(startISO);
        const end = new Date(endISO);
        const diffMs = end.getTime() - start.getTime();
        const MAX_DAYS = 30;
        let count = 0;
        for (let i = 0; i < MAX_DAYS; i++) {
          const newStart = new Date(start.getTime() + i * 86400000);
          const newEnd = new Date(newStart.getTime() + diffMs);
          await create.mutateAsync({
            ...payload,
            inicio_em: ensureSPOffset(toSPLocalString(newStart)),
            fim_em: ensureSPOffset(toSPLocalString(newEnd)),
          });
          count++;
        }
        toast.success(`${count} eventos criados`);
      } else {
        await create.mutateAsync(payload);
        toast.success('Evento criado');
      }
      onOpenChange(false);
      setForm(empty);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-gold" />
            {editing ? 'Editar Evento Fenasoja' : 'Novo Evento Fenasoja'}
          </DialogTitle>
          <DialogDescription>
            Base operacional histórica · 01/05 a 10/05/2026
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="titulo">Título *</Label>
            <Input
              id="titulo"
              value={form.titulo}
              onChange={(e) => setForm({ ...form, titulo: e.target.value })}
              placeholder="EX: ABERTURA OFICIAL FENASOJA"
              className="uppercase"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="descricao">Observações</Label>
            <Textarea
              id="descricao"
              rows={3}
              value={form.descricao}
              onChange={(e) => setForm({ ...form, descricao: e.target.value })}
              placeholder="Detalhes, autoridades, contatos…"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Início *</Label>
              <DateTimePicker
                value={form.inicio_em}
                onChange={(v) => setForm({ ...form, inicio_em: v })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Fim *</Label>
              <DateTimePicker
                value={form.fim_em}
                onChange={(v) => setForm({ ...form, fim_em: v })}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="local">Local</Label>
            <Input
              id="local"
              value={form.local}
              onChange={(e) => setForm({ ...form, local: e.target.value })}
              placeholder="Ex: Etnia Italiana — Parque de Exposições"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Comissão</Label>
              <Select value={form.commission_id} onValueChange={(v) => setForm({ ...form, commission_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma</SelectItem>
                  {commissions.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Responsável</Label>
              <Select value={form.responsavel_user_id} onValueChange={(v) => setForm({ ...form, responsavel_user_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Ninguém</SelectItem>
                  {members.map((m: any) => (
                    <SelectItem key={m.user_id} value={m.user_id}>{m.nome_exibicao}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tipo_tag">Categoria/Tag</Label>
            <Input
              id="tipo_tag"
              value={form.tipo_tag}
              onChange={(e) => setForm({ ...form, tipo_tag: e.target.value })}
              placeholder="institucional, cerimônia, palestra…"
            />
          </div>

          {!editing && (
            <div className="flex items-center justify-between rounded-xl border border-gold/20 bg-gold/5 px-3 py-2.5">
              <div>
                <Label htmlFor="repetir" className="text-sm font-medium">Repetir diariamente</Label>
                <p className="text-[11px] text-muted-foreground">Cria cópias diárias por até 30 dias</p>
              </div>
              <Switch
                id="repetir"
                checked={form.repetir_diariamente}
                onCheckedChange={(checked) => setForm({ ...form, repetir_diariamente: checked })}
              />
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={isSubmitting}>
              {isSubmitting ? 'Salvando…' : editing ? 'Salvar alterações' : 'Criar evento'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
