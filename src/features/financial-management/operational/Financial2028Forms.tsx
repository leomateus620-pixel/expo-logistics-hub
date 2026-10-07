import { createContext, useContext, useRef, useState, type FormEvent, type ReactNode } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Loader2, Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { useCurrentOrg } from '@/hooks/useCurrentOrg';
import { useOrgCommissions } from '@/hooks/useOrgCommissions';
import { parseMoneyInputToCents, formatCentsPlain } from '@/features/commercial-map/sales/salesMoney';
import {
  FUNDING_TYPE_LABELS, NEGOTIATION_LABELS, REVENUE_STATUS_LABELS, SPONSOR_TIER_LABELS,
  saveFinancialRecord,
  type FinancialBudget, type FinancialEdition, type FinancialEntity, type FinancialRevenue,
  type FinancialSponsorship, type FundingTypeKey, type NegotiationStatus, type RevenueStatus, type SponsorTierKey,
} from './financialOperationalApi';
import '@/styles/financial-operational-2028-forms.css';

const KEY = ['financial-operational'] as const;
const centsOrNull = (value: string) => (value.trim() ? parseMoneyInputToCents(value) : null);
const moneyText = (cents: number | null | undefined) => (cents == null ? '' : formatCentsPlain(cents));
const FieldErrors = createContext<Record<string, string>>({});
const ClearFieldError = createContext<(id: string) => void>(() => undefined);
const FormPending = createContext(false);

type FieldAccessibility = { 'aria-invalid': true | undefined; 'aria-describedby': string | undefined };

