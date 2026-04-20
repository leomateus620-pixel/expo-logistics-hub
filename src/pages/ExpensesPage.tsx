import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useIsMobile } from '@/hooks/use-mobile';
import { useExpenses } from '@/hooks/useExpenses';
import { useAuth } from '@/hooks/useAuth';
import ExpenseForm from '@/components/expenses/ExpenseForm';
import ExpenseCard from '@/components/expenses/ExpenseCard';
import ExpenseDetailSheet from '@/components/expenses/ExpenseDetailSheet';
import ReimbursementList from '@/components/expenses/ReimbursementList';
import { Plus, Receipt, Banknote, Camera, ScanLine, User } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format, isToday, isYesterday, isThisWeek } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const statusFilters = [
  { value: '', label: 'Todos' },
  { value: 'rascunho', label: 'Rascunho' },
  { value: 'pendente_comprovante', label: 'Sem comprovante' },
  { value: 'pendente_validacao', label: 'Em validação' },
  { value: 'aprovado', label: 'Aprovado' },
  { value: 'ressarcimento_solicitado', label: 'Ressarcimento' },
  { value: 'ressarcido', label: 'Ressarcido' },
];

function groupByDate(expenses: any[]) {
  const groups: { label: string; items: any[] }[] = [];
  const buckets: Record<string, any[]> = {};

  for (const e of expenses) {
    const d = new Date(e.expense_date);
    let key: string;
    if (isToday(d)) key = 'Hoje';
    else if (isYesterday(d)) key = 'Ontem';
    else if (isThisWeek(d)) key = 'Esta semana';
    else key = format(d, "MMMM 'de' yyyy", { locale: ptBR });

    if (!buckets[key]) buckets[key] = [];
    buckets[key].push(e);
  }

  for (const [label, items] of Object.entries(buckets)) {
    groups.push({ label, items });
  }
  return groups;
}

