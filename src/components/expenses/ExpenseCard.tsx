import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { FileCheck, AlertCircle, Clock, CheckCircle, XCircle, Banknote, QrCode, Truck, Car } from 'lucide-react';
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

// Sentence case: first letter upper, rest preserved (keeps proper nouns intact)
function sentenceCase(s?: string) {
  if (!s) return '';
  const t = s.trim();
  if (!t) return '';
  return t.charAt(0).toLocaleUpperCase('pt-BR') + t.slice(1);
}

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
      onClick={onClick}
      className={cn(
        'group relative flex items-center gap-3 p-3.5 rounded-2xl cursor-pointer',
        'bg-gradient-to-br from-card/80 via-card/60 to-card/40 backdrop-blur-xl',
        'border border-white/10 shadow-[0_4px_16px_-6px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.08)]',
        'transition-all duration-300 ease-out',
        'hover:-translate-y-0.5 hover:shadow-[0_10px_28px_-10px_rgba(0,100,0,0.28),inset_0_1px_0_rgba(255,255,255,0.12)]',
        'active:scale-[0.985]',
      )}
    >
      {/* Category 3D coin */}
      <div
        className={cn(
          'relative w-11 h-11 rounded-2xl shrink-0 flex items-center justify-center text-xl',
          'bg-gradient-to-br from-primary/20 via-primary/10 to-primary/5',
          'shadow-[inset_0_1px_0_rgba(255,255,255,0.18),inset_0_-2px_4px_rgba(0,0,0,0.08),0_2px_6px_-2px_rgba(0,0,0,0.15)]',
          'border border-white/10',
        )}
      >
        <span className="drop-shadow-sm">{categoryIcon}</span>
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground truncate leading-tight">
          {sentenceCase(expense.title)}
        </p>
        <div className="flex items-center gap-1.5 mt-1">
          <span className="text-[11px] text-muted-foreground font-medium">{sentenceCase(categoryName)}</span>
          {dateStr && <span className="text-[10px] text-muted-foreground/60">• {dateStr}</span>}
          {expense.paid_by_name && (
            <span className="text-[10px] text-muted-foreground/70 truncate">• {expense.paid_by_name}</span>
          )}
        </div>
        {(expense.transport_id || expense.vehicle_id) && (
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            {expense.transport_id && (
              <span className="inline-flex items-center gap-1 text-[9px] text-primary/80 bg-primary/8 px-1.5 py-0.5 rounded-full max-w-[140px] truncate border border-primary/15">
                <Truck className="w-2.5 h-2.5 shrink-0" />
                <span className="truncate">{expense.transports?.titulo || 'Transporte'}</span>
              </span>
            )}
            {expense.vehicle_id && (
              <span className="inline-flex items-center gap-1 text-[9px] text-foreground/70 bg-muted/50 px-1.5 py-0.5 rounded-full max-w-[120px] truncate border border-border/40">
                <Car className="w-2.5 h-2.5 shrink-0" />
                <span className="truncate">{expense.vehicles?.modelo || expense.vehicles?.placa || 'Veículo'}</span>
              </span>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-col items-end gap-1 shrink-0">
        <p className="text-base font-extrabold text-foreground tracking-tight">
          R$ {amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
        </p>
        <Badge className={cn('text-[9px] px-2 py-0.5 rounded-full flex items-center gap-1 font-medium border-0', status.class)}>
          <StatusIcon className="w-3 h-3" />{status.label}
        </Badge>
        {(isQr || hasDoc) && (
          <div className="flex items-center gap-1">
            {isQr && <QrCode className="w-3 h-3 text-primary/70" />}
            {hasDoc && <FileCheck className="w-3 h-3 text-success/80" />}
          </div>
        )}
      </div>
    </div>
  );
}
