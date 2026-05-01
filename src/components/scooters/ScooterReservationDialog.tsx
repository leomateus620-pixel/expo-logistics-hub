import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { cn, nowSPLocal, ensureSPOffset } from '@/lib/utils';
import { PARTNERS, type PartnerSlug } from '@/lib/partners';
import { useScooterReservations, type ScooterReservation, type ReservationTipo } from '@/hooks/useScooterReservations';
import { useScooters } from '@/hooks/useScooters';
import { useOrgMembers } from '@/hooks/useOrgMembers';
import { useCommissions } from '@/hooks/useCommissions';
import { useMobilityAuthorizations } from '@/hooks/useMobilityAuthorizations';
import { toast } from 'sonner';
import { AlertTriangle } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  reservation?: ScooterReservation | null;
}

function addHoursLocal(local: string, hours: number): string {
  const [datePart, timePart] = local.split('T');
  const [y, mo, da] = datePart.split('-').map(Number);
  const [h, mi] = (timePart || '00:00').split(':').map(Number);
  const utc = new Date(Date.UTC(y, (mo || 1) - 1, da || 1, h || 0, mi || 0));
  utc.setUTCHours(utc.getUTCHours() + hours);
  const yy = utc.getUTCFullYear();
  const mm = String(utc.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(utc.getUTCDate()).padStart(2, '0');
  const hh = String(utc.getUTCHours()).padStart(2, '0');
  const mn = String(utc.getUTCMinutes()).padStart(2, '0');
  return `${yy}-${mm}-${dd}T${hh}:${mn}`;
}

export default function ScooterReservationDialog({ open, onOpenChange, reservation }: Props) {
  const { scooters } = useScooters();
  const { members } = useOrgMembers();
  const { commissions } = useCommissions();
  const { authorizations } = useMobilityAuthorizations('patinete');
  const { create, update } = useScooterReservations();

  const sortedAuthorizations = useMemo(() => {
    const norm = (s: string) => (s || '').toLocaleLowerCase('pt-BR');
    return [...authorizations].sort((a: any, b: any) => {
      const sa = a.access_status === 'liberado' ? 0 : 1;
      const sb = b.access_status === 'liberado' ? 0 : 1;
      if (sa !== sb) return sa - sb;
      return norm(a.member_name).localeCompare(norm(b.member_name));
    });
  }, [authorizations]);

  const [scooterId, setScooterId] = useState('');
  const [tipo, setTipo] = useState<ReservationTipo>('outros');
  const [userId, setUserId] = useState('');
  const [comissao, setComissao] = useState('');
  const [empresaSlug, setEmpresaSlug] = useState<PartnerSlug | ''>('');
  const [nomeExterno, setNomeExterno] = useState('');
  const [telefoneExterno, setTelefoneExterno] = useState('');
  const [inicio, setInicio] = useState('');
  const [fim, setFim] = useState('');
  const [obs, setObs] = useState('');
  const submittingRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    if (reservation) {
      setScooterId(reservation.scooter_id);
      setTipo(reservation.tipo_responsavel);
      setUserId(reservation.responsavel_user_id || '');
      setComissao(reservation.comissao || '');
      setEmpresaSlug((reservation.empresa_slug as PartnerSlug) || '');
      setNomeExterno(reservation.nome_externo || '');
      setTelefoneExterno(reservation.telefone_externo || '');
      const toLocal = (iso: string) => {
        const d = new Date(iso);
        const raw = d.toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' });
        const [date, time] = raw.split(' ');
        return `${date}T${time?.slice(0, 5) || '00:00'}`;
      };
      setInicio(toLocal(reservation.inicio_em));
      setFim(toLocal(reservation.fim_em));
      setObs(reservation.observacoes || '');
    } else {
      setScooterId('');
      setTipo('outros');
      setUserId('');
      setComissao('');
      setEmpresaSlug('');
      setNomeExterno('');
      setTelefoneExterno('');
      const start = nowSPLocal();
      setInicio(start);
      setFim(addHoursLocal(start, 2));
      setObs('');
    }
  }, [open, reservation]);

  const memberCommissionMap = useMemo(() => {
    const map = new Map<string, string | null>();
    members.forEach((m: any) => {
      const c = commissions.find((c: any) => c.id === m.commission_id);
      map.set(m.user_id, c?.nome || null);
    });
    return map;
  }, [members, commissions]);

  const handleSubmit = async () => {
    if (submittingRef.current) return;
    if (!scooterId) { toast.error('Selecione o patinete'); return; }
    if (!inicio || !fim) { toast.error('Defina o período'); return; }
    if (new Date(fim) <= new Date(inicio)) { toast.error('A devolução deve ser depois do início'); return; }
    if (tipo === 'interno' && !userId) { toast.error('Selecione quem retira'); return; }
    if (tipo === 'empresa' && !empresaSlug) { toast.error('Selecione a empresa parceira'); return; }
    if (tipo === 'outros' && !nomeExterno.trim()) { toast.error('Informe o nome'); return; }
    if (tipo === 'outros' && !telefoneExterno.trim()) { toast.error('Informe o telefone'); return; }

    const isFromAuth = tipo === 'interno' && userId.startsWith('auth:');
    const tipoFinal: ReservationTipo = isFromAuth ? 'outros' : tipo;

    submittingRef.current = true;
    try {
      const payload: any = {
        scooter_id: scooterId,
        tipo_responsavel: tipoFinal,
        responsavel_user_id: tipoFinal === 'interno' ? userId : null,
        comissao: tipoFinal === 'interno' || tipoFinal === 'outros' ? (comissao || null) : null,
        empresa_slug: tipoFinal === 'empresa' ? empresaSlug : null,
        nome_externo: tipoFinal === 'outros' ? nomeExterno : null,
        telefone_externo: tipoFinal === 'outros' ? telefoneExterno || null : null,
        inicio_em: ensureSPOffset(inicio),
        fim_em: ensureSPOffset(fim),
        observacoes: obs || null,
      };
      if (reservation) {
        await update.mutateAsync({ id: reservation.id, ...payload });
        toast.success('Reserva atualizada');
      } else {
        await create.mutateAsync(payload);
        toast.success('Reserva criada');
      }
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar reserva');
    } finally {
      submittingRef.current = false;
    }
  };

  const isPending = create.isPending || update.isPending;
  const noAuthorized = authorizations.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{reservation ? 'Editar Reserva' : 'Nova Reserva de Patinete'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Patinete</Label>
            <Select value={scooterId} onValueChange={setScooterId}>
              <SelectTrigger><SelectValue placeholder="Selecione o patinete" /></SelectTrigger>
              <SelectContent>
                {scooters.map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>{s.nome || s.codigo} ({s.codigo})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Tabs value={tipo} onValueChange={(v) => { setTipo(v as ReservationTipo); }}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="outros">Autorizado</TabsTrigger>
              <TabsTrigger value="empresa">Empresa</TabsTrigger>
              <TabsTrigger value="interno">Interno</TabsTrigger>
            </TabsList>

            <TabsContent value="outros" className="space-y-3 mt-3">
              {noAuthorized ? (
                <div className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-700 dark:text-amber-300">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  <p className="text-xs leading-snug">
                    Nenhuma pessoa autorizada para patinete. Cadastre em <strong>Mobilidade por Comissão</strong> antes de criar a reserva.
                  </p>
                </div>
              ) : (
                <>
                  <Label className="text-xs text-muted-foreground">Selecionar autorizado</Label>
                  <Select
                    value={userId.startsWith('auth:') ? userId : ''}
                    onValueChange={(v) => {
                      const id = v.slice(5);
                      const a: any = sortedAuthorizations.find((x: any) => x.id === id);
                      setUserId(v);
                      setNomeExterno((a?.member_name || '').toUpperCase());
                      setComissao(a?.committee_name_snapshot || '');
                    }}
                  >
                    <SelectTrigger><SelectValue placeholder="Quem retira" /></SelectTrigger>
                    <SelectContent className="max-h-[60dvh]">
                      {sortedAuthorizations.map((a: any) => (
                        <SelectItem key={`auth-${a.id}`} value={`auth:${a.id}`}>
                          <span className="font-medium">{a.member_name}</span>
                          <span className="text-muted-foreground"> — {a.committee_name_snapshot}</span>
                          {a.access_status !== 'liberado' && (
                            <span className="ml-2 text-[10px] text-amber-600">({a.access_status})</span>
                          )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Telefone *</Label>
                    <Input placeholder="(00) 00000-0000" value={telefoneExterno} onChange={(e) => setTelefoneExterno(e.target.value)} />
                  </div>
                  {comissao && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <Label className="text-xs text-muted-foreground">Comissão:</Label>
                      <Badge variant="secondary">{comissao}</Badge>
                    </div>
                  )}
                </>
              )}
            </TabsContent>

            <TabsContent value="empresa" className="space-y-3 mt-3">
              <Label className="text-xs text-muted-foreground">Empresa parceira</Label>
              <div className="grid grid-cols-2 gap-2">
                {PARTNERS.map((p) => {
                  const selected = empresaSlug === p.slug;
                  return (
                    <button
                      key={p.slug}
                      type="button"
                      onClick={() => setEmpresaSlug(p.slug)}
                      className={cn(
                        'rounded-xl border p-3 flex flex-col items-center justify-center gap-2 bg-card hover:bg-muted transition-all min-h-[88px]',
                        selected ? 'border-primary ring-2 ring-primary/30 shadow-sm' : 'border-border'
                      )}
                    >
                      <div className="w-12 h-12 rounded-md bg-white border flex items-center justify-center overflow-hidden">
                        <img src={p.logo} alt={p.nome} className="max-w-full max-h-full object-contain" />
                      </div>
                      <span className="text-[11px] font-medium text-center leading-tight">{p.nome}</span>
                    </button>
                  );
                })}
              </div>
            </TabsContent>

            <TabsContent value="interno" className="space-y-3 mt-3">
              <Select
                value={userId.startsWith('auth:') ? '' : userId}
                onValueChange={(v) => {
                  setUserId(v);
                  setComissao(memberCommissionMap.get(v) || '');
                }}
              >
                <SelectTrigger><SelectValue placeholder="Quem retira" /></SelectTrigger>
                <SelectContent className="max-h-[60dvh]">
                  {members.map((m: any) => (
                    <SelectItem key={m.user_id} value={m.user_id}>{m.nome_exibicao} - {m.cargo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {comissao && (
                <div className="flex items-center gap-2 flex-wrap">
                  <Label className="text-xs text-muted-foreground">Comissão:</Label>
                  <Badge variant="secondary">{comissao}</Badge>
                </div>
              )}
            </TabsContent>
          </Tabs>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Início (retirada)</Label>
              <DateTimePicker value={inicio} onChange={setInicio} placeholder="Início" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Devolução prevista</Label>
              <DateTimePicker value={fim} onChange={setFim} placeholder="Devolução" />
            </div>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Observações</Label>
            <Textarea value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Observações (opcional)" rows={2} />
          </div>

          <Button onClick={handleSubmit} className="w-full h-11 rounded-xl" disabled={isPending}>
            {reservation ? 'Salvar alterações' : 'Criar Reserva'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
