import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Receipt, FileCheck, AlertCircle, Clock, CheckCircle, XCircle, Banknote, QrCode, Truck, Car } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const statusConfig: Record<string, { label: string; class: string; icon: React.ElementType }> = {
  rascunho: { label: 'Rascunho', class: 'bg-muted text-muted-foreground', icon: Clock },
  pendente_comprovante: { label: 'Sem comprovante', class: 'bg-accent/15 text-accent', icon: AlertCircle },
  pendente_validacao: { label: 'Em validação', class: 'bg-primary/15 text-primary', icon: Clock },
  aprovado: { label: 'Aprovado', class: 'bg-success/15 text-success', icon: CheckCircle },
  ressarcimento_solicitado: { label: 'Ressarcimento', class: 'bg-gold/15 text-gold', icon: Banknote },
  ressarcido: { label: 'Ressarcido', class: 'bg-success/15 text-success', icon: CheckCircle },
  recusado: { label: 'Recusado', class: 'bg-destructive/15 text-destructive', icon: XCircle },
  cancelado: { label: 'Cancelado', class: 'bg-muted text-muted-foreground', icon: XCircle },
};

const categoryIcons: Record<string, string> = {
  combustivel: '⛽', pedagio: '🛣️', alimentacao: '🍽️', hospedagem: '🏨',
  manutencao: '🔧', lavagem: '💧', estacionamento: '🅿️', 'frete de apoio': '🚛',
  'despesas diversas': '📦', reembolso: '💰', diaria: '📅', 'nota de compra': '🛒',
  'material operacional': '📋', emergencial: '🚨',
};

interface ExpenseCardProps {
  expense: any;
  onClick?: () => void;
}

export default function ExpenseCard({ expense, onClick }: ExpenseCardProps) {
  const status = statusConfig[expense.status] || statusConfig.rascunho;
  const StatusIcon = status.icon;
  const categoryName = expense.expense_categories?.name || 'Outros';
  const catKey = categoryName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const categoryIcon = categoryIcons[catKey] || '📦';
  const hasDoc = expense.expense_documents && expense.expense_documents.length > 0;
  const amount = Number(expense.amount) || 0;
  const isQr = expense.origem_lancamento === 'qr_scan';
  const dateStr = expense.expense_date
    ? format(new Date(expense.expense_date), 'dd/MM', { locale: ptBR })
    : '';

  return (
    <div
      className="flex items-center gap-3 p-3.5 rounded-xl bg-card/60 backdrop-blur-sm border border-border/30 cursor-pointer hover:bg-card/80 active:scale-[0.98] transition-all shadow-sm"
      onClick={onClick}
    >
      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-lg shrink-0">
        {categoryIcon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate">{expense.title}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-[11px] text-muted-foreground">{categoryName}</span>
          {dateStr && <span className="text-[10px] text-muted-foreground/60">• {dateStr}</span>}
        </div>
        {/* Contextual links */}
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {expense.transport_id && (
            <span className="text-[9px] text-muted-foreground flex items-center gap-0.5"><Truck className="w-2.5 h-2.5" />Transporte</span>
          )}
          {expense.vehicle_id && (
            <span className="text-[9px] text-muted-foreground flex items-center gap-0.5"><Car className="w-2.5 h-2.5" />Veículo</span>
          )}
          {expense.paid_by_name && (
            <span className="text-[9px] text-muted-foreground">• {expense.paid_by_name}</span>
          )}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <p className="text-sm font-bold text-foreground">
          R$ {amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
        </p>
        <Badge className={cn('text-[9px] px-2 py-0.5 rounded-full flex items-center gap-1', status.class)}>
          <StatusIcon className="w-3 h-3" />{status.label}
        </Badge>
        <div className="flex items-center gap-1">
          {isQr && (
            <span className="text-[9px] text-primary flex items-center gap-0.5"><QrCode className="w-3 h-3" /></span>
          )}
          {hasDoc && (
            <span className="text-[9px] text-success flex items-center gap-0.5"><FileCheck className="w-3 h-3" /></span>
          )}
        </div>
      </div>
    </div>
  );
}
