import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Receipt, Car, Truck, User, QrCode, FileText,
  CheckCircle, XCircle, Clock, Banknote, AlertCircle,
} from 'lucide-react';
import ExpenseDocumentPreview from './ExpenseDocumentPreview';

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

interface ExpenseDetailSheetProps {
  expense: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApprove?: () => void;
  onReject?: () => void;
  onRequestReimbursement?: () => void;
}

export default function ExpenseDetailSheet({
  expense, open, onOpenChange, onApprove, onReject, onRequestReimbursement,
}: ExpenseDetailSheetProps) {
  const isMobile = useIsMobile();
  if (!expense) return null;

  const status = statusConfig[expense.status] || statusConfig.rascunho;
  const StatusIcon = status.icon;
  const amount = Number(expense.amount) || 0;
  const categoryName = expense.expense_categories?.name || 'Sem categoria';
  const hasDoc = expense.expense_documents?.length > 0;
  const isQr = expense.origem_lancamento === 'qr_scan';

  const InfoRow = ({ label, value, icon: Icon }: { label: string; value?: string; icon?: React.ElementType }) => {
    if (!value) return null;
    return (
      <div className="flex items-start gap-2.5 py-2 border-b border-border/30 last:border-0">
        {Icon && <Icon className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />}
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
          <p className="text-sm font-medium text-foreground truncate">{value}</p>
        </div>
      </div>
    );
  };

  const content = (
    <div className="space-y-4 pb-4">
      {/* Hero header */}
      <div className="rounded-2xl p-4 bg-gradient-to-br from-primary/12 via-primary/6 to-transparent border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Valor</p>
            <p className="text-3xl font-extrabold text-foreground tracking-tight leading-none">
              R$ {amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-muted-foreground mt-1.5">{categoryName}</p>
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <Badge className={cn('text-[10px] px-2.5 py-1 rounded-full flex items-center gap-1 border-0', status.class)}>
              <StatusIcon className="w-3 h-3" /> {status.label}
            </Badge>
            {isQr && (
              <Badge variant="outline" className="text-[9px] gap-1 px-2 py-0.5">
                <QrCode className="w-3 h-3" /> Via QR
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Details */}
      <div className="rounded-2xl bg-card/50 backdrop-blur-xl border border-white/10 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
        <InfoRow label="Título" value={expense.title} icon={Receipt} />
        <InfoRow
          label="Data"
          value={expense.expense_date ? format(new Date(expense.expense_date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : undefined}
          icon={Clock}
        />
        <InfoRow label="Forma de pagamento" value={expense.payment_method} />
        <InfoRow label="Pago por" value={expense.paid_by_name} icon={User} />

        {/* Contextual links */}
        {expense.transport_id && (
          <InfoRow
            label="Transporte"
            value={expense.transports?.titulo || (expense.transports?.destino ? `→ ${expense.transports.destino}` : 'Transporte removido')}
            icon={Truck}
          />
        )}
        {expense.vehicle_id && (
          <InfoRow
            label="Veículo"
            value={
              expense.vehicles
                ? `${[expense.vehicles.marca, expense.vehicles.modelo].filter(Boolean).join(' ')}${expense.vehicles.placa ? ` • ${expense.vehicles.placa}` : ''}`.trim() || 'Veículo'
                : 'Veículo removido'
            }
            icon={Car}
          />
        )}

        {/* Pix info */}
        {expense.pix_key && (
          <InfoRow label="Chave Pix" value={`${expense.pix_key_type?.toUpperCase()}: ${expense.pix_key}`} icon={Banknote} />
        )}
      </div>

      {/* Description */}
      {expense.description && (
        <div className="rounded-2xl bg-card/50 backdrop-blur-xl border border-white/10 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="w-4 h-4 text-muted-foreground" />
            <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Descrição</p>
          </div>
          <p className="text-sm text-foreground whitespace-pre-wrap break-words leading-relaxed">
            {expense.description}
          </p>
        </div>
      )}

      {/* Documents */}
      {hasDoc && (
        <div className="rounded-2xl bg-card/50 backdrop-blur-xl border border-white/10 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
          <ExpenseDocumentPreview documents={expense.expense_documents} />
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col gap-2 pt-1">
        {expense.status === 'pendente_validacao' && onApprove && (
          <div className="flex gap-2">
            <Button onClick={onApprove} className="flex-1 h-11 rounded-xl">
              <CheckCircle className="w-4 h-4 mr-1.5" /> Aprovar despesa
            </Button>
            <Button onClick={onReject} variant="outline" className="flex-1 h-11 rounded-xl text-destructive">
              <XCircle className="w-4 h-4 mr-1.5" /> Recusar
            </Button>
          </div>
        )}
        {expense.status === 'aprovado' && expense.paid_by_user_id && onRequestReimbursement && (
          <Button onClick={onRequestReimbursement} className="w-full h-11 rounded-xl gap-1.5 bg-gradient-to-r from-gold to-gold/80 hover:opacity-90 text-foreground">
            <Banknote className="w-4 h-4" /> Solicitar ressarcimento
          </Button>
        )}
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[90dvh]">
          <DrawerHeader>
            <DrawerTitle>Detalhes da despesa</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-6 overflow-y-auto">{content}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Detalhes da despesa</DialogTitle>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
}
