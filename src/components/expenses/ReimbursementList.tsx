import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { CheckCircle, Clock, XCircle, Banknote } from 'lucide-react';

const statusMap: Record<string, { label: string; class: string; icon: React.ElementType }> = {
  pendente: { label: 'Pendente', class: 'bg-accent/15 text-accent', icon: Clock },
  aprovado: { label: 'Aprovado', class: 'bg-primary/15 text-primary', icon: CheckCircle },
  pago: { label: 'Pago', class: 'bg-success/15 text-success', icon: Banknote },
  recusado: { label: 'Recusado', class: 'bg-destructive/15 text-destructive', icon: XCircle },
};

interface ReimbursementListProps {
  reimbursements: any[];
  isLoading: boolean;
  onApprove?: (id: string) => void;
  onMarkPaid?: (id: string) => void;
  onReject?: (id: string) => void;
  canApprove?: boolean;
}

export default function ReimbursementList({
  reimbursements, isLoading, onApprove, onMarkPaid, onReject, canApprove,
}: ReimbursementListProps) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-20 rounded-2xl bg-muted/30 animate-pulse" />
        ))}
      </div>
    );
  }

  if (reimbursements.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-gold/10 to-gold/5 border border-white/10 flex items-center justify-center mb-4 shadow-inner">
          <Banknote className="w-8 h-8 opacity-30" />
        </div>
        <p className="text-sm font-semibold">Nenhum ressarcimento</p>
        <p className="text-xs mt-1">Os ressarcimentos aparecem aqui quando solicitados.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {reimbursements.map((r: any) => {
        const st = statusMap[r.status] || statusMap.pendente;
        const StIcon = st.icon;
        const amount = Number(r.requested_amount) || 0;

        return (
          <div
            key={r.id}
            className={cn(
              'p-3.5 rounded-2xl bg-gradient-to-br from-card/80 via-card/60 to-card/40 backdrop-blur-xl',
              'border border-white/10 shadow-[0_4px_16px_-6px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.08)]',
            )}
          >
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-gold/25 to-gold/8 border border-white/10 flex items-center justify-center shrink-0 shadow-inner">
                <Banknote className="w-5 h-5 text-gold" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{r.beneficiary_name}</p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {r.expenses?.title || 'Despesa'} • {r.pix_key_type?.toUpperCase()}: {r.pix_key}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <p className="text-base font-extrabold tracking-tight">
                  R$ {amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
                <Badge className={cn('text-[9px] px-2 py-0.5 rounded-full flex items-center gap-1 border-0', st.class)}>
                  <StIcon className="w-3 h-3" />{st.label}
                </Badge>
              </div>
            </div>

            {canApprove && r.status === 'pendente' && (
              <div className="flex gap-2 mt-3">
                <Button size="sm" className="flex-1 text-xs rounded-xl h-10" onClick={() => onApprove?.(r.id)}>
                  Aprovar ressarcimento
                </Button>
                <Button size="sm" variant="outline" className="flex-1 text-xs rounded-xl h-10 text-destructive" onClick={() => onReject?.(r.id)}>
                  Recusar
                </Button>
              </div>
            )}
            {canApprove && r.status === 'aprovado' && (
              <Button size="sm" className="w-full mt-3 text-xs rounded-xl h-10" onClick={() => onMarkPaid?.(r.id)}>
                Marcar como pago
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
