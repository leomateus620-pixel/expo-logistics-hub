import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { cn, nowSP, nowSPLocal, ensureSPOffset } from '@/lib/utils';
import { PARTNERS, type PartnerSlug } from '@/lib/partners';
import { useScooters } from '@/hooks/useScooters';
import { useOrgMembers } from '@/hooks/useOrgMembers';
import { useCommissions } from '@/hooks/useCommissions';
import { useMobilityAuthorizations } from '@/hooks/useMobilityAuthorizations';
import { toast } from 'sonner';
import { AlertTriangle, Bike, Search, X, ArrowRight } from 'lucide-react';
import PersonPickerSheet from '@/components/electric-carts/PersonPickerSheet';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

type Tipo = 'outros' | 'empresa' | 'interno';

export default function ScooterPickupDialog({ open, onOpenChange }: Props) {
  const { scooters, pickup } = useScooters();
  const { members } = useOrgMembers();
  const { commissions } = useCommissions();
  const { authorizations } = useMobilityAuthorizations('patinete');

  const [scooterId, setScooterId] = useState('');
  const [tipo, setTipo] = useState<Tipo>('outros');
  const [userId, setUserId] = useState('');
  const [comissao, setComissao] = useState('');
  const [empresaSlug, setEmpresaSlug] = useState<PartnerSlug | ''>('');
  const [nomeExterno, setNomeExterno] = useState('');
  const [telefoneExterno, setTelefoneExterno] = useState('');
  const [retiradaEm, setRetiradaEm] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMode, setPickerMode] = useState<'autorizados' | 'internos'>('autorizados');
  const submittingRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    setScooterId('');
    setTipo('outros');
    setUserId('');
    setComissao('');
    setEmpresaSlug('');
    setNomeExterno('');
    setTelefoneExterno('');
    setRetiradaEm(nowSPLocal());
  }, [open]);

  const sortedAuthorizations = useMemo(() => {
    const norm = (s: string) => (s || '').toLocaleLowerCase('pt-BR');
    return [...authorizations].sort((a: any, b: any) => {
      const sa = a.access_status === 'liberado' ? 0 : 1;
      const sb = b.access_status === 'liberado' ? 0 : 1;
      if (sa !== sb) return sa - sb;
      return norm(a.member_name).localeCompare(norm(b.member_name));
    });
  }, [authorizations]);

  const memberCommissionMap = useMemo(() => {
    const map = new Map<string, string | null>();
    members.forEach((m: any) => {
      const c = commissions.find((c: any) => c.id === m.commission_id);
      map.set(m.user_id, c?.nome || null);
    });
    return map;
  }, [members, commissions]);

  const noAuthorized = authorizations.length === 0;
  const availableScooters = scooters.filter((s: any) => s.status === 'disponivel');

  const handleSubmit = async () => {
    if (submittingRef.current) return;
    if (!scooterId) { toast.error('Selecione o patinete'); return; }
    if (tipo === 'interno' && !userId) { toast.error('Selecione quem retira'); return; }
    if (tipo === 'empresa' && !empresaSlug) { toast.error('Selecione a empresa parceira'); return; }
    if (tipo === 'outros' && !nomeExterno.trim()) { toast.error('Selecione um autorizado'); return; }
    if (tipo === 'outros' && !telefoneExterno.trim()) { toast.error('Informe o telefone'); return; }

    submittingRef.current = true;
    try {
      await pickup.mutateAsync({
        id: scooterId,
        tipo,
        responsavel_user_id: tipo === 'interno' ? userId : null,
        comissao: tipo === 'interno' || tipo === 'outros' ? (comissao || null) : null,
        empresa_slug: tipo === 'empresa' ? empresaSlug : null,
        nome_externo: tipo === 'outros' ? nomeExterno : null,
        telefone_externo: tipo === 'outros' ? telefoneExterno : null,
        retirada_em: retiradaEm ? ensureSPOffset(retiradaEm) : nowSP(),
      });
      toast.success('Retirada registrada');
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao registrar retirada');
    } finally {
      submittingRef.current = false;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bike className="w-5 h-5 text-primary" /> Retirada de Patinete
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Patinete</Label>
            <Select value={scooterId} onValueChange={setScooterId}>
              <SelectTrigger><SelectValue placeholder="Selecione o patinete disponível" /></SelectTrigger>
              <SelectContent>
                {availableScooters.length === 0 && (
                  <div className="px-2 py-3 text-xs text-muted-foreground">Nenhum patinete disponível</div>
                )}
                {availableScooters.map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>{s.nome || s.codigo} ({s.codigo})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Tabs value={tipo} onValueChange={(v) => { setTipo(v as Tipo); setUserId(''); setComissao(''); setNomeExterno(''); setTelefoneExterno(''); setEmpresaSlug(''); }}>
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
                    Nenhuma pessoa autorizada para patinete. Cadastre em <strong>Mobilidade por Comissão</strong> antes de fazer a retirada.
                  </p>
                </div>
              ) : (
                <>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Selecionar autorizado</Label>
                    <button
                      type="button"
                      onClick={() => { setPickerMode('autorizados'); setPickerOpen(true); }}
                      className={cn(
                        'w-full flex items-center gap-3 rounded-xl border bg-background px-3 h-12 text-left transition-all',
                        nomeExterno ? 'border-primary/40 shadow-sm' : 'border-input hover:border-primary/30',
                      )}
                    >
                      <div className={cn(
                        'w-8 h-8 rounded-full flex items-center justify-center shrink-0',
                        nomeExterno ? 'bg-primary/15 text-primary border border-primary/30' : 'bg-muted text-muted-foreground',
                      )}>
                        {nomeExterno ? nomeExterno.trim().charAt(0).toUpperCase() : <Search className="w-4 h-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        {nomeExterno ? (
                          <>
                            <p className="text-sm font-semibold truncate">{nomeExterno}</p>
                            {comissao && <p className="text-[11px] text-muted-foreground truncate">{comissao}</p>}
                          </>
                        ) : (
                          <p className="text-sm text-muted-foreground">Selecionar quem retira</p>
                        )}
                      </div>
                      {nomeExterno ? (
                        <span
                          role="button"
                          tabIndex={0}
                          aria-label="Limpar"
                          onClick={(e) => { e.stopPropagation(); setUserId(''); setNomeExterno(''); setComissao(''); setTelefoneExterno(''); }}
                          className="w-7 h-7 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground shrink-0"
                        >
                          <X className="w-3.5 h-3.5" />
                        </span>
                      ) : (
                        <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                      )}
                    </button>
                  </div>
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
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Membro da equipe</Label>
                <Select
                  value={userId}
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
              </div>
              {comissao && (
                <div className="flex items-center gap-2 flex-wrap">
                  <Label className="text-xs text-muted-foreground">Comissão:</Label>
                  <Badge variant="secondary">{comissao}</Badge>
                </div>
              )}
            </TabsContent>
          </Tabs>

          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Horário de retirada</Label>
            <DateTimePicker value={retiradaEm} onChange={setRetiradaEm} placeholder="Retirada" />
          </div>

          <Button onClick={handleSubmit} className="w-full h-11 rounded-xl" disabled={pickup.isPending}>
            Confirmar Retirada
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
