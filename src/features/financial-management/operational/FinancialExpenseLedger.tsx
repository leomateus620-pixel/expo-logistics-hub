import { CheckCircle2, ChevronDown, History, Pencil, Undo2, XCircle } from 'lucide-react';
import { formatBRL } from '../utils/financialFormatters';
import { deviation, EXPENSE_STATUS_LABELS, type ExpensePage, type ExpenseStatus, type FinancialExpense } from './financialExpensesApi';
import { EXPENSE_PAGE_SIZE } from './useFinancialExpenses';
import type { FinancialExpenseCapabilities } from './useFinancialExpenseCapabilities';
import { canTransitionExpense } from './financialExpenseActions';
import { FinancialComparisonHelp as Help } from './FinancialComparisonPrimitives';

const date = (value: string | null) => value ? value.slice(0, 10).split('-').reverse().join('/') : 'Não informado';
function Money({ value }: { value: number | null }) { return <span className="f28-expense-money">{value == null ? 'Não informado' : formatBRL(value / 100)}</span>; }
function Deviation({ expense }: { expense: FinancialExpense }) {
  const d = deviation(expense.planned_cents, expense.status === 'realizada' ? expense.committed_cents : null);
  return d.state === 'sem_previsao' ? <span className="f28-expense-no-plan">Sem previsão</span> : d.state === 'sem_realizado' ? <span className="f28-expense-muted">Não realizada</span> : <span data-deviation-positive={d.cents! > 0 || undefined}><Money value={d.cents} /><small>{d.pct! > 0 ? '+' : ''}{d.pct!.toLocaleString('pt-BR')}%</small></span>;
}
interface Props {
  data: ExpensePage; page: number; onPage: (page: number) => void; capabilities: FinancialExpenseCapabilities; readOnly: boolean;
  onDetail: (id: string) => void; onEdit: (expense: FinancialExpense) => void; onTransition: (expense: FinancialExpense, to: ExpenseStatus) => void;
}
export function FinancialExpenseLedger({ data, page, onPage, capabilities, readOnly, onDetail, onEdit, onTransition }: Props) {
  const edit = capabilities.canEdit && !readOnly;
  const canTransition = (expense: FinancialExpense, to: ExpenseStatus) => !readOnly && canTransitionExpense(expense, to, capabilities);
  const actions = (expense: FinancialExpense) => <div className="f28-expense-record-actions">
    <button type="button" onClick={() => onDetail(expense.id)} aria-label={`Detalhes e histórico de ${expense.title}`}><History aria-hidden="true" /><span>Detalhes</span></button>
    {edit && expense.status !== 'cancelada' && <button type="button" onClick={() => onEdit(expense)} aria-label={`Editar ${expense.title}`}><Pencil aria-hidden="true" /><span>Editar</span></button>}
    {canTransition(expense, 'realizada') && <button type="button" onClick={() => onTransition(expense, 'realizada')} aria-label={`Realizar ${expense.title}`}><CheckCircle2 aria-hidden="true" /><span>Realizar</span></button>}
    {canTransition(expense, 'prevista') && <button type="button" onClick={() => onTransition(expense, 'prevista')} aria-label={`Voltar ${expense.title} para prevista`}><Undo2 aria-hidden="true" /><span>Reverter</span></button>}
    {canTransition(expense, 'cancelada') && <button type="button" onClick={() => onTransition(expense, 'cancelada')} aria-label={`Cancelar ${expense.title}`}><XCircle aria-hidden="true" /><span>Cancelar</span></button>}
  </div>;
  const status = (expense: FinancialExpense) => <span className="f28-expense-status" data-status={expense.status}>{EXPENSE_STATUS_LABELS[expense.status]}</span>;
  const details = (expense: FinancialExpense) => <div className="f28-expense-record-details"><dl>
    <div><dt>Pago líquido</dt><dd><Money value={expense.paid_cents} /></dd></div><div><dt>Saldo a pagar</dt><dd><Money value={expense.status === 'realizada' ? expense.open_cents : null} /></dd></div>
    <div><dt>Previsão</dt><dd>{date(expense.planned_on)}</dd></div><div><dt>Realização</dt><dd>{date(expense.committed_on)}</dd></div><div><dt>Vencimento</dt><dd>{date(expense.due_date)}</dd></div><div><dt>Favorecido</dt><dd>{expense.payee_reference_name || expense.payee_name || 'Não informado'}</dd></div>
  </dl>{expense.description && <p>{expense.description}</p>}{expense.settlement_inconsistent && <p className="f28-expense-warning" role="alert">Liquidação inconsistente. Consulte o histórico de pagamentos.</p>}<div className="f28-expense-record-action-group">{actions(expense)}{expense.status === 'realizada' && expense.paid_cents > 0 && <Help label="Como cancelar ou reverter uma despesa com pagamentos"><p>Para cancelar ou reverter, estorne os pagamentos registrados.</p></Help>}</div></div>;
  return <div className="f28-expense-ledger">
    <div className="f28-expense-table"><table><caption className="sr-only">Despesas projetadas e realizadas no mesmo registro</caption><thead><tr><th>Despesa / classificação</th><th>Situação</th><th>Projetado</th><th>Realizado</th><th>Desvio</th><th><span className="sr-only">Detalhes</span></th></tr></thead><tbody>{data.items.map(expense => <tr key={expense.id} data-status={expense.status}>
      <td><strong>{expense.title}</strong><span className="f28-expense-classification">{expense.category_name || 'Sem categoria'} · {expense.commission_name || 'Sem comissão'}</span></td><td>{status(expense)}</td><td><Money value={expense.planned_cents} /></td><td><Money value={expense.committed_cents} /></td><td><Deviation expense={expense} /></td><td><button type="button" className="f28-expense-control" aria-label={`Detalhes e histórico de ${expense.title}`} onClick={() => onDetail(expense.id)}><History aria-hidden="true" /><span>Detalhes</span></button></td>
    </tr>)}</tbody></table></div>
    <div className="f28-expense-records">{data.items.map(expense => <article key={expense.id} className="f28-expense-record"><header><h3>{expense.title}</h3>{status(expense)}</header><p className="f28-expense-classification">{expense.category_name || 'Sem categoria'} · {expense.commission_name || 'Sem comissão'}</p><dl className="f28-expense-record-values"><div><dt>Projetado</dt><dd><Money value={expense.planned_cents} /></dd></div><div><dt>Realizado</dt><dd><Money value={expense.committed_cents} /></dd></div><div><dt>Desvio</dt><dd><Deviation expense={expense} /></dd></div></dl><details><summary>Pagamento, datas e ações<ChevronDown aria-hidden="true" /></summary>{details(expense)}</details></article>)}</div>
    <nav className="f28-expense-pagination" aria-label="Paginação de despesas"><span>{data.total} registros · Página {page + 1} de {Math.max(1, Math.ceil(data.total / EXPENSE_PAGE_SIZE))}</span><div><button type="button" disabled={page === 0} onClick={() => onPage(page - 1)}>Anterior</button><button type="button" disabled={(page + 1) * EXPENSE_PAGE_SIZE >= data.total} onClick={() => onPage(page + 1)}>Próxima</button></div></nav>
  </div>;
}
