import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Bike, Clock, ArrowRight, User, Building2, Phone, History } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getPartner } from '@/lib/partners';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  scooter: any | null;
  history: any[];
  members: any[];
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function calcDuration(start: string, end: string) {
  const diff = new Date(end).getTime() - new Date(start).getTime();
  if (diff <= 0) return '—';
  const hours = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  return hours > 0 ? `${hours}h${mins > 0 ? `${mins}min` : ''}` : `${mins}min`;
}

export default function ScooterHistorySheet({ open, onOpenChange, scooter, history, members }: Props) {
  if (!scooter) return null;
  const scooterHistory = history.filter((h: any) => h.scooter_id === scooter.id);
  const retiradas = scooterHistory.filter((h: any) => h.action === 'retirada')
    .sort((a: any, b: any) => (b.created_at || '').localeCompare(a.created_at || ''));
  const devolucoes = scooterHistory.filter((h: any) => h.action === 'devolucao');

  const getMemberName = (uid: string) => members.find((m: any) => m.user_id === uid)?.nome_exibicao || '—';

  const usageEntries = retiradas.map((ret: any) => {
    const retData = ret.after_data || {};
    const tipo = retData.tipo_responsavel || 'interno';
    const partner = tipo === 'empresa' && retData.empresa_slug ? getPartner(retData.empresa_slug) : null;
    const matchingDev = devolucoes.find((d: any) => new Date(d.created_at).getTime() > new Date(ret.created_at).getTime());
    const devData = matchingDev?.after_data || {};
    return {
      id: ret.id,
      tipo,
      partner,
      nome: tipo === 'interno' ? getMemberName(retData.responsavel_user_id) : (retData.nome_externo || partner?.nome || '—'),
      telefone: retData.telefone_externo || null,
      comissao: retData.comissao || null,
      retirada_em: retData.retirada_em || ret.created_at,
      devolucao_em: matchingDev ? (devData.devolucao_em || matchingDev.created_at) : null,
    };
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 overflow-hidden flex flex-col">
        <SheetHeader className="px-5 pt-5 pb-3 border-b bg-gradient-to-br from-card via-card to-card/70">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary/25 to-primary/10 text-primary flex items-center justify-center shadow-inner">
              <Bike className="w-5 h-5" />
            </div>
            <div className="min-w-0 text-left">
              <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{scooter.codigo}</p>
              <SheetTitle className="text-base sm:text-lg leading-tight truncate">{scooter.nome || 'Patinete elétrico'}</SheetTitle>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <History className="w-3.5 h-3.5" />
            <span>Histórico de Utilização</span>
            <Badge variant="outline" className="ml-auto">{usageEntries.length}</Badge>
          </div>

          {usageEntries.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-muted/50 flex items-center justify-center">
                <History className="w-6 h-6 text-muted-foreground/60" />
              </div>
              <p className="text-sm">Nenhum uso registrado ainda</p>
            </div>
          ) : (
            <ul className="space-y-2.5">
              {usageEntries.map((u: any) => (
                <li
                  key={u.id}
                  className={cn(
                    'rounded-xl border border-border/50 p-3',
                    'bg-gradient-to-br from-card/85 via-card/65 to-card/45 backdrop-blur-xl',
                    'shadow-[0_4px_16px_-8px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.06)]'
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className={cn(
                      'w-10 h-10 rounded-lg flex items-center justify-center shrink-0 shadow-inner',
                      u.tipo === 'empresa'
                        ? 'bg-white border'
                        : 'bg-gradient-to-br from-accent/30 to-accent/10 text-accent'
                    )}>
                      {u.partner ? (
                        <img src={u.partner.logo} alt={u.partner.nome} className="max-w-full max-h-full object-contain p-1" />
                      ) : u.tipo === 'empresa' ? (
                        <Building2 className="w-5 h-5 text-muted-foreground" />
                      ) : (
                        <User className="w-5 h-5" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold text-sm leading-tight break-words">{u.nome}</p>
                        <Badge variant={u.devolucao_em ? 'secondary' : 'outline'} className={cn('text-[10px] shrink-0', !u.devolucao_em && 'bg-accent/15 text-accent-foreground border-accent/40')}>
                          {u.devolucao_em ? 'Devolvido' : 'Em uso'}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {u.tipo === 'outros' && (
                          <Badge variant="outline" className="text-[10px] bg-accent/10 text-accent-foreground border-accent/30 uppercase">Autorizado</Badge>
                        )}
                        {u.tipo === 'empresa' && (
                          <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/30 uppercase">Parceiro</Badge>
                        )}
                        {u.tipo === 'interno' && (
                          <Badge variant="outline" className="text-[10px] bg-success/10 text-success border-success/30 uppercase">Interno</Badge>
                        )}
                        {u.comissao && (
                          <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/30 uppercase">{u.comissao}</Badge>
                        )}
                      </div>
                      {u.telefone && (
                        <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                          <Phone className="w-3 h-3" /> {u.telefone}
                        </p>
                      )}
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-2 flex-wrap">
                        <Clock className="w-3 h-3" />
                        <span>{formatDateTime(u.retirada_em)}</span>
                        {u.devolucao_em && (
                          <>
                            <ArrowRight className="w-3 h-3" />
                            <span>{formatDateTime(u.devolucao_em)}</span>
                            <Badge variant="outline" className="text-[10px] ml-auto">{calcDuration(u.retirada_em, u.devolucao_em)}</Badge>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
