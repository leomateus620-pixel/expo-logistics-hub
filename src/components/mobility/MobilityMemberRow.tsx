import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';

export interface MemberDraft {
  member_name: string;
  member_role: string;
  member_identifier: string;
  access_electric_car: boolean;
  access_scooter: boolean;
  qr_access_free: boolean;
  notes: string;
}

interface Props {
  member: MemberDraft;
  index: number;
  onChange: (index: number, field: keyof MemberDraft, value: any) => void;
  onRemove: (index: number) => void;
  needsCar: boolean;
  needsScooter: boolean;
}

export default function MobilityMemberRow({ member, index, onChange, onRemove, needsCar, needsScooter }: Props) {
  return (
    <div className="p-3 rounded-xl border border-border/50 bg-muted/30 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground">Integrante {index + 1}</span>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => onRemove(index)}>
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <Input
          placeholder="Nome completo *"
          value={member.member_name}
          onChange={e => onChange(index, 'member_name', e.target.value)}
        />
        <Input
          placeholder="Cargo / Função"
          value={member.member_role}
          onChange={e => onChange(index, 'member_role', e.target.value)}
        />
        <Input
          placeholder="CPF / Identificador"
          value={member.member_identifier}
          onChange={e => onChange(index, 'member_identifier', e.target.value)}
        />
      </div>
      <div className="flex flex-wrap gap-4">
        {needsCar && (
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={member.access_electric_car}
              onCheckedChange={v => onChange(index, 'access_electric_car', !!v)}
            />
            Carro Elétrico
          </label>
        )}
        {needsScooter && (
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={member.access_scooter}
              onCheckedChange={v => onChange(index, 'access_scooter', !!v)}
            />
            Patinete
          </label>
        )}
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={member.qr_access_free}
            onCheckedChange={v => onChange(index, 'qr_access_free', !!v)}
          />
          QR Gratuito
        </label>
      </div>
      <Input
        placeholder="Observações (opcional)"
        value={member.notes}
        onChange={e => onChange(index, 'notes', e.target.value)}
      />
    </div>
  );
}