export default function ExpensesPage() {
  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();
  const [createOpen, setCreateOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<any>(null);
  const { user } = useAuth();

  const {
    expenses, reimbursements, stats, isLoading, loadingReimb,
    create, uploadDocument, addDocument,
    changeStatus, createReimbursement, updateReimbursement,
  } = useExpenses(statusFilter ? { status: statusFilter } : undefined);

  useEffect(() => {
    if (searchParams.get('action') === 'create') {
      setCreateOpen(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const grouped = useMemo(() => groupByDate(expenses), [expenses]);

  const handleCreate = async (data: Record<string, any>, file?: File) => {
    setIsSubmitting(true);
    try {
      const result = await create.mutateAsync(data);
      if (file && result?.id) {
        const fileUrl = await uploadDocument(file, result.id);
        await addDocument.mutateAsync({
          expense_id: result.id,
          file_url: fileUrl,
          file_type: file.type.startsWith('image') ? 'image' : 'pdf',
          extraction_status: 'pendente',
        });
      }
      setCreateOpen(false);
      toast.success('Despesa registrada com sucesso');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao registrar despesa');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApproveExpense = async () => {
    if (!selectedExpense) return;
    try {
      await changeStatus.mutateAsync({ id: selectedExpense.id, newStatus: 'aprovado' });
      toast.success('Despesa aprovada');
      setSelectedExpense(null);
    } catch { toast.error('Erro ao aprovar'); }
  };

  const handleRejectExpense = async () => {
    if (!selectedExpense) return;
    try {
      await changeStatus.mutateAsync({ id: selectedExpense.id, newStatus: 'recusado' });
      toast.success('Despesa recusada');
      setSelectedExpense(null);
    } catch { toast.error('Erro ao recusar'); }
  };

  const handleRequestReimbursement = async () => {
    if (!selectedExpense) return;
    try {
      await createReimbursement.mutateAsync({
        expense_id: selectedExpense.id,
        beneficiary_user_id: selectedExpense.paid_by_user_id,
        beneficiary_name: selectedExpense.paid_by_name || 'Colaborador',
        pix_key: selectedExpense.pix_key || '',
        pix_key_type: selectedExpense.pix_key_type || 'cpf',
        requested_amount: selectedExpense.amount,
      });
      await changeStatus.mutateAsync({ id: selectedExpense.id, newStatus: 'ressarcimento_solicitado' });
      toast.success('Ressarcimento solicitado');
      setSelectedExpense(null);
    } catch { toast.error('Erro ao solicitar ressarcimento'); }
  };

  const handleApproveReimb = async (id: string) => {
    try {
      await updateReimbursement.mutateAsync({
        id, status: 'aprovado', approved_by: user?.id,
        approved_at: new Date().toISOString(),
        approved_amount: reimbursements.find((r: any) => r.id === id)?.requested_amount,
      });
      toast.success('Ressarcimento aprovado');
    } catch { toast.error('Erro ao aprovar'); }
  };

  const handleMarkPaid = async (id: string) => {
    try {
      const reimb = reimbursements.find((r: any) => r.id === id);
      await updateReimbursement.mutateAsync({
        id, status: 'pago', paid_by: user?.id,
        paid_at: new Date().toISOString(),
        paid_amount: reimb?.approved_amount || reimb?.requested_amount,
      });
      toast.success('Ressarcimento pago');
    } catch { toast.error('Erro ao marcar pagamento'); }
  };

  const handleRejectReimb = async (id: string) => {
    try {
      await updateReimbursement.mutateAsync({ id, status: 'recusado' });
      toast.success('Ressarcimento recusado');
    } catch { toast.error('Erro ao recusar'); }
  };

  const CreateFormContent = (
    <ExpenseForm onSubmit={handleCreate} isSubmitting={isSubmitting} />
  );

  return (
    <div className="space-y-5 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Receipt className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight">Despesas</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {stats.total} lançamentos • R$ {stats.totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>
        <Button onClick={() => setCreateOpen(true)} size="sm" className="gap-1.5 rounded-xl h-9">
          <Plus className="w-4 h-4" /> Nova
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { value: stats.pendingReceipt, label: 'Sem comprovante', color: 'text-accent' },
          { value: stats.pendingValidation, label: 'Em validação', color: 'text-primary' },
          { value: stats.pendingReimbursement, label: 'Ressarc. pendente', color: 'text-gold' },
          { value: `R$ ${stats.reimbursedAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, label: 'Ressarcido', color: 'text-success' },
        ].map((card, i) => (
          <div key={i} className="rounded-xl bg-card/60 backdrop-blur-sm border border-border/30 p-3 text-center shadow-sm">
            <p className={cn('text-lg font-bold', card.color)}>{card.value}</p>
            <p className="text-[10px] text-muted-foreground font-medium">{card.label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="lancamentos" className="w-full">
        <TabsList className="w-full rounded-xl">
          <TabsTrigger value="lancamentos" className="flex-1 gap-1.5 text-xs rounded-lg">
            <Receipt className="w-3.5 h-3.5" /> Lançamentos
          </TabsTrigger>
          <TabsTrigger value="ressarcimentos" className="flex-1 gap-1.5 text-xs rounded-lg">
            <Banknote className="w-3.5 h-3.5" /> Ressarcimentos
            {stats.pendingReimbursement > 0 && (
              <Badge variant="destructive" className="text-[9px] px-1.5 py-0 ml-1">{stats.pendingReimbursement}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="lancamentos" className="mt-3">
          {/* Status filter chips */}
          <div className="flex gap-2 overflow-x-auto pb-2 mb-3 scrollbar-none">
            {statusFilters.map(sf => (
              <button
                key={sf.value}
                onClick={() => setStatusFilter(sf.value)}
                className={cn(
                  'whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-medium transition-all shrink-0 border',
                  statusFilter === sf.value
                    ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                    : 'bg-card/50 text-muted-foreground border-border/30 hover:bg-card/80'
                )}
              >
                {sf.label}
              </button>
            ))}
          </div>

          {/* List grouped by date */}
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <div key={i} className="h-16 rounded-xl bg-muted/30 animate-pulse" />)}
            </div>
          ) : expenses.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <div className="w-16 h-16 rounded-2xl bg-muted/30 flex items-center justify-center mb-4">
                <Receipt className="w-8 h-8 opacity-25" />
              </div>
              <p className="text-sm font-semibold">Nenhuma despesa encontrada</p>
              <p className="text-xs mt-1 text-center max-w-[200px]">Registre sua primeira despesa usando o botão acima ou escaneie uma nota fiscal.</p>
              <Button onClick={() => setCreateOpen(true)} variant="outline" size="sm" className="mt-4 gap-1.5 rounded-xl">
                <Plus className="w-4 h-4" /> Nova Despesa
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {grouped.map(group => (
                <div key={group.label}>
                  <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2 px-1">{group.label}</p>
                  <div className="space-y-2">
                    {group.items.map((e: any) => (
                      <ExpenseCard key={e.id} expense={e} onClick={() => setSelectedExpense(e)} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="ressarcimentos" className="mt-3">
          <ReimbursementList
            reimbursements={reimbursements}
            isLoading={loadingReimb}
            onApprove={handleApproveReimb}
            onMarkPaid={handleMarkPaid}
            onReject={handleRejectReimb}
            canApprove={true}
          />
        </TabsContent>
      </Tabs>

      {/* FAB mobile — dual action */}
      {isMobile && (
        <div className="fixed bottom-20 right-4 z-40 flex flex-col gap-2">
          <button
            onClick={() => {
              setCreateOpen(true);
              // Trigger QR scan after form opens - user can click the QR button in form
            }}
            className="w-11 h-11 rounded-full bg-card/80 backdrop-blur-sm border border-border/40 text-primary shadow-lg flex items-center justify-center active:scale-95 transition-transform"
            aria-label="Escanear nota"
          >
            <ScanLine className="w-5 h-5" />
          </button>
          <button
            onClick={() => setCreateOpen(true)}
            className="w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 flex items-center justify-center active:scale-95 transition-transform"
            aria-label="Nova despesa"
          >
            <Plus className="w-6 h-6" />
          </button>
        </div>
      )}

      {/* Create Dialog/Drawer */}
      {isMobile ? (
        <Drawer open={createOpen} onOpenChange={setCreateOpen}>
          <DrawerContent className="max-h-[92dvh] flex flex-col">
            <DrawerHeader>
              <DrawerTitle>Registrar Despesa</DrawerTitle>
            </DrawerHeader>
            <div className="px-4 pb-6 flex-1 overflow-y-auto">{CreateFormContent}</div>
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Registrar Despesa</DialogTitle>
            </DialogHeader>
            {CreateFormContent}
          </DialogContent>
        </Dialog>
      )}

      {/* Detail Sheet */}
      <ExpenseDetailSheet
        expense={selectedExpense}
        open={!!selectedExpense}
        onOpenChange={open => { if (!open) setSelectedExpense(null); }}
        onApprove={handleApproveExpense}
        onReject={handleRejectExpense}
        onRequestReimbursement={handleRequestReimbursement}
      />
    </div>
  );
}
