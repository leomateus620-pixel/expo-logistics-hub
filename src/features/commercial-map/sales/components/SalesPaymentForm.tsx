import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatBrl } from '../../utils/lotPricing2028';
import type { SalesInstallment, SalesPaymentDraft, SalesPaymentMethod } from '../salesTypes';
import { SALES_PAYMENT_METHODS, SALES_PAYMENT_METHOD_LABELS } from '../salesTypes';

interface Props {
  value: SalesPaymentDraft;
  onChange: (value: SalesPaymentDraft) => void;
  installments: SalesInstallment[];
  showErrors: boolean;
}

export function paymentErrors(value: SalesPaymentDraft) {
  return {
    firstDueDate: value.firstDueDate ? null : 'Informe a data de vencimento.',
    installmentCount: value.paymentType === 'INSTALLMENTS' && value.installmentCount < 2
      ? 'Parcelado exige pelo menos 2 parcelas.'
      : null,
  };
}

function formatDueDate(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

export function SalesPaymentForm({ value, onChange, installments, showErrors }: Props) {
  const errors = paymentErrors(value);
  const set = (patch: Partial<SalesPaymentDraft>) => onChange({ ...value, ...patch });

  return (
    <div className="sales-sheet-body">
      <div className="sales-cart__stage" role="group" aria-label="Condição de pagamento">
        <button
          type="button"
          className={value.paymentType === 'CASH' ? 'is-active' : ''}
          onClick={() => set({ paymentType: 'CASH', installmentCount: 1 })}
        >
          À vista
        </button>
        <button
          type="button"
          className={value.paymentType === 'INSTALLMENTS' ? 'is-active' : ''}
          onClick={() => set({ paymentType: 'INSTALLMENTS', installmentCount: Math.max(2, value.installmentCount) })}
        >
          Parcelado
        </button>
      </div>

      <div className="sales-grid">
        <div className="sales-field">
          <label htmlFor="sales-method">Método</label>
          <Select value={value.paymentMethod} onValueChange={(method) => set({ paymentMethod: method as SalesPaymentMethod })}>
            <SelectTrigger id="sales-method"><SelectValue /></SelectTrigger>
            <SelectContent>
              {SALES_PAYMENT_METHODS.map((method) => (
                <SelectItem key={method} value={method}>{SALES_PAYMENT_METHOD_LABELS[method]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="sales-field">
          <label htmlFor="sales-first-due">{value.paymentType === 'CASH' ? 'Vencimento' : 'Primeiro vencimento'}</label>
          <Input
            id="sales-first-due"
            type="date"
            value={value.firstDueDate}
            onChange={(event) => set({ firstDueDate: event.target.value })}
          />
          {showErrors && errors.firstDueDate && <span className="sales-field__error">{errors.firstDueDate}</span>}
        </div>
      </div>

      {value.paymentType === 'INSTALLMENTS' && (
        <div className="sales-field">
          <label htmlFor="sales-installments">Quantidade de parcelas</label>
          <Input
            id="sales-installments"
            type="number"
            min={2}
            max={36}
            value={value.installmentCount}
            onChange={(event) => set({ installmentCount: Math.min(36, Math.max(1, Number(event.target.value) || 1)) })}
          />
          {showErrors && errors.installmentCount && <span className="sales-field__error">{errors.installmentCount}</span>}
        </div>
      )}

      {installments.length > 0 && (
        <div className="sales-review__list" aria-label="Cronograma de parcelas">
          {installments.map((item) => (
            <div key={item.number}>
              <span>{String(item.number).padStart(2, '0')} — {formatDueDate(item.dueDate)}</span>
              <strong>{formatBrl(item.amount)}</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
