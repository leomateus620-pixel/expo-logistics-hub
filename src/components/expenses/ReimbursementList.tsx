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
          <div key={i} className="h-16 rounded-xl bg-muted/30 animate-pulse" />
        ))}
      </div>
    );
  }

  if (reimbursements.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <div className="w-16 h-16 rounded-2xl bg-muted/30 flex items-center justify-center mb-4">
          <Banknote className="w-8 h-8 opacity-25" />
        </div>
        <p className="text-sm font-semibold">Nenhum ressarcimento</p>
        <p className="text-xs mt-1">Ressarcimentos aparecerão aqui quando solicitados.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {reimbursements.map((r: any) => {
        const st = statusMap[r.status] || statusMap.pendente;
        const StIcon = st.icon;
        const amount = Number(r.requested_amount) || 0;

        return (
          <div key={r.id} className="p-3.5 rounded-xl bg-card/60 backdrop-blur-sm border border-border/30 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gold/10 flex items-center justify-center shrink-0">
                <Banknote className="w-5 h-5 text-gold" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{r.beneficiary_name}</p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {r.expenses?.title || 'Despesa'} • {r.pix_key_type?.toUpperCase()}: {r.pix_key}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <p className="text-sm font-bold">
                  R$ {amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
                <Badge className={cn('text-[9px] px-2 py-0.5 rounded-full flex items-center gap-1', st.class)}>
                  <StIcon className="w-3 h-3" />{st.label}
                </Badge>
              </div>
            </div>

            {canApprove && r.status === 'pendente' && (
              <div className="flex gap-2 mt-3">
                <Button size="sm" variant="outline" className="flex-1 text-xs rounded-xl h-9" onClick={() => onApprove?.(r.id)}>
                  Aprovar
                </Button>
                <Button size="sm" variant="outline" className="flex-1 text-xs rounded-xl h-9 text-destructive" onClick={() => onReject?.(r.id)}>
                  Recusar
                </Button>
              </div>
            )}
            {canApprove && r.status === 'aprovado' && (
              <Button size="sm" className="w-full mt-3 text-xs rounded-xl h-9" onClick={() => onMarkPaid?.(r.id)}>
                Marcar como Pago
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
