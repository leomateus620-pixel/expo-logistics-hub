import { CalendarPlus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatBrl } from '../../utils/lotPricing2028';
import type { SalesInstallment, SalesPaymentDraft, SalesPaymentMethod } from '../salesTypes';
import { SALES_PAYMENT_METHODS, SALES_PAYMENT_METHOD_LABELS } from '../salesTypes';
import { addMonthsIso } from '../salesInstallments';

interface Props {
  value: SalesPaymentDraft;
  onChange: (value: SalesPaymentDraft) => void;
  installments: SalesInstallment[];
  showErrors: boolean;
}

export function paymentErrors(value: SalesPaymentDraft) {
  return {
    firstDueDate: value.dueDates.every(Boolean) ? null : 'Informe todos os vencimentos.',
    installmentCount: value.paymentType === 'INSTALLMENTS' && value.installmentCount < 2
      ? 'Parcelado exige pelo menos 2 parcelas.'
      : value.dueDates.length > 36 ? 'O limite é de 36 vencimentos.'
      : null,
  };
}

export function SalesPaymentForm({ value, onChange, installments, showErrors }: Props) {
  const errors = paymentErrors(value);
  const set = (patch: Partial<SalesPaymentDraft>) => onChange({ ...value, ...patch });
  const setDueDates = (dueDates: string[]) => set({
    dueDates,
    installmentCount: dueDates.length,
    firstDueDate: dueDates[0] ?? '',
  });
  const setPaymentType = (paymentType: SalesPaymentDraft['paymentType']) => {
    if (paymentType === 'CASH') {
      set({ paymentType, dueDates: [value.dueDates[0] || value.firstDueDate], installmentCount: 1 });
      return;
    }
    const first = value.dueDates[0] || value.firstDueDate;
    set({ paymentType, dueDates: value.dueDates.length >= 2 ? value.dueDates : [first, addMonthsIso(first, 1)], installmentCount: Math.max(2, value.dueDates.length) });
  };
  const addDueDate = () => {
    if (value.dueDates.length >= 36) return;
    const previous = value.dueDates.at(-1) || value.firstDueDate;
    setDueDates([...value.dueDates, addMonthsIso(previous, 1)]);
  };

  return (
    <div className="sales-sheet-body">
      <div className="sales-cart__stage" role="group" aria-label="Condição de pagamento">
        <button
          type="button"
          className={value.paymentType === 'CASH' ? 'is-active' : ''}
          onClick={() => setPaymentType('CASH')}
        >
          À vista
        </button>
        <button
          type="button"
          className={value.paymentType === 'INSTALLMENTS' ? 'is-active' : ''}
          onClick={() => setPaymentType('INSTALLMENTS')}
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
      </div>

      <div className="sales-installments-header">
        <div><strong>{value.paymentType === 'CASH' ? 'Vencimento' : 'Vencimentos'}</strong><span>{installments.length} de 36</span></div>
        {value.paymentType === 'INSTALLMENTS' && (
          <Button type="button" size="sm" variant="outline" onClick={addDueDate} disabled={value.dueDates.length >= 36}>
            <CalendarPlus className="h-4 w-4" />Adicionar vencimento
          </Button>
        )}
      </div>
      <div className="sales-installments" aria-label="Cronograma de parcelas">
        {installments.map((item, index) => (
          <div className="sales-installment-row" key={item.number}>
            <span>{String(item.number).padStart(2, '0')}</span>
            <Input
              aria-label={`Vencimento ${item.number}`}
              type="date"
              value={value.dueDates[index] ?? ''}
              onChange={(event) => setDueDates(value.dueDates.map((date, position) => position === index ? event.target.value : date))}
            />
            <strong>{formatBrl(item.amount)}</strong>
            {value.paymentType === 'INSTALLMENTS' && index > 0 && (
              <Button type="button" size="icon" variant="ghost" aria-label={`Remover vencimento ${item.number}`} onClick={() => setDueDates(value.dueDates.filter((_, position) => position !== index))}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        ))}
      </div>
      {showErrors && errors.firstDueDate && <span className="sales-field__error">{errors.firstDueDate}</span>}
      {showErrors && errors.installmentCount && <span className="sales-field__error">{errors.installmentCount}</span>}
    </div>
  );
}
