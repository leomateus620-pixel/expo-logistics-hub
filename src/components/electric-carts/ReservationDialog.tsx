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
import { cn, nowSPLocal } from '@/lib/utils';
import { PARTNERS, type PartnerSlug } from '@/lib/partners';
import { useCartReservations, type CartReservation, type ReservationTipo } from '@/hooks/useCartReservations';
import { useElectricCarts } from '@/hooks/useElectricCarts';
import { useOrgMembers } from '@/hooks/useOrgMembers';
import { useCommissions } from '@/hooks/useCommissions';
import { useMobilityAuthorizations } from '@/hooks/useMobilityAuthorizations';
import { toast } from 'sonner';
import { User, AlertTriangle } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  reservation?: CartReservation | null;
}

function addHoursLocal(local: string, hours: number): string {
  // local is YYYY-MM-DDTHH:MM
  const d = new Date(local);
  d.setHours(d.getHours() + hours);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${mo}-${da}T${h}:${mi}`;
}

export default function ReservationDialog({ open, onOpenChange, reservation }: Props) {
  const { carts } = useElectricCarts();
  const { members } = useOrgMembers();
  const { commissions } = useCommissions();
  const { authorizations } = useMobilityAuthorizations('carro_eletrico');
  const { create, update, reservations } = useCartReservations();

  const sortedAuthorizations = useMemo(() => {
    const norm = (s: string) => (s || '').toLocaleLowerCase('pt-BR');
    return [...authorizations].sort((a: any, b: any) => {
      const sa = a.access_status === 'liberado' ? 0 : 1;
      const sb = b.access_status === 'liberado' ? 0 : 1;
      if (sa !== sb) return sa - sb;
      return norm(a.member_name).localeCompare(norm(b.member_name));
    });
  }, [authorizations]);

  const [cartId, setCartId] = useState('');
  const [tipo, setTipo] = useState<ReservationTipo>('interno');
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
      setCartId(reservation.cart_id);
      setTipo(reservation.tipo_responsavel);
      setUserId(reservation.responsavel_user_id || '');
      setComissao(reservation.comissao || '');
      setEmpresaSlug((reservation.empresa_slug as PartnerSlug) || '');
      setNomeExterno(reservation.nome_externo || '');
      setTelefoneExterno(reservation.telefone_externo || '');
      // convert ISO -> local
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
      setCartId('');
      setTipo('interno');
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

  const authNameToCommission = useMemo(() => {
    const map = new Map<string, string>();
    authorizations.forEach((a: any) => {
      const key = (a.member_name || '').trim().toLocaleLowerCase('pt-BR');
      if (key && !map.has(key)) map.set(key, a.committee_name_snapshot || '');
    });
    return map;
  }, [authorizations]);

  // Conflito por comissão: outras reservas ATIVAS sobrepostas no mesmo período
  const overlappingByCommission = useMemo(() => {
    if (!comissao || !inicio || !fim) return [] as Array<{ cartCodigo: string; quem: string }>;
    const start = new Date(inicio).getTime();
    const end = new Date(fim).getTime();
    if (!(end > start)) return [];
    const list: Array<{ cartCodigo: string; quem: string }> = [];
    reservations.forEach((r: any) => {
      if (reservation && r.id === reservation.id) return;
      if (!(r.status === 'agendada' || r.status === 'em_andamento')) return;
      const rs = new Date(r.inicio_em).getTime();
      const re = new Date(r.fim_em).getTime();
      if (!(rs < end && re > start)) return;
      let rComissao: string | null = r.comissao || null;
      let quem = r.nome_externo || '';
      if (!rComissao && r.responsavel_user_id) {
        rComissao = memberCommissionMap.get(r.responsavel_user_id) || null;
        const m = members.find((mm: any) => mm.user_id === r.responsavel_user_id);
        if (m?.nome_exibicao) quem = m.nome_exibicao;
      }
      if (!rComissao && r.nome_externo) {
        rComissao = authNameToCommission.get(r.nome_externo.trim().toLocaleLowerCase('pt-BR')) || null;
      }
      if (rComissao && rComissao.trim() === comissao.trim()) {
        const cart = carts.find((c: any) => c.id === r.cart_id);
        list.push({ cartCodigo: cart?.nome || cart?.codigo || 'Carrinho', quem });
      }
    });
    return list;
  }, [comissao, inicio, fim, reservations, reservation, members, memberCommissionMap, authNameToCommission, carts]);

  const handleSubmit = async () => {
    if (submittingRef.current) return;
    if (!cartId) { toast.error('Selecione o carrinho'); return; }
    if (!inicio || !fim) { toast.error('Defina o período'); return; }
    if (new Date(fim) <= new Date(inicio)) { toast.error('A devolução deve ser depois do início'); return; }
    if (tipo === 'interno' && !userId) { toast.error('Selecione quem retira'); return; }
    if (tipo === 'empresa' && !empresaSlug) { toast.error('Selecione a empresa parceira'); return; }
    if (tipo === 'outros' && !nomeExterno.trim()) { toast.error('Informe o nome'); return; }

    // Aviso (sem bloqueio): 2 reservas para a mesma comissão no mesmo período
    if (overlappingByCommission.length > 0) {
      const lista = overlappingByCommission
        .map((o) => `${o.cartCodigo}${o.quem ? ` (${o.quem})` : ''}`)
        .join(', ');
      toast.warning(
        `Atenção: comissão "${comissao}" já tem reserva sobreposta — ${lista}. Recomendado: 1 carrinho por comissão.`,
        { duration: 7000 }
      );
    }

    const isFromAuth = tipo === 'interno' && userId.startsWith('auth:');
    const tipoFinal: ReservationTipo = isFromAuth ? 'outros' : tipo;

    submittingRef.current = true;
    try {
      const payload: any = {
        cart_id: cartId,
        tipo_responsavel: tipoFinal,
        responsavel_user_id: tipoFinal === 'interno' ? userId : null,
        comissao:
          tipoFinal === 'interno' || tipoFinal === 'outros'
            ? (comissao || null)
            : null,
        empresa_slug: tipoFinal === 'empresa' ? empresaSlug : null,
        nome_externo: tipoFinal === 'outros' ? nomeExterno : null,
        telefone_externo: tipoFinal === 'outros' ? telefoneExterno || null : null,
        inicio_em: new Date(inicio).toISOString(),
        fim_em: new Date(fim).toISOString(),
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{reservation ? 'Editar Reserva' : 'Nova Reserva'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Carrinho</Label>
            <Select value={cartId} onValueChange={setCartId}>
              <SelectTrigger><SelectValue placeholder="Selecione o carrinho" /></SelectTrigger>
              <SelectContent>
                {carts.map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome || c.codigo} ({c.codigo})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Tabs value={tipo} onValueChange={(v) => { setTipo(v as ReservationTipo); }}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="interno">Membro</TabsTrigger>
              <TabsTrigger value="empresa">Empresa</TabsTrigger>
              <TabsTrigger value="outros">Outros</TabsTrigger>
            </TabsList>

            <TabsContent value="interno" className="space-y-3 mt-3">
              <Select value={userId} onValueChange={(v) => { setUserId(v); setComissao(memberCommissionMap.get(v) || ''); }}>
                <SelectTrigger><SelectValue placeholder="Quem retira" /></SelectTrigger>
                <SelectContent>
                  {members.map((m: any) => (
                    <SelectItem key={m.user_id} value={m.user_id}>{m.nome_exibicao} - {m.cargo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {comissao && (
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground">Comissão:</Label>
                  <Badge variant="secondary">{comissao}</Badge>
                </div>
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

            <TabsContent value="outros" className="space-y-3 mt-3">
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Nome de quem retira</Label>
                <Input
                  placeholder="NOME COMPLETO"
                  value={nomeExterno}
                  onChange={(e) => setNomeExterno(e.target.value.toUpperCase())}
                  className="uppercase"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Telefone (opcional)</Label>
                <Input
                  placeholder="(00) 00000-0000"
                  value={telefoneExterno}
                  onChange={(e) => setTelefoneExterno(e.target.value)}
                />
              </div>
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
            <Textarea
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              placeholder="Observações (opcional)"
              rows={2}
            />
          </div>

          <Button onClick={handleSubmit} className="w-full h-11 rounded-xl" disabled={isPending}>
            {reservation ? 'Salvar alterações' : 'Criar Reserva'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
