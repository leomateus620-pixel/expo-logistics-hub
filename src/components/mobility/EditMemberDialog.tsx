import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { useMobilityMembers } from '@/hooks/useMobilityMembers';
import { useOfficialCommittees } from '@/hooks/useOfficialCommittees';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: any | null;
}

export default function EditMemberDialog({ open, onOpenChange, member }: Props) {
  const { updateMember } = useMobilityMembers();
  const { committees } = useOfficialCommittees();

  const [memberName, setMemberName] = useState('');
  const [memberRole, setMemberRole] = useState('');
  const [memberIdentifier, setMemberIdentifier] = useState('');
  const [committeeId, setCommitteeId] = useState('');
  const [accessElectricCar, setAccessElectricCar] = useState(false);
  const [accessScooter, setAccessScooter] = useState(false);
  const [qrAccessFree, setQrAccessFree] = useState(false);
  const [accessStatus, setAccessStatus] = useState('pendente');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (member && open) {
      setMemberName(member.member_name || '');
      setMemberRole(member.member_role || '');
      setMemberIdentifier(member.member_identifier || '');
      setCommitteeId(member.committee_id || '');
      setAccessElectricCar(!!member.access_electric_car);
      setAccessScooter(!!member.access_scooter);
      setQrAccessFree(!!member.qr_access_free);
      setAccessStatus(member.access_status || 'pendente');
      setNotes(member.notes || '');
    }
  }, [member, open]);

  const handleSave = async () => {
    if (!member) return;
    if (!memberName.trim()) {
      toast.error('Nome é obrigatório');
      return;
    }
    if (!accessElectricCar && !accessScooter) {
      toast.error('Selecione ao menos um modal (Carro ou Patinete)');
      return;
    }
    setSaving(true);
    try {
      await updateMember.mutateAsync({
        id: member.id,
        member_name: memberName.trim(),
        member_role: memberRole.trim() || null,
        member_identifier: memberIdentifier.trim() || null,
        committee_id: committeeId || member.committee_id,
        access_electric_car: accessElectricCar,
        access_scooter: accessScooter,
        qr_access_free: qrAccessFree,
        access_status: accessStatus,
        notes: notes.trim() || null,
        form_id: member.form_id,
      });
      toast.success('Solicitação atualizada');
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao atualizar solicitação');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Solicitação</DialogTitle>
          <DialogDescription>
            Atualize os dados do integrante. Mudanças refletem nas autorizações de Carro Elétrico / Patinete.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Nome completo *</Label>
            <Input value={memberName} onChange={e => setMemberName(e.target.value)} placeholder="Nome do integrante" />
          </div>

          <div className="space-y-1.5">
            <Label>Cargo / Função</Label>
            <Input value={memberRole} onChange={e => setMemberRole(e.target.value)} placeholder="Ex: Coordenador" />
          </div>

          <div className="space-y-1.5">
            <Label>CPF / Identificador</Label>
            <Input value={memberIdentifier} onChange={e => setMemberIdentifier(e.target.value)} placeholder="000.000.000-00" />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label>Comissão</Label>
            <Select value={committeeId} onValueChange={setCommitteeId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a comissão" />
              </SelectTrigger>
              <SelectContent>
                {committees.map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>{c.committee_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={accessStatus} onValueChange={setAccessStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="liberado">Liberado</SelectItem>
                <SelectItem value="bloqueado">Bloqueado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 sm:col-span-2 p-3 rounded-xl border border-border/50 bg-muted/20">
            <Label className="text-xs text-muted-foreground">Modais e Acesso</Label>
            <div className="flex flex-wrap gap-4 pt-1">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox checked={accessElectricCar} onCheckedChange={v => setAccessElectricCar(!!v)} />
                Carro Elétrico
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox checked={accessScooter} onCheckedChange={v => setAccessScooter(!!v)} />
                Patinete
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox checked={qrAccessFree} onCheckedChange={v => setQrAccessFree(!!v)} />
                QR Gratuito
              </label>
            </div>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label>Observações</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notas internas (opcional)" rows={3} />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Salvar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
