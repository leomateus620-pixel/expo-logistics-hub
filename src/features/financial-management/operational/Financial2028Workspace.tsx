import { useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Loader2, Lock, Plus, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { useCurrentOrg } from '@/hooks/useCurrentOrg';
import { useOrgCommissions } from '@/hooks/useOrgCommissions';
import { formatCents, parseMoneyInputToCents, formatCentsPlain } from '@/features/commercial-map/sales/salesMoney';
import type { FinancialViewPath } from '../types';
import {
  FUNDING_TYPE_LABELS, NEGOTIATION_LABELS, REVENUE_STATUS_LABELS, SPONSOR_TIER_LABELS,
  FinancialNotActivatedError, fetchBudgetLines, fetchBudgets, fetchEditionSummary, fetchEditions,
  fetchRevenues, fetchSponsorships, saveFinancialRecord,
  type FinancialBudget, type FinancialEdition, type FinancialEntity, type FinancialRevenue,
  type FinancialSponsorship, type FundingTypeKey, type NegotiationStatus, type RevenueStatus, type SponsorTierKey,
} from './financialOperationalApi';
import { buildBudgetRows, sponsorshipConfirmedCents, sponsorshipMoneyCents } from './financialOperationalMath';

const KEY = ['financial-operational'] as const;

function StateMessage({ tone, title, children }: { tone: 'info' | 'error' | 'locked'; title: string; children?: ReactNode }) {
  const Icon = tone === 'locked' ? Lock : AlertTriangle;
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className="rounded-xl border border-border bg-card p-5 text-sm">
      <p className="flex items-center gap-2 font-semibold text-foreground"><Icon className="h-4 w-4" aria-hidden />{title}</p>
      {children ? <div className="mt-2 text-muted-foreground">{children}</div> : null}
    </div>
  );
}