function Field({ id, label, required, hint, children }: {
  id: string; label: string; required?: boolean; hint?: string; children: (props: FieldAccessibility) => ReactNode;
}) {
  const error = useContext(FieldErrors)[id];
  const describedBy = [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined;
  return (
    <div className="financial-2028-dialog__field">
      <Label htmlFor={id}>{label}{required ? <><span aria-hidden="true" className="financial-2028-dialog__required"> *</span><span className="sr-only"> (obrigatório)</span></> : null}</Label>
      {children({ 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy })}
      {hint ? <p id={`${id}-hint`} className="financial-2028-dialog__hint">{hint}</p> : null}
      {error ? <p id={`${id}-error`} className="financial-2028-dialog__field-error">{error}</p> : null}
    </div>
  );
}

function MoneyField({ id, label, value, onChange, hint }: {
  id: string; label: string; value: string; onChange: (v: string) => void; hint?: string;
}) {
  return (
    <Field id={id} label={label} hint={hint}>
      {(a11y) => <Input id={id} inputMode="numeric" className="financial-2028-dialog__money" value={value} placeholder="0,00" {...a11y}
        onChange={(event) => onChange(event.target.value ? formatCentsPlain(parseMoneyInputToCents(event.target.value)) : '')} />}
    </Field>
  );
}

function SelectField({ id, label, value, onChange, options, required, placeholder, hint }: {
  id: string; label: string; value: string; onChange: (v: string) => void; options: Record<string, string>;
  required?: boolean; placeholder?: string; hint?: string;
}) {
  const clearError = useContext(ClearFieldError);
  const pending = useContext(FormPending);
  return (
    <Field id={id} label={label} required={required} hint={hint}>
      {(a11y) => (
        <Select disabled={pending} value={value} onValueChange={(next) => { clearError(id); onChange(next); }}>
          <SelectTrigger id={id} aria-label={label} aria-required={required || undefined} {...a11y}><SelectValue placeholder={placeholder} /></SelectTrigger>
          <SelectContent className="financial-2028-select" collisionPadding={12}>
            {Object.entries(options).map(([key, text]) => <SelectItem key={key} value={key}>{text}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
    </Field>
  );
}

/** A tentativa mantém a mesma chave após falha; dados canônicos e RPC permanecem intactos. */
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

function DialogForm({ open = true, onOpenChange, title, description, context, pending, error, onSubmit, validate, action = 'Salvar', children }: {
  open?: boolean; onOpenChange: (v: boolean) => void; title: string; description: string; context: string;
  pending: boolean; error: Error | null; onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  validate?: () => Record<string, string>; action?: string; children: ReactNode;
}) {
  // Forms are opened from list actions rather than DialogTrigger. Keep their exact origin and scroll position.
  const opener = useRef<HTMLElement | null>(typeof document === 'undefined' ? null : document.activeElement as HTMLElement);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const conflict = /alterado por outra pessoa|conflito/i.test(error?.message ?? '');
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    const nextErrors = { ...validate?.() };
    event.currentTarget.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea').forEach((field) => {
      const tooShort = field.minLength > 0 && field.value.length > 0 && field.value.length < field.minLength;
      if (!field.validity.valid || tooShort) {
        nextErrors[field.id] = field.validity.valueMissing ? 'Preencha este campo.'
          : field.validity.tooShort || tooShort ? `Use pelo menos ${field.minLength} caracteres.` : 'Confira o valor informado.';
      }
    });
    setErrors(nextErrors);
    const firstId = Object.keys(nextErrors)[0];
    if (firstId) {
      document.getElementById(firstId)?.focus();
      return;
    }
    onSubmit(event);
  };
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(value) => { if (!pending) onOpenChange(value); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="financial-2028-dialog-overlay" />
        <div className="financial-2028-dialog-viewport">
          <DialogPrimitive.Content className="financial-2028-dialog" onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (opener.current?.isConnected) opener.current.focus({ preventScroll: true });
          }} onEscapeKeyDown={(event) => { if (pending) event.preventDefault(); }} onPointerDownOutside={(event) => { if (pending) event.preventDefault(); }}>
            <header className="financial-2028-dialog__header">
              <p className="financial-2028-dialog__eyebrow">Fenasoja 2028 · {context}</p>
              <DialogPrimitive.Title className="financial-2028-dialog__title">{title}</DialogPrimitive.Title>
              <DialogPrimitive.Description className="financial-2028-dialog__description">{description}</DialogPrimitive.Description>
            </header>
            <form className="financial-2028-dialog__form" noValidate onSubmit={submit} aria-busy={pending} onInputCapture={(event) => {
              const id = (event.target as HTMLInputElement).id;
              if (errors[id]) setErrors((current) => { const next = { ...current }; delete next[id]; return next; });
            }}>
              <div className="financial-2028-dialog__body">
                {error ? (
                  <div className="financial-2028-dialog__error" role="alert">
                    <AlertCircle size={18} aria-hidden="true" />
                    <div><strong>{conflict ? 'Conflito de versão' : 'Não foi possível salvar'}</strong><p>{error.message}</p><p>Seu preenchimento foi preservado.{conflict ? ' Revise a versão atual antes de reenviar.' : ' Confira as informações e tente novamente.'}</p></div>
                  </div>
                ) : null}
                <ClearFieldError.Provider value={(id) => setErrors((current) => { const next = { ...current }; delete next[id]; return next; })}>
                  <FormPending.Provider value={pending}><FieldErrors.Provider value={errors}><fieldset className="financial-2028-dialog__fields" disabled={pending}>{children}</fieldset></FieldErrors.Provider></FormPending.Provider>
                </ClearFieldError.Provider>
              </div>
              <footer className="financial-2028-dialog__footer">
                <p className="financial-2028-dialog__footer-hint" role={pending ? 'status' : undefined}>{pending ? 'Aguardando confirmação do servidor…' : '* Campos obrigatórios'}</p>
                <div className="financial-2028-dialog__actions">
                  <Button type="button" variant="outline" className="financial-2028-dialog__cancel" disabled={pending} onClick={() => onOpenChange(false)}>Cancelar</Button>
                  <Button type="submit" className="financial-2028-dialog__save" disabled={pending}>{pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}{pending ? 'Salvando…' : action}</Button>
                </div>
              </footer>
            </form>
            <DialogPrimitive.Close className="financial-2028-dialog__close" disabled={pending} aria-label="Fechar formulário"><X size={19} aria-hidden="true" /></DialogPrimitive.Close>
          </DialogPrimitive.Content>
        </div>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function BudgetDialog({ edition, budget, open, onOpenChange, usedCommissionIds }: {
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
  return (
    <DialogForm open={open} onOpenChange={onOpenChange} context="Orçamento por comissão" title={budget ? 'Editar orçamento' : 'Novo orçamento de comissão'}
      description="O valor planejado é a soma das linhas; aqui você define o teto e o responsável." pending={save.isPending} error={save.error}
      validate={() => !budget && !commissionId ? { 'fin-commission': 'Escolha a comissão.' } : {}}
      onSubmit={() => save.mutate({
        entity: 'budget', expectedVersion: budget?.version ?? null, reason: reason || null,
        payload: budget
          ? { id: budget.id, responsible_name: responsible, budget_cap_cents: centsOrNull(cap), notes }
          : { edition_id: edition.id, commission_id: commissionId, responsible_name: responsible, budget_cap_cents: centsOrNull(cap), notes },
      })}>
      <fieldset className="financial-2028-dialog__group">
        <legend>Identificação</legend>
        {!budget ? <SelectField id="fin-commission" label="Comissão" required value={commissionId} onChange={setCommissionId} placeholder="Selecione a comissão"
          options={Object.fromEntries(commissions.filter((c) => !usedCommissionIds.has(c.id)).map((c) => [c.id, c.nome]))} />
          : <Field id="fin-commission" label="Comissão">{(a11y) => <Input id="fin-commission" readOnly value={commissions.find((c) => c.id === budget.commission_id)?.nome ?? 'Identificação indisponível'} {...a11y} />}</Field>}
        <Field id="fin-resp" label="Responsável" hint="Pessoa que acompanha o orçamento desta comissão.">{(a11y) => <Input id="fin-resp" value={responsible} onChange={(e) => setResponsible(e.target.value)} {...a11y} />}</Field>
      </fieldset>
      <fieldset className="financial-2028-dialog__group">
        <legend>Teto e observações</legend>
        <MoneyField id="fin-cap" label="Teto (R$)" value={cap} onChange={setCap} hint="Deixe vazio para manter “Sem teto”. Zero define um teto de R$ 0,00." />
        {capChanged ? <Field id="fin-reason" label="Motivo da mudança do teto" required hint="Explique a alteração em pelo menos 3 caracteres.">{(a11y) => <Input id="fin-reason" required minLength={3} value={reason} onChange={(e) => setReason(e.target.value)} {...a11y} />}</Field> : null}
        <Field id="fin-notes" label="Observações">{(a11y) => <Textarea id="fin-notes" value={notes} onChange={(e) => setNotes(e.target.value)} {...a11y} />}</Field>
      </fieldset>
    </DialogForm>
  );
}

export function BudgetLineDialog({ budgetId, commissionName, open, onOpenChange }: { budgetId: string; commissionName?: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  const [description, setDescription] = useState('');
  const [planned, setPlanned] = useState('');
  const [kind, setKind] = useState<'operacional' | 'obrigacao_anterior' | 'investimento'>('operacional');
  const save = useFinancialSave(() => { onOpenChange(false); setDescription(''); setPlanned(''); });
  return (
    <DialogForm open={open} onOpenChange={onOpenChange} context="Orçamento por comissão" title="Nova linha de orçamento" description={commissionName ? `Cada linha soma ao planejado de ${commissionName}.` : 'Cada linha soma ao planejado da comissão.'}
      pending={save.isPending} error={save.error} action="Adicionar linha"
      onSubmit={() => save.mutate({ entity: 'budget_line', expectedVersion: null, payload: { budget_id: budgetId, description, planned_cents: parseMoneyInputToCents(planned), kind } })}>
      <Field id="line-desc" label="Descrição" required hint="Identifique o item ou a finalidade desta linha.">{(a11y) => <Input id="line-desc" required minLength={2} value={description} onChange={(e) => setDescription(e.target.value)} {...a11y} />}</Field>
      <div className="financial-2028-dialog__grid">
        <MoneyField id="line-planned" label="Valor previsto (R$)" value={planned} onChange={setPlanned} />
        <SelectField id="line-kind" label="Classificação" value={kind} onChange={(v) => setKind(v as typeof kind)} options={{ operacional: 'Operacional', obrigacao_anterior: 'Obrigação de edição anterior', investimento: 'Investimento' }} />
      </div>
    </DialogForm>
  );
}

export function RevenueDialog({ edition, revenue, onClose }: { edition: FinancialEdition; revenue: FinancialRevenue | null; onClose: () => void }) {
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
    <DialogForm onOpenChange={(v) => !v && onClose()} context="Receitas" title={revenue ? 'Editar receita' : 'Nova receita'}
      description="Confirmação comercial não é recebimento: o caixa vem dos movimentos registrados." pending={save.isPending} error={save.error}
      onSubmit={() => save.mutate({ entity: 'revenue', expectedVersion: revenue?.version ?? null, reason: reason || null, payload: {
        ...(revenue ? { id: revenue.id } : { edition_id: edition.id }),
        description, counterparty, funding_type: funding, status,
        projected_cents: parseMoneyInputToCents(projected),
        confirmed_cents: status === 'confirmada' ? parseMoneyInputToCents(confirmed) : null,
        due_date: dueDate || null,
      } })}>
      <fieldset className="financial-2028-dialog__group">
        <legend>Identificação da receita</legend>
        <Field id="rev-desc" label="Descrição" required hint="Identifique a origem ou a finalidade da receita.">{(a11y) => <Input id="rev-desc" required minLength={2} value={description} onChange={(e) => setDescription(e.target.value)} {...a11y} />}</Field>
        <Field id="rev-cp" label="Contraparte" hint="Pessoa ou organização relacionada à receita, quando houver.">{(a11y) => <Input id="rev-cp" value={counterparty} onChange={(e) => setCounterparty(e.target.value)} {...a11y} />}</Field>
        <div className="financial-2028-dialog__grid">
          <SelectField id="rev-funding" label="Origem do recurso" value={funding} onChange={(v) => setFunding(v as FundingTypeKey)} options={FUNDING_TYPE_LABELS} />
          <SelectField id="rev-status" label="Situação" value={status} onChange={(v) => setStatus(v as RevenueStatus)} options={REVENUE_STATUS_LABELS} />
        </div>
      </fieldset>
      <fieldset className="financial-2028-dialog__group">
        <legend>Valores e vencimento</legend>
        <div className="financial-2028-dialog__grid">
          <MoneyField id="rev-proj" label="Valor projetado (R$)" value={projected} onChange={setProjected} />
          {status === 'confirmada' ? <MoneyField id="rev-conf" label="Valor confirmado (R$)" value={confirmed} onChange={setConfirmed} hint="Confirmação do compromisso; não registra recebimento." /> : null}
          <Field id="rev-due" label="Vencimento">{(a11y) => <Input id="rev-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} {...a11y} />}</Field>
        </div>
        {status === 'cancelada' && revenue?.status !== 'cancelada' ? <Field id="rev-reason" label="Motivo do cancelamento" required hint="Explique o cancelamento em pelo menos 3 caracteres.">{(a11y) => <Input id="rev-reason" required minLength={3} value={reason} onChange={(e) => setReason(e.target.value)} {...a11y} />}</Field> : null}
      </fieldset>
    </DialogForm>
  );
}

export function SponsorshipDialog({ edition, sponsor, onClose }: { edition: FinancialEdition; sponsor: FinancialSponsorship | null; onClose: () => void }) {
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
    <DialogForm onOpenChange={(v) => !v && onClose()} context="Patrocínios" title={sponsor ? 'Editar patrocínio' : 'Novo patrocínio'}
      description="Declarado, projetado e confirmado são estágios do mesmo valor e não se somam." pending={save.isPending} error={save.error}
      onSubmit={() => save.mutate({ entity: 'sponsorship', expectedVersion: sponsor?.version ?? null, payload: {
        ...(sponsor ? { id: sponsor.id } : { edition_id: edition.id }),
        name, tier, negotiation_status: status, declared_cents: centsOrNull(declared),
        projected_free_cents: parseMoneyInputToCents(projFree), projected_rouanet_cents: parseMoneyInputToCents(projRouanet),
        confirmed_free_cents: parseMoneyInputToCents(confFree), confirmed_rouanet_cents: parseMoneyInputToCents(confRouanet),
        in_kind_description: inKind,
      } })}>
      <fieldset className="financial-2028-dialog__group">
        <legend>Identificação</legend>
        <Field id="sp-name" label="Patrocinador" required>{(a11y) => <Input id="sp-name" required minLength={2} value={name} onChange={(e) => setName(e.target.value)} {...a11y} />}</Field>
        <div className="financial-2028-dialog__grid">
          <SelectField id="sp-tier" label="Categoria" value={tier} onChange={(v) => setTier(v as SponsorTierKey)} options={SPONSOR_TIER_LABELS} />
          <SelectField id="sp-status" label="Negociação" value={status} onChange={(v) => setStatus(v as NegotiationStatus)} options={NEGOTIATION_LABELS} />
        </div>
        <MoneyField id="sp-decl" label="Valor declarado (R$)" value={declared} onChange={setDeclared} hint="Informe quando houver um valor declarado; o campo pode ficar vazio." />
      </fieldset>
      <fieldset className="financial-2028-dialog__group">
        <legend>Projeção em dinheiro</legend>
        <div className="financial-2028-dialog__grid">
          <MoneyField id="sp-pf" label="Projetado · recurso livre (R$)" value={projFree} onChange={setProjFree} />
          <MoneyField id="sp-pr" label="Projetado · Rouanet (R$)" value={projRouanet} onChange={setProjRouanet} />
        </div>
      </fieldset>
      <fieldset className="financial-2028-dialog__group">
        <legend>Confirmação em dinheiro</legend>
        <p className="financial-2028-dialog__group-hint">Valores confirmados representam o compromisso, sem registrar entrada no caixa.</p>
        <div className="financial-2028-dialog__grid">
          <MoneyField id="sp-cf" label="Confirmado · recurso livre (R$)" value={confFree} onChange={setConfFree} />
          <MoneyField id="sp-cr" label="Confirmado · Rouanet (R$)" value={confRouanet} onChange={setConfRouanet} />
        </div>
      </fieldset>
      <fieldset className="financial-2028-dialog__group">
        <legend>Contrapartida em bens ou serviços</legend>
        <Field id="sp-kind" label="Descrição da contrapartida" hint="Descreva os bens ou serviços oferecidos. Esta contrapartida não entra nos valores em dinheiro.">
          {(a11y) => <Textarea id="sp-kind" aria-label="Contrapartida" value={inKind} onChange={(e) => setInKind(e.target.value)} {...a11y} />}
        </Field>
      </fieldset>
    </DialogForm>
  );
}
