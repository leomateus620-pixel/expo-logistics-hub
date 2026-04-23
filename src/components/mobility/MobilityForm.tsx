import { useState, useMemo } from 'react';
import { Plus, Send, Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useOfficialCommittees } from '@/hooks/useOfficialCommittees';
import { useMobilityForms } from '@/hooks/useMobilityForms';
import { useMobilityMembers } from '@/hooks/useMobilityMembers';
import { supabase } from '@/integrations/supabase/client';
import MobilityMemberRow, { type MemberDraft } from './MobilityMemberRow';
import { toast } from 'sonner';
import { toTitleCase, formatCpf } from '@/lib/textNormalize';

const emptyMember = (): MemberDraft => ({
  member_name: '', member_role: '', member_identifier: '',
  access_electric_car: false, access_scooter: false, notes: '',
});

interface Props {
  onSuccess?: () => void;
}

export default function MobilityForm({ onSuccess }: Props) {
  const { committees, isLoading: loadingCommittees, isError: committeesError, error: committeesErrorObj } = useOfficialCommittees();
  const { createForm } = useMobilityForms();
  const { addMember } = useMobilityMembers();

  const safeCommittees = useMemo(() => (Array.isArray(committees) ? committees : []), [committees]);

  const [committeeId, setCommitteeId] = useState('');
  const [opName, setOpName] = useState('');
  const [opPhone, setOpPhone] = useState('');
  const [opEmail, setOpEmail] = useState('');
  const [needsCar, setNeedsCar] = useState(false);
  const [needsScooter, setNeedsScooter] = useState(false);
  const [members, setMembers] = useState<MemberDraft[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const selected = useMemo(() => safeCommittees.find((c: any) => c?.id === committeeId), [safeCommittees, committeeId]);

  const handleMemberChange = (idx: number, field: keyof MemberDraft, value: any) => {
    setMembers(prev => prev.map((m, i) => i === idx ? { ...m, [field]: value } : m));
  };

  const handleSubmit = async () => {
    if (!committeeId || !selected) { toast.error('Selecione uma comissão'); return; }
    if ((needsCar || needsScooter) && members.length === 0) {
      toast.error('Adicione pelo menos um integrante'); return;
    }
    const invalidMembers = members.filter(m => !m.member_name.trim());
    if (invalidMembers.length > 0) { toast.error('Preencha o nome de todos os integrantes'); return; }

    setSubmitting(true);
    try {
      const form = await createForm.mutateAsync({
        committee_id: committeeId,
        committee_name_snapshot: selected.committee_name,
        president_name_snapshot: selected.president_name,
        operational_responsible_name: toTitleCase(opName) || undefined,
        operational_responsible_phone: opPhone.trim() || undefined,
        operational_responsible_email: opEmail.trim() || undefined,
        needs_electric_car: needsCar,
        needs_scooter: needsScooter,
      });

      for (const m of members) {
        await addMember.mutateAsync({
          form_id: form.id,
          committee_id: committeeId,
          member_name: toTitleCase(m.member_name),
          member_role: toTitleCase(m.member_role) || undefined,
          member_identifier: formatCpf(m.member_identifier) || undefined,
          access_electric_car: m.access_electric_car,
          access_scooter: m.access_scooter,
          notes: m.notes || undefined,
        });
      }

      // Sync to mobility_authorizations
      await (supabase as any).rpc('sync_internal_mobility_form', { _form_id: form.id });

      toast.success('Solicitação enviada com sucesso!');
      setCommitteeId(''); setOpName(''); setOpPhone(''); setOpEmail('');
      setNeedsCar(false); setNeedsScooter(false); setMembers([]);
      onSuccess?.();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao enviar');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="border-border/50">
      <CardHeader>
        <CardTitle className="text-lg">Nova Solicitação de Mobilidade</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {committeesError && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Não foi possível carregar a lista de comissões</AlertTitle>
            <AlertDescription className="text-xs">
              Recarregue a página ou contate o administrador.
              {committeesErrorObj?.message ? ` (${committeesErrorObj.message})` : ''}
            </AlertDescription>
          </Alert>
        )}

        {/* Committee select */}
        <div className="space-y-2">
          <Label>Comissão *</Label>
          <Select value={committeeId} onValueChange={setCommitteeId}>
            <SelectTrigger>
              <SelectValue placeholder={loadingCommittees ? 'Carregando...' : 'Selecione a comissão'} />
            </SelectTrigger>
            <SelectContent>
              {safeCommittees.map((c: any) => (
                <SelectItem key={c.id} value={c.id}>{c.committee_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selected && (
          <div className="p-3 rounded-xl bg-primary/5 border border-primary/10">
            <p className="text-sm"><span className="font-semibold text-primary">Presidente:</span> {selected.president_name}</p>
          </div>
        )}

        {/* Operational responsible */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Responsável Operacional</Label>
            <Input placeholder="Nome" value={opName} onChange={e => setOpName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Telefone</Label>
            <Input placeholder="(00) 00000-0000" value={opPhone} onChange={e => setOpPhone(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">E-mail</Label>
            <Input placeholder="email@exemplo.com" value={opEmail} onChange={e => setOpEmail(e.target.value)} />
          </div>
        </div>

        {/* Toggles */}
        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-3">
            <Switch checked={needsCar} onCheckedChange={setNeedsCar} />
            <span className="text-sm font-medium">Carro Elétrico</span>
          </label>
          <label className="flex items-center gap-3">
            <Switch checked={needsScooter} onCheckedChange={setNeedsScooter} />
            <span className="text-sm font-medium">Patinete</span>
          </label>
        </div>

        {/* Members */}
        {(needsCar || needsScooter) && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Integrantes Autorizados</Label>
              <Button variant="outline" size="sm" onClick={() => setMembers(prev => [...prev, emptyMember()])}>
                <Plus className="w-3.5 h-3.5 mr-1" /> Adicionar
              </Button>
            </div>
            {members.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum integrante adicionado</p>
            )}
            {members.map((m, i) => (
              <MobilityMemberRow
                key={i}
                member={m}
                index={i}
                onChange={handleMemberChange}
                onRemove={idx => setMembers(prev => prev.filter((_, j) => j !== idx))}
                needsCar={needsCar}
                needsScooter={needsScooter}
              />
            ))}
          </div>
        )}

        <Button onClick={handleSubmit} disabled={submitting} className="w-full">
          {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
          Enviar Solicitação
        </Button>
      </CardContent>
    </Card>
  );
}
