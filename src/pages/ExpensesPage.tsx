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
import {
  Plus, Receipt, Banknote, ScanLine, User, X,
  AlertCircle, Clock, CheckCircle2,
} from 'lucide-react';
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

// Status that count as "owed back" to the person who paid
// (validated, not yet reimbursed). Excludes drafts, pending validation,
// rejected, cancelled and already paid back.
const RECEIVABLE_STATUSES = new Set(['aprovado', 'ressarcimento_solicitado']);

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

function brl(v: number) {
  return `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
}

export default function ExpensesPage() {
  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();
  const [createOpen, setCreateOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [personFilter, setPersonFilter] = useState('');
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

  // Aggregate per person: total spent + amount still receivable + count
  const personSummary = useMemo(() => {
    const m = new Map<string, { total: number; aReceber: number; count: number }>();
    for (const e of expenses) {
      const name = e.paid_by_name?.trim();
      if (!name) continue;
      const cur = m.get(name) ?? { total: 0, aReceber: 0, count: 0 };
      const amt = Number(e.amount) || 0;
      cur.total += amt;
      cur.count += 1;
      if (RECEIVABLE_STATUSES.has(e.status)) cur.aReceber += amt;
      m.set(name, cur);
    }
    return m;
  }, [expenses]);

  const distinctNames = useMemo(
    () => [...personSummary.keys()].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [personSummary]
  );

  const totalAReceberGeral = useMemo(
    () => [...personSummary.values()].reduce((s, p) => s + p.aReceber, 0),
    [personSummary]
  );

  const filteredExpenses = useMemo(
    () => (personFilter ? expenses.filter((e: any) => e.paid_by_name === personFilter) : expenses),
    [expenses, personFilter]
  );

  const grouped = useMemo(() => groupByDate(filteredExpenses), [filteredExpenses]);
  const personData = personFilter ? personSummary.get(personFilter) : undefined;

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

  // Summary cards (Liquid Glass 3D)
  const summaryCards = [
    { value: stats.pendingReceipt, label: 'Sem comprovante', tone: 'accent', icon: AlertCircle },
    { value: stats.pendingValidation, label: 'Em validação', tone: 'primary', icon: Clock },
    { value: stats.pendingReimbursement, label: 'Ressarc. pendente', tone: 'gold', icon: Banknote },
    { value: brl(stats.reimbursedAmount), label: 'Já ressarcido', tone: 'success', icon: CheckCircle2 },
  ] as const;

  const toneStyles: Record<string, { text: string; chip: string; ring: string }> = {
    accent:  { text: 'text-accent',  chip: 'bg-accent/15 text-accent',   ring: 'shadow-[0_8px_24px_-12px_hsl(var(--accent)/0.4)]' },
    primary: { text: 'text-primary', chip: 'bg-primary/15 text-primary', ring: 'shadow-[0_8px_24px_-12px_hsl(var(--primary)/0.4)]' },
    gold:    { text: 'text-gold',    chip: 'bg-gold/15 text-gold',       ring: 'shadow-[0_8px_24px_-12px_hsl(var(--gold)/0.4)]' },
    success: { text: 'text-success', chip: 'bg-success/15 text-success', ring: 'shadow-[0_8px_24px_-12px_hsl(var(--success)/0.4)]' },
  };

  return (
    <div className="space-y-5 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={cn(
              'relative w-12 h-12 rounded-2xl flex items-center justify-center shrink-0',
              'bg-gradient-to-br from-primary/25 via-primary/10 to-gold/15',
              'border border-white/10',
              'shadow-[inset_0_1px_0_rgba(255,255,255,0.18),inset_0_-2px_4px_rgba(0,0,0,0.1),0_4px_12px_-4px_hsl(var(--primary)/0.3)]',
            )}
          >
            <Receipt className="w-6 h-6 text-primary drop-shadow-sm" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight truncate">Despesas</h1>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {stats.total} {stats.total === 1 ? 'lançamento' : 'lançamentos'} • {brl(stats.totalAmount)}
            </p>
          </div>
        </div>
        <Button
          onClick={() => setCreateOpen(true)}
          className={cn(
            'gap-1.5 rounded-xl h-11 px-4 shrink-0 font-semibold',
            'bg-gradient-to-b from-primary to-primary/85 hover:from-primary/95 hover:to-primary/80',
            'shadow-[0_8px_20px_-8px_hsl(var(--primary)/0.5),inset_0_1px_0_rgba(255,255,255,0.18)]',
          )}
        >
          <Plus className="w-4 h-4" /> Nova despesa
        </Button>
      </div>

      {/* Summary cards 3D */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {summaryCards.map((card, i) => {
          const t = toneStyles[card.tone];
          const Ic = card.icon;
          return (
            <div
              key={i}
              className={cn(
                'relative rounded-2xl p-3.5 transition-all duration-300',
                'bg-gradient-to-br from-card/80 via-card/55 to-card/35 backdrop-blur-xl',
                'border border-white/10',
                'shadow-[0_4px_14px_-6px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.08)]',
                'hover:-translate-y-0.5',
                t.ring,
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <div className={cn('w-7 h-7 rounded-xl flex items-center justify-center', t.chip)}>
                  <Ic className="w-3.5 h-3.5" />
                </div>
              </div>
              <p className={cn('text-xl font-extrabold tracking-tight leading-none', t.text)}>{card.value}</p>
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mt-1.5">
                {card.label}
              </p>
            </div>
          );
        })}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="lancamentos" className="w-full">
        <TabsList className="w-full rounded-xl bg-muted/40 backdrop-blur-md border border-white/5 h-11">
          <TabsTrigger
            value="lancamentos"
            className="flex-1 gap-1.5 text-xs rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_2px_8px_-3px_rgba(0,0,0,0.2)] data-[state=active]:text-foreground font-semibold"
          >
            <Receipt className="w-3.5 h-3.5" /> Lançamentos
          </TabsTrigger>
          <TabsTrigger
            value="ressarcimentos"
            className="flex-1 gap-1.5 text-xs rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_2px_8px_-3px_rgba(0,0,0,0.2)] data-[state=active]:text-foreground font-semibold"
          >
            <Banknote className="w-3.5 h-3.5" /> Ressarcimentos
            {stats.pendingReimbursement > 0 && (
              <Badge variant="destructive" className="text-[9px] px-1.5 py-0 ml-1">
                {stats.pendingReimbursement}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="lancamentos" className="mt-3 space-y-3">
          {/* Status filter chips */}
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none -mx-1 px-1">
            {statusFilters.map(sf => {
              const active = statusFilter === sf.value;
              return (
                <button
                  key={sf.value}
                  onClick={() => setStatusFilter(sf.value)}
                  className={cn(
                    'whitespace-nowrap px-3.5 py-2 rounded-full text-xs font-semibold transition-all shrink-0 border',
                    active
                      ? 'bg-gradient-to-b from-primary to-primary/85 text-primary-foreground border-primary/40 shadow-[0_4px_12px_-4px_hsl(var(--primary)/0.5),inset_0_1px_0_rgba(255,255,255,0.2)]'
                      : 'bg-card/50 text-muted-foreground border-white/10 hover:bg-card/80 backdrop-blur-md',
                  )}
                >
                  {sf.label}
                </button>
              );
            })}
          </div>

          {/* Person filter */}
          {distinctNames.length > 0 && (
            <Select
              value={personFilter || '__all__'}
              onValueChange={(v) => setPersonFilter(v === '__all__' ? '' : v)}
            >
              <SelectTrigger
                className={cn(
                  'h-11 rounded-xl text-xs px-3.5',
                  'bg-gradient-to-br from-card/70 to-card/40 backdrop-blur-xl border border-white/10',
                  'shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]',
                )}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <User className="w-4 h-4 text-muted-foreground shrink-0" />
                  <SelectValue placeholder="Filtrar por pessoa" />
                </div>
              </SelectTrigger>
              <SelectContent className="max-h-[60dvh]">
                <SelectItem value="__all__">
                  <div className="flex items-center justify-between gap-3 w-full">
                    <span className="font-medium">Todas as pessoas</span>
                    {totalAReceberGeral > 0 && (
                      <span className="text-[11px] text-gold font-semibold">{brl(totalAReceberGeral)}</span>
                    )}
                  </div>
                </SelectItem>
                {distinctNames.map(name => {
                  const p = personSummary.get(name)!;
                  return (
                    <SelectItem key={name} value={name}>
                      <div className="flex items-center justify-between gap-3 w-full">
                        <span className="truncate">{name}</span>
                        <span className={cn(
                          'text-[11px] font-semibold shrink-0',
                          p.aReceber > 0 ? 'text-gold' : 'text-muted-foreground/60',
                        )}>
                          {brl(p.aReceber)}
                        </span>
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          )}

          {/* Person highlight banner */}
          {personFilter && personData && (
            <div
              className={cn(
                'relative rounded-2xl p-4',
                'bg-gradient-to-br from-primary/15 via-primary/5 to-gold/10 backdrop-blur-xl',
                'border border-white/10',
                'shadow-[0_8px_24px_-12px_hsl(var(--primary)/0.35),inset_0_1px_0_rgba(255,255,255,0.1)]',
              )}
            >
              <button
                onClick={() => setPersonFilter('')}
                aria-label="Limpar filtro"
                className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full bg-card/70 backdrop-blur-md border border-white/10 flex items-center justify-center hover:bg-card transition-colors"
              >
                <X className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
              <div className="flex items-center gap-2.5 mb-2">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary/30 to-primary/10 border border-white/10 flex items-center justify-center text-sm font-bold text-primary shadow-inner">
                  {personFilter.charAt(0).toLocaleUpperCase('pt-BR')}
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Pessoa</p>
                  <p className="text-sm font-bold truncate">{personFilter}</p>
                </div>
              </div>
              <div className="mt-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">A receber</p>
                <p className={cn(
                  'text-2xl font-extrabold tracking-tight leading-none mt-0.5',
                  personData.aReceber > 0 ? 'text-gold' : 'text-muted-foreground',
                )}>
                  {brl(personData.aReceber)}
                </p>
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  {personData.count} {personData.count === 1 ? 'lançamento' : 'lançamentos'} • {brl(personData.total)} no total
                </p>
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <div key={i} className="h-20 rounded-2xl bg-muted/30 animate-pulse" />)}
            </div>
          ) : filteredExpenses.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 border border-white/10 flex items-center justify-center mb-4 shadow-inner">
                <Receipt className="w-8 h-8 opacity-30" />
              </div>
              <p className="text-sm font-semibold">Nenhuma despesa encontrada</p>
              <p className="text-xs mt-1 text-center max-w-[220px]">
                Registre sua primeira despesa pelo botão acima ou escaneie a nota fiscal.
              </p>
              <Button onClick={() => setCreateOpen(true)} variant="outline" size="sm" className="mt-4 gap-1.5 rounded-xl h-10">
                <Plus className="w-4 h-4" /> Nova despesa
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {grouped.map(group => (
                <div key={group.label}>
                  <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2 px-1">
                    {group.label}
                  </p>
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
        <div className="fixed bottom-20 right-4 z-40 flex flex-col gap-2.5 items-end">
          <button
            onClick={() => setCreateOpen(true)}
            aria-label="Escanear nota"
            className={cn(
              'w-12 h-12 rounded-full flex items-center justify-center transition-transform active:scale-95',
              'bg-card/80 backdrop-blur-xl border border-white/15 text-primary',
              'shadow-[0_8px_20px_-8px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.15)]',
            )}
          >
            <ScanLine className="w-5 h-5" />
          </button>
          <button
            onClick={() => setCreateOpen(true)}
            aria-label="Nova despesa"
            className={cn(
              'h-14 px-5 rounded-full flex items-center gap-2 transition-transform active:scale-95',
              'bg-gradient-to-b from-primary to-primary/85 text-primary-foreground font-semibold',
              'shadow-[0_12px_28px_-8px_hsl(var(--primary)/0.55),inset_0_1px_0_rgba(255,255,255,0.2)]',
            )}
          >
            <Plus className="w-5 h-5" />
            <span className="text-sm">Nova despesa</span>
          </button>
        </div>
      )}

      {/* Create Dialog/Drawer */}
      {isMobile ? (
        <Drawer open={createOpen} onOpenChange={setCreateOpen}>
          <DrawerContent className="max-h-[92dvh] flex flex-col">
            <DrawerHeader>
              <DrawerTitle>Registrar despesa</DrawerTitle>
            </DrawerHeader>
            <div className="px-4 pb-6 flex-1 overflow-y-auto">{CreateFormContent}</div>
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Registrar despesa</DialogTitle>
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