function Loading({ label }: { label: string }) {
  return <p role="status" className="flex items-center gap-2 p-5 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{label}</p>;
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function MoneyField({ id, label, value, onChange, hint }: { id: string; label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} inputMode="numeric" value={value} placeholder="0,00"
        onChange={(event) => onChange(event.target.value ? formatCentsPlain(parseMoneyInputToCents(event.target.value)) : '')} />
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

const centsOrNull = (value: string) => (value.trim() ? parseMoneyInputToCents(value) : null);
const moneyText = (cents: number | null | undefined) => (cents == null ? '' : formatCentsPlain(cents));

/** Salva por RPC com uma chave estável por abertura do formulário (reenvio não duplica). */
function useFinancialSave(onDone: () => void) {
  const { orgId } = useCurrentOrg();
  const queryClient = useQueryClient();
  const requestId = useRef<string>(crypto.randomUUID());
  const mutation = useMutation({
    mutationFn: (input: { entity: FinancialEntity; payload: Record<string, unknown>; expectedVersion: number | null; reason?: string | null }) =>
      saveFinancialRecord({ orgId: orgId as string, requestId: requestId.current, ...input }),
    onSuccess: () => {
      requestId.current = crypto.randomUUID();
      void queryClient.invalidateQueries({ queryKey: KEY });
      toast({ title: 'Registro salvo' });
      onDone();
    },
    onError: (error: Error) => toast({ title: 'Não foi possível salvar', description: error.message, variant: 'destructive' }),
  });
  return { ...mutation, resetRequest: () => { requestId.current = crypto.randomUUID(); } };
}

// ---------------------------------------------------------------- orçamento
function BudgetDialog({ edition, budget, open, onOpenChange, usedCommissionIds }: {
  edition: FinancialEdition; budget: FinancialBudget | null; open: boolean; onOpenChange: (v: boolean) => void; usedCommissionIds: Set<string>;
}) {
  const { commissions } = useOrgCommissions();
  const [commissionId, setCommissionId] = useState(budget?.commission_id ?? '');
  const [responsible, setResponsible] = useState(budget?.responsible_name ?? '');
  const [cap, setCap] = useState(moneyText(budget?.budget_cap_cents));
  const [notes, setNotes] = useState(budget?.notes ?? '');
  const [reason, setReason] = useState('');
  const save = useFinancialSave(() => onOpenChange(false));
  const capChanged = budget != null && centsOrNull(cap) !== budget.budget_cap_cents;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!budget && !commissionId) return toast({ title: 'Escolha a comissão', variant: 'destructive' });
    save.mutate({
      entity: 'budget', expectedVersion: budget?.version ?? null, reason: reason || null,
      payload: budget
        ? { id: budget.id, responsible_name: responsible, budget_cap_cents: centsOrNull(cap), notes }
        : { edition_id: edition.id, commission_id: commissionId, responsible_name: responsible, budget_cap_cents: centsOrNull(cap), notes },
    });
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{budget ? 'Editar orçamento' : 'Novo orçamento de comissão'}</DialogTitle>
          <DialogDescription>O valor planejado é a soma das linhas; aqui você define o teto e o responsável.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          {!budget ? (
            <div className="space-y-1.5">
              <Label>Comissão</Label>
              <Select value={commissionId} onValueChange={setCommissionId}>
                <SelectTrigger aria-label="Comissão"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {commissions.filter((c) => !usedCommissionIds.has(c.id)).map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div className="space-y-1.5"><Label htmlFor="fin-resp">Responsável</Label><Input id="fin-resp" value={responsible} onChange={(e) => setResponsible(e.target.value)} /></div>
          <MoneyField id="fin-cap" label="Teto (R$)" value={cap} onChange={setCap} hint="Deixe vazio se ainda não houver teto definido." />
          {capChanged ? (
            <div className="space-y-1.5"><Label htmlFor="fin-reason">Motivo da mudança do teto</Label><Input id="fin-reason" required minLength={3} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
          ) : null}
          <div className="space-y-1.5"><Label htmlFor="fin-notes">Observações</Label><Textarea id="fin-notes" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          <DialogFooter><Button type="submit" disabled={save.isPending}>{save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Salvar</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function BudgetLineDialog({ budgetId, open, onOpenChange }: { budgetId: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  const [description, setDescription] = useState('');
  const [planned, setPlanned] = useState('');
  const [kind, setKind] = useState<'operacional' | 'obrigacao_anterior' | 'investimento'>('operacional');
  const save = useFinancialSave(() => { onOpenChange(false); setDescription(''); setPlanned(''); });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Nova linha de orçamento</DialogTitle><DialogDescription>Cada linha soma ao planejado da comissão.</DialogDescription></DialogHeader>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate({ entity: 'budget_line', expectedVersion: null, payload: { budget_id: budgetId, description, planned_cents: parseMoneyInputToCents(planned), kind } }); }}>
          <div className="space-y-1.5"><Label htmlFor="line-desc">Descrição</Label><Input id="line-desc" required minLength={2} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
          <MoneyField id="line-planned" label="Valor previsto (R$)" value={planned} onChange={setPlanned} />
          <div className="space-y-1.5">
            <Label>Classificação</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
              <SelectTrigger aria-label="Classificação"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="operacional">Operacional</SelectItem>
                <SelectItem value="obrigacao_anterior">Obrigação de edição anterior</SelectItem>
                <SelectItem value="investimento">Investimento</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter><Button type="submit" disabled={save.isPending}>Adicionar linha</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function BudgetsView({ edition }: { edition: FinancialEdition }) {
  const { commissions } = useOrgCommissions();
  const budgets = useQuery({ queryKey: [...KEY, 'budgets', edition.id], queryFn: () => fetchBudgets(edition.id) });
  const lines = useQuery({ queryKey: [...KEY, 'lines', edition.id], queryFn: () => fetchBudgetLines(edition.id) });
  const [editing, setEditing] = useState<FinancialBudget | null | 'new'>(null);
  const [lineFor, setLineFor] = useState<string | null>(null);
  const names = useMemo(() => new Map(commissions.map((c) => [c.id, c.nome])), [commissions]);
  if (budgets.isLoading || lines.isLoading) return <Loading label="Carregando orçamentos…" />;
  if (budgets.isError || lines.isError) return <StateMessage tone="error" title="Não foi possível carregar os orçamentos." />;
  const rows = buildBudgetRows(budgets.data ?? [], lines.data ?? []);
  const used = new Set(rows.map((r) => r.budget.commission_id));
  return (
    <section className="space-y-4" aria-label="Orçamento por comissão">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Orçamento por comissão</h2>
        <Button onClick={() => setEditing('new')}><Plus className="h-4 w-4" />Novo orçamento</Button>
      </div>
      {rows.length === 0 ? <StateMessage tone="info" title="Nenhum orçamento cadastrado em 2028.">Cadastre o orçamento de cada comissão e detalhe em linhas.</StateMessage> : null}
      <ul className="grid gap-3">
        {rows.map((row) => (
          <li key={row.budget.id} className="rounded-xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold">{names.get(row.budget.commission_id) ?? 'Comissão'}</p>
                <p className="text-xs text-muted-foreground">{row.budget.responsible_name ?? 'Sem responsável definido'}</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setLineFor(row.budget.id)}><Plus className="h-4 w-4" />Linha</Button>
                <Button size="sm" variant="outline" onClick={() => setEditing(row.budget)}><Pencil className="h-4 w-4" />Editar</Button>
              </div>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              <div><dt className="text-muted-foreground">Teto</dt><dd className="tabular-nums">{row.budget.budget_cap_cents == null ? 'Sem teto' : formatCents(row.budget.budget_cap_cents)}</dd></div>
              <div><dt className="text-muted-foreground">Planejado <span className="text-xs">(calculado)</span></dt><dd className="tabular-nums">{formatCents(row.plannedCents)}</dd></div>
              <div><dt className="text-muted-foreground">Saldo</dt><dd className="tabular-nums">{row.balanceCents == null ? '—' : formatCents(row.balanceCents)}</dd></div>
              <div><dt className="text-muted-foreground">Utilização</dt><dd className="tabular-nums">{row.utilizationPercentage == null ? '—' : `${row.utilizationPercentage.toLocaleString('pt-BR')}%`}</dd></div>
            </dl>
            {row.lines.length ? (
              <ul className="mt-3 divide-y divide-border text-sm">
                {row.lines.map((line) => (
                  <li key={line.id} className="flex justify-between gap-2 py-1.5">
                    <span>{line.description}{line.kind !== 'operacional' ? <Badge variant="secondary" className="ml-2">{line.kind === 'investimento' ? 'Investimento' : 'Obrigação anterior'}</Badge> : null}</span>
                    <span className="tabular-nums">{formatCents(line.planned_cents)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
      {editing ? <BudgetDialog key={editing === 'new' ? 'new' : editing.id} edition={edition} budget={editing === 'new' ? null : editing}
        open onOpenChange={(v) => !v && setEditing(null)} usedCommissionIds={used} /> : null}
      {lineFor ? <BudgetLineDialog budgetId={lineFor} open onOpenChange={(v) => !v && setLineFor(null)} /> : null}
    </section>
  );
}

// ---------------------------------------------------------------- receitas
function RevenueDialog({ edition, revenue, onClose }: { edition: FinancialEdition; revenue: FinancialRevenue | null; onClose: () => void }) {
  const [description, setDescription] = useState(revenue?.description ?? '');
  const [counterparty, setCounterparty] = useState(revenue?.counterparty ?? '');
  const [funding, setFunding] = useState<FundingTypeKey>(revenue?.funding_type ?? 'nao_identificado');
  const [status, setStatus] = useState<RevenueStatus>(revenue?.status ?? 'projetada');
  const [projected, setProjected] = useState(moneyText(revenue?.projected_cents));
  const [confirmed, setConfirmed] = useState(moneyText(revenue?.confirmed_cents));
  const [dueDate, setDueDate] = useState(revenue?.due_date ?? '');
  const [reason, setReason] = useState('');
  const save = useFinancialSave(onClose);
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{revenue ? 'Editar receita' : 'Nova receita'}</DialogTitle>
          <DialogDescription>Confirmação comercial não é recebimento: o caixa vem dos movimentos registrados.</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(e) => {
          e.preventDefault();
          save.mutate({ entity: 'revenue', expectedVersion: revenue?.version ?? null, reason: reason || null, payload: {
            ...(revenue ? { id: revenue.id } : { edition_id: edition.id }),
            description, counterparty, funding_type: funding, status,
            projected_cents: parseMoneyInputToCents(projected),
            confirmed_cents: status === 'confirmada' ? parseMoneyInputToCents(confirmed) : null,
            due_date: dueDate || null,
          } });
        }}>
          <div className="space-y-1.5"><Label htmlFor="rev-desc">Descrição</Label><Input id="rev-desc" required minLength={2} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="rev-cp">Contraparte</Label><Input id="rev-cp" value={counterparty} onChange={(e) => setCounterparty(e.target.value)} /></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>Origem do recurso</Label>
              <Select value={funding} onValueChange={(v) => setFunding(v as FundingTypeKey)}>
                <SelectTrigger aria-label="Origem do recurso"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(FUNDING_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select></div>
            <div className="space-y-1.5"><Label>Situação</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as RevenueStatus)}>
                <SelectTrigger aria-label="Situação"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(REVENUE_STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select></div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <MoneyField id="rev-proj" label="Valor projetado (R$)" value={projected} onChange={setProjected} />
            {status === 'confirmada' ? <MoneyField id="rev-conf" label="Valor confirmado (R$)" value={confirmed} onChange={setConfirmed} /> : null}
          </div>
          <div className="space-y-1.5"><Label htmlFor="rev-due">Vencimento</Label><Input id="rev-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></div>
          {status === 'cancelada' && revenue?.status !== 'cancelada' ? (
            <div className="space-y-1.5"><Label htmlFor="rev-reason">Motivo do cancelamento</Label><Input id="rev-reason" required minLength={3} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
          ) : null}
          <DialogFooter><Button type="submit" disabled={save.isPending}>Salvar</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RevenuesView({ edition, focus }: { edition: FinancialEdition; focus: 'projetada' | 'confirmada' }) {
  const query = useQuery({ queryKey: [...KEY, 'revenues', edition.id], queryFn: () => fetchRevenues(edition.id) });
  const [editing, setEditing] = useState<FinancialRevenue | null | 'new'>(null);
  if (query.isLoading) return <Loading label="Carregando receitas…" />;
  if (query.isError) return <StateMessage tone="error" title="Não foi possível carregar as receitas." />;
  const rows = (query.data ?? []).filter((r) => (focus === 'confirmada' ? r.status === 'confirmada' : r.status !== 'cancelada'));
  return (
    <section className="space-y-4" aria-label={focus === 'confirmada' ? 'Receitas confirmadas' : 'Receitas projetadas'}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">{focus === 'confirmada' ? 'Receitas confirmadas' : 'Receitas projetadas'}</h2>
          <p className="text-xs text-muted-foreground">Receitas manuais. Patrocínios vêm da carteira e as vendas de lotes, da Dashboard Comercial.</p>
        </div>
        <Button onClick={() => setEditing('new')}><Plus className="h-4 w-4" />Nova receita</Button>
      </div>
      {rows.length === 0 ? <StateMessage tone="info" title="Nenhuma receita nesta visão." /> : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
              <div>
                <p className="font-medium">{r.description}</p>
                <p className="text-xs text-muted-foreground">{FUNDING_TYPE_LABELS[r.funding_type]} · {REVENUE_STATUS_LABELS[r.status]}{r.counterparty ? ` · ${r.counterparty}` : ''}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="tabular-nums">{formatCents(focus === 'confirmada' ? r.confirmed_cents ?? 0 : r.projected_cents)}</span>
                <Button size="sm" variant="ghost" aria-label={`Editar ${r.description}`} onClick={() => setEditing(r)}><Pencil className="h-4 w-4" /></Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {editing ? <RevenueDialog edition={edition} revenue={editing === 'new' ? null : editing} onClose={() => setEditing(null)} /> : null}
    </section>
  );
}

// ---------------------------------------------------------------- patrocínios
function SponsorshipDialog({ edition, sponsor, onClose }: { edition: FinancialEdition; sponsor: FinancialSponsorship | null; onClose: () => void }) {
  const [name, setName] = useState(sponsor?.name ?? '');
  const [tier, setTier] = useState<SponsorTierKey>(sponsor?.tier ?? 'nao_classificado');
  const [status, setStatus] = useState<NegotiationStatus>(sponsor?.negotiation_status ?? 'prospeccao');
  const [declared, setDeclared] = useState(moneyText(sponsor?.declared_cents));
  const [projFree, setProjFree] = useState(moneyText(sponsor?.projected_free_cents));
  const [projRouanet, setProjRouanet] = useState(moneyText(sponsor?.projected_rouanet_cents));
  const [confFree, setConfFree] = useState(moneyText(sponsor?.confirmed_free_cents));
  const [confRouanet, setConfRouanet] = useState(moneyText(sponsor?.confirmed_rouanet_cents));
  const [inKind, setInKind] = useState(sponsor?.in_kind_description ?? '');
  const save = useFinancialSave(onClose);
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{sponsor ? 'Editar patrocínio' : 'Novo patrocínio'}</DialogTitle>
          <DialogDescription>Declarado, projetado e confirmado são estágios do mesmo valor e não se somam.</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(e) => {
          e.preventDefault();
          save.mutate({ entity: 'sponsorship', expectedVersion: sponsor?.version ?? null, payload: {
            ...(sponsor ? { id: sponsor.id } : { edition_id: edition.id }),
            name, tier, negotiation_status: status, declared_cents: centsOrNull(declared),
            projected_free_cents: parseMoneyInputToCents(projFree), projected_rouanet_cents: parseMoneyInputToCents(projRouanet),
            confirmed_free_cents: parseMoneyInputToCents(confFree), confirmed_rouanet_cents: parseMoneyInputToCents(confRouanet),
            in_kind_description: inKind,
          } });
        }}>
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold">Identificação</legend>
            <div className="space-y-1.5"><Label htmlFor="sp-name">Patrocinador</Label><Input id="sp-name" required minLength={2} value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5"><Label>Categoria</Label>
                <Select value={tier} onValueChange={(v) => setTier(v as SponsorTierKey)}>
                  <SelectTrigger aria-label="Categoria"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(SPONSOR_TIER_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select></div>
              <div className="space-y-1.5"><Label>Negociação</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as NegotiationStatus)}>
                  <SelectTrigger aria-label="Negociação"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(NEGOTIATION_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select></div>
            </div>
          </fieldset>
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold">Valores em dinheiro</legend>
            <MoneyField id="sp-decl" label="Valor declarado (R$)" value={declared} onChange={setDeclared} />
            <div className="grid gap-4 sm:grid-cols-2">
              <MoneyField id="sp-pf" label="Projetado · recurso livre" value={projFree} onChange={setProjFree} />
              <MoneyField id="sp-pr" label="Projetado · Rouanet" value={projRouanet} onChange={setProjRouanet} />
              <MoneyField id="sp-cf" label="Confirmado · recurso livre" value={confFree} onChange={setConfFree} />
              <MoneyField id="sp-cr" label="Confirmado · Rouanet" value={confRouanet} onChange={setConfRouanet} />
            </div>
          </fieldset>
          <fieldset className="space-y-1.5">
            <legend className="text-sm font-semibold">Contrapartida em bens ou serviços</legend>
            <Textarea aria-label="Contrapartida" value={inKind} onChange={(e) => setInKind(e.target.value)} />
          </fieldset>
          <DialogFooter><Button type="submit" disabled={save.isPending}>Salvar</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SponsorshipsView({ edition }: { edition: FinancialEdition }) {
  const query = useQuery({ queryKey: [...KEY, 'sponsorships', edition.id], queryFn: () => fetchSponsorships(edition.id) });
  const [editing, setEditing] = useState<FinancialSponsorship | null | 'new'>(null);
  if (query.isLoading) return <Loading label="Carregando patrocínios…" />;
  if (query.isError) return <StateMessage tone="error" title="Não foi possível carregar os patrocínios." />;
  const rows = query.data ?? [];
  return (
    <section className="space-y-4" aria-label="Patrocínios">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Carteira de patrocínios 2028</h2>
        <Button onClick={() => setEditing('new')}><Plus className="h-4 w-4" />Novo patrocínio</Button>
      </div>
      {rows.length === 0 ? <StateMessage tone="info" title="Nenhum patrocínio cadastrado em 2028." /> : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {rows.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
              <div>
                <p className="font-medium">{s.name}</p>
                <p className="text-xs text-muted-foreground">{SPONSOR_TIER_LABELS[s.tier]} · {NEGOTIATION_LABELS[s.negotiation_status]}{s.in_kind_description ? ' · com contrapartida' : ''}</p>
              </div>
              <div className="flex items-center gap-3 text-right">
                <span className="tabular-nums"><span className="block text-xs text-muted-foreground">Projetado</span>{formatCents(sponsorshipMoneyCents(s))}</span>
                <span className="tabular-nums"><span className="block text-xs text-muted-foreground">Confirmado</span>{formatCents(sponsorshipConfirmedCents(s))}</span>
                <Button size="sm" variant="ghost" aria-label={`Editar ${s.name}`} onClick={() => setEditing(s)}><Pencil className="h-4 w-4" /></Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {editing ? <SponsorshipDialog edition={edition} sponsor={editing === 'new' ? null : editing} onClose={() => setEditing(null)} /> : null}
    </section>
  );
}

// ---------------------------------------------------------------- painel
function DashboardView({ edition }: { edition: FinancialEdition }) {
  const { orgId } = useCurrentOrg();
  const query = useQuery({ queryKey: [...KEY, 'summary', edition.id], queryFn: () => fetchEditionSummary(orgId as string, edition.id), enabled: Boolean(orgId) });
  if (query.isLoading) return <Loading label="Consolidando a edição…" />;
  if (query.isError || !query.data) return <StateMessage tone="error" title="Não foi possível consolidar os valores.">Nenhum total é mostrado como zero quando a consulta falha.</StateMessage>;
  const s = query.data;
  // Antes da atualização do backend, despesas da edição ainda não existem: execução zero, nunca o pago.
  const exp = s.expenses ?? { count: 0, planned_cents: 0, committed_cents: 0, paid_cents: s.obligations.paid_cents, payable_open_cents: s.obligations.payable_open_cents, overdue_count: 0 };
  const rev = s.revenues ?? { projected_cents: s.revenue.projected_cents + s.sponsorship.projected_cents, confirmed_cents: s.revenue.confirmed_cents + s.sponsorship.confirmed_cents, received_cents: s.obligations.received_cents, receivable_open_cents: s.obligations.receivable_open_cents, overdue_count: 0 };
  return (
    <section className="space-y-4" aria-label="Painel financeiro 2028">
      <h2 className="text-lg font-semibold">Painel Financeiro · {edition.label}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Teto orçamentário" value={formatCents(s.budget.cap_cents)} hint={`${s.budget.count} comissões${s.budget.uncapped_count ? ` · ${s.budget.uncapped_count} sem teto` : ''}`} />
        <Metric label="Planejado (linhas)" value={formatCents(s.budget.planned_cents)} hint={`${s.budget.line_count} linhas ativas`} />
        <Metric label="Orçamento executado" value={formatCents(exp.committed_cents)} hint="Compromisso: despesas realizadas, pagas ou não" />
        <Metric label="Folga do orçamento" value={formatCents(s.budget.planned_cents - exp.committed_cents)} hint="Planejado − realizado (não é saldo a pagar)" />
      </div>
      <h3 className="pt-2 text-sm font-semibold">Despesas</h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Previsto" value={formatCents(exp.planned_cents)} hint="Compromisso · estimativa" />
        <Metric label="Realizado / comprometido" value={formatCents(exp.committed_cents)} hint="Compromisso · dívida existente" />
        <Metric label="Pago" value={formatCents(exp.paid_cents)} hint="Caixa · pagamentos registrados" />
        <Metric label="Saldo a pagar" value={formatCents(exp.payable_open_cents)} hint={exp.overdue_count ? `Realizado − pago · ${exp.overdue_count} vencidas` : 'Realizado − pago'} />
      </div>
      <h3 className="pt-2 text-sm font-semibold">Receitas e patrocínios</h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Projetado" value={formatCents(rev.projected_cents)} hint="Compromisso · expectativa" />
        <Metric label="Confirmado" value={formatCents(rev.confirmed_cents)} hint="Compromisso, não caixa" />
        <Metric label="Recebido" value={formatCents(rev.received_cents)} hint="Caixa · recebimentos registrados" />
        <Metric label="Saldo a receber" value={formatCents(rev.receivable_open_cents)} hint={rev.overdue_count ? `Confirmado − recebido · ${rev.overdue_count} vencidas` : 'Confirmado − recebido'} />
      </div>
      {s.obligations.inconsistent_count ? (
        <StateMessage tone="error" title={`${s.obligations.inconsistent_count} registro(s) cancelado(s) com valor já liquidado`}>Registre o estorno ou a devolução; o valor pago/recebido não é apagado.</StateMessage>
      ) : null}
      <p className="text-xs text-muted-foreground">
        A comercialização de lotes aparece pela Dashboard Comercial, com as mesmas regras de cálculo. Contrapartidas em bens ou serviços ({formatCents(s.sponsorship.in_kind_cents)}) não entram no dinheiro.
      </p>
    </section>
  );
}

const PENDING_VIEWS: Partial<Record<FinancialViewPath, string>> = {
  'despesas-previstas': 'Cada despesa de 2028 terá valor previsto, comissão, linha de orçamento e vencimento, aproveitando os lançamentos de despesas que já existem.',
  'despesas-realizadas': 'Despesa realizada é compromisso: entra na execução do orçamento na data de realização e fica com saldo a pagar até o pagamento ser registrado.',
  simulacoes: 'Os cenários Realista, Pessimista e Otimista serão salvos em versões próprias de 2028.',
  relatorios: 'Os relatórios de 2028 usarão a mesma consolidação do painel.',
};

export function Financial2028Workspace({ view }: { view: FinancialViewPath }) {
  const { orgId } = useCurrentOrg();
  const editions = useQuery({ queryKey: [...KEY, 'editions', orgId], queryFn: () => fetchEditions(orgId as string), enabled: Boolean(orgId), retry: false });
  if (!orgId || editions.isLoading) return <Loading label="Abrindo Fenasoja 2028…" />;
  if (editions.error instanceof FinancialNotActivatedError) {
    return <StateMessage tone="locked" title="Financeiro 2028 ainda não ativado">A estrutura de cadastros está pronta, mas o banco ainda não recebeu a atualização. Ela só será aplicada com autorização.</StateMessage>;
  }
  if (editions.isError) return <StateMessage tone="error" title="Não foi possível abrir a edição 2028." />;
  const edition = editions.data?.find((e) => e.code === 2028);
  if (!edition) return <StateMessage tone="locked" title="Edição 2028 indisponível para sua conta">Peça acesso financeiro ao administrador.</StateMessage>;
  if (view === 'dashboard') return <DashboardView edition={edition} />;
  if (view === 'orcamento-comissoes') return <BudgetsView edition={edition} />;
  if (view === 'receitas-projetadas') return <RevenuesView edition={edition} focus="projetada" />;
  if (view === 'receitas-confirmadas') return <RevenuesView edition={edition} focus="confirmada" />;
  if (view === 'patrocinios') return <SponsorshipsView edition={edition} />;
  return <StateMessage tone="info" title="Em construção nesta edição">{PENDING_VIEWS[view]}</StateMessage>;
}
