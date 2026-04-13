import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Receipt, Car, Truck, User, FileCheck, QrCode,
  CheckCircle, XCircle, Clock, Banknote, AlertCircle,
} from 'lucide-react';

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
      {/* Header with amount + status */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-2xl font-extrabold text-foreground">
            R$ {amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">{categoryName}</p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <Badge className={cn('text-[10px] px-2.5 py-1 rounded-full flex items-center gap-1', status.class)}>
            <StatusIcon className="w-3 h-3" /> {status.label}
          </Badge>
          {isQr && (
            <Badge variant="outline" className="text-[9px] gap-1 px-2 py-0.5">
              <QrCode className="w-3 h-3" /> Via QR
            </Badge>
          )}
        </div>
      </div>

      {/* Details */}
      <div className="rounded-xl bg-muted/30 p-3">
        <InfoRow label="Título" value={expense.title} icon={Receipt} />
        {expense.description && <InfoRow label="Descrição" value={expense.description} />}
        <InfoRow
          label="Data"
          value={expense.expense_date ? format(new Date(expense.expense_date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : undefined}
          icon={Clock}
        />
        <InfoRow label="Forma de pagamento" value={expense.payment_method} />
        <InfoRow label="Pago por" value={expense.paid_by_name} icon={User} />

        {/* Contextual links */}
        {expense.transport_id && (
          <InfoRow label="Transporte" value={`ID: ${expense.transport_id.slice(0, 8)}...`} icon={Truck} />
        )}
        {expense.vehicle_id && (
          <InfoRow label="Veículo" value={`ID: ${expense.vehicle_id.slice(0, 8)}...`} icon={Car} />
        )}

        {/* Pix info */}
        {expense.pix_key && (
          <InfoRow label="Chave Pix" value={`${expense.pix_key_type?.toUpperCase()}: ${expense.pix_key}`} icon={Banknote} />
        )}

        {/* Document indicator */}
        {hasDoc && (
          <div className="flex items-center gap-2 py-2 text-success">
            <FileCheck className="w-4 h-4" />
            <span className="text-xs font-medium">{expense.expense_documents.length} comprovante(s) anexado(s)</span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-2">
        {expense.status === 'pendente_validacao' && onApprove && (
          <div className="flex gap-2">
            <Button onClick={onApprove} className="flex-1" size="sm">
              <CheckCircle className="w-4 h-4 mr-1.5" /> Aprovar
            </Button>
            <Button onClick={onReject} variant="outline" className="flex-1 text-destructive" size="sm">
              <XCircle className="w-4 h-4 mr-1.5" /> Recusar
            </Button>
          </div>
        )}
        {expense.status === 'aprovado' && expense.paid_by_user_id && onRequestReimbursement && (
          <Button onClick={onRequestReimbursement} variant="outline" className="w-full gap-1.5" size="sm">
            <Banknote className="w-4 h-4" /> Solicitar Ressarcimento
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
            <DrawerTitle>Detalhes da Despesa</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-6 overflow-y-auto">{content}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Detalhes da Despesa</DialogTitle>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
}
