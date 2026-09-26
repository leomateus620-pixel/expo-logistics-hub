import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatCents } from '../salesMoney';
import {
  buildDraftSchedule, draftsSumCents, isValidIsoDate, monthlyDueDates, redistribute,
} from '../salesInstallments';
import type { SalesFeesDraft, SalesPaymentDraft, SalesPaymentMethod } from '../salesTypes';
import { MAX_INSTALLMENTS, SALES_PAYMENT_METHODS, SALES_PAYMENT_METHOD_LABELS, feesTotalCents } from '../salesTypes';
import { MoneyInput } from './MoneyInput';

interface Props {
  value: SalesPaymentDraft;
  onChange: (value: SalesPaymentDraft) => void;
  fees: SalesFeesDraft;
  onFeesChange: (fees: SalesFeesDraft) => void;
  spacesCents: number;
  showErrors: boolean;
}

export function paymentErrors(value: SalesPaymentDraft, totalCents: number) {
  const n = value.installments.length;
  const diff = totalCents - draftsSumCents(value.installments);
  return {
    count: value.paymentMethod === 'BOLETO_PARCELADO'
      ? (n < 2 ? 'Informe a quantidade (mínimo 2) e toque em "Aplicar parcelas".' : n > MAX_INSTALLMENTS ? `O limite é de ${MAX_INSTALLMENTS} parcelas.` : null)
      : (n !== 1 ? 'Este método tem exatamente 1 parcela.' : null),
    dates: value.installments.every((item) => isValidIsoDate(item.dueDate)) ? null : 'Informe todos os vencimentos.',
    amounts: value.installments.every((item) => item.amountCents > 0) ? null : 'Cada parcela precisa ter valor maior que zero.',
    sum: diff === 0 ? null : diff > 0 ? `Faltam ${formatCents(diff)} para fechar o total.` : `As parcelas excedem o total em ${formatCents(-diff)}.`,
  };
}

const plural = (n: number) => `${n} parcela${n === 1 ? '' : 's'}`;

export function SalesPaymentForm({ value, onChange, fees, onFeesChange, spacesCents, showErrors }: Props) {
  const totalCents = spacesCents + feesTotalCents(fees);
  const errors = paymentErrors(value, totalCents);
  const sumCents = draftsSumCents(value.installments);
  const diff = totalCents - sumCents;
  const [confirmReplace, setConfirmReplace] = useState(false);
  const set = (patch: Partial<SalesPaymentDraft>) => onChange({ ...value, ...patch });

  const selectMethod = (method: SalesPaymentMethod) => {
    if (method === value.paymentMethod) return;
    if (method === 'BOLETO_PARCELADO') {
      const count = Math.max(2, Number(value.countInput) || 3);
      const dates = monthlyDueDates(count);
      onChange({ paymentMethod: method, countInput: String(count), installments: buildDraftSchedule(totalCents, dates), manualAmounts: false });
      return;
    }
    // Consolida em uma única parcela (sem sobras no estado nem no envio).
    const dueDate = value.installments[0]?.dueDate || monthlyDueDates(1)[0];
    onChange({ ...value, paymentMethod: method, installments: [{ dueDate, amountCents: totalCents }], manualAmounts: false });
  };

  const parsedCount = Math.floor(Number(value.countInput));
  const countValid = Number.isFinite(parsedCount) && parsedCount >= 2 && parsedCount <= MAX_INSTALLMENTS;

  const applyCount = () => {
    if (!countValid) return;
    if (value.manualAmounts && !confirmReplace) { setConfirmReplace(true); return; }
    setConfirmReplace(false);
    const existing = value.installments.map((item) => item.dueDate);
    const defaults = monthlyDueDates(parsedCount);
    const dates = defaults.map((date, index) => existing[index] ?? date);
    set({ installments: buildDraftSchedule(totalCents, dates), manualAmounts: false });
  };

  const updateItem = (index: number, patch: Partial<{ dueDate: string; amountCents: number }>) => {
    const installments = value.installments.map((item, position) => (position === index ? { ...item, ...patch } : item));
    set({ installments, manualAmounts: value.manualAmounts || patch.amountCents !== undefined });
  };

  const single = value.paymentMethod !== 'BOLETO_PARCELADO';

  return (
    <div className="sales-sheet-body">
      <section className="sales-block" aria-labelledby="sales-fees-title">
        <h3 id="sales-fees-title">Taxas da venda</h3>
        <p className="sales-block__hint">Cobradas uma única vez nesta venda, independente da quantidade de espaços.</p>
        <div className="sales-fees-grid">
          <div className="sales-field">
            <label htmlFor="sales-fee-admin">Taxa administrativa</label>
            <MoneyInput id="sales-fee-admin" valueCents={fees.adminCents} onChange={(adminCents) => onFeesChange({ ...fees, adminCents })} />
          </div>
          <div className="sales-field">
            <label htmlFor="sales-fee-ppci">PPCI</label>
            <MoneyInput id="sales-fee-ppci" valueCents={fees.ppciCents} onChange={(ppciCents) => onFeesChange({ ...fees, ppciCents })} />
          </div>
          <div className="sales-field">
            <label htmlFor="sales-fee-cleaning">Limpeza ou licença</label>
            <MoneyInput id="sales-fee-cleaning" valueCents={fees.cleaningCents} onChange={(cleaningCents) => onFeesChange({ ...fees, cleaningCents })} />
          </div>
        </div>
        <dl className="sales-totals">
          <div><dt>Espaços</dt><dd>{formatCents(spacesCents)}</dd></div>
          <div><dt>Taxas</dt><dd>{formatCents(feesTotalCents(fees))}</dd></div>
          <div className="is-strong"><dt>Total da venda</dt><dd>{formatCents(totalCents)}</dd></div>
        </dl>
      </section>

      <section className="sales-block" aria-labelledby="sales-method-title">
        <h3 id="sales-method-title">Forma de pagamento</h3>
        <div className="sales-method-row">
          <div className="sales-segmented" role="radiogroup" aria-label="Forma de pagamento">
            {SALES_PAYMENT_METHODS.map((method) => (
              <button
                key={method}
                type="button"
                role="radio"
                aria-checked={value.paymentMethod === method}
                className={value.paymentMethod === method ? 'is-active' : ''}
                onClick={() => selectMethod(method)}
              >
                {SALES_PAYMENT_METHOD_LABELS[method]}
              </button>
            ))}
          </div>
          {!single && (
            <div className="sales-count">
              <label htmlFor="sales-installment-count">Quantidade de parcelas</label>
              <div className="sales-count__row">
                <Input
                  id="sales-installment-count"
                  inputMode="numeric"
                  value={value.countInput}
                  onChange={(event) => { setConfirmReplace(false); set({ countInput: event.target.value.replace(/\D+/g, '').slice(0, 2) }); }}
                  onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); applyCount(); } }}
                />
                <Button type="button" variant="outline" className="h-10 rounded-lg" disabled={!countValid} onClick={applyCount}>
                  {confirmReplace ? 'Substituir ajustes' : 'Aplicar parcelas'}
                </Button>
              </div>
              {!countValid && value.countInput !== '' && <span className="sales-field__error">Use de 2 a {MAX_INSTALLMENTS} parcelas.</span>}
              {confirmReplace && <span className="sales-field__warn">Há valores editados à mão. Toque de novo para substituir.</span>}
            </div>
          )}
        </div>
      </section>

      <section className="sales-block" aria-labelledby="sales-schedule-title">
        <div className="sales-installments-header">
          <h3 id="sales-schedule-title">{single ? 'Vencimento' : 'Parcelas'}</h3>
          <span>{plural(value.installments.length)}</span>
        </div>
        <ol className="sales-installments" aria-label="Cronograma de parcelas">
          {value.installments.map((item, index) => (
            <li className="sales-installment-card" key={index}>
              <span className="sales-installment-card__num">Parcela {String(index + 1).padStart(2, '0')}</span>
              <div className="sales-field">
                <label htmlFor={`sales-due-${index}`}>Vencimento</label>
                <Input
                  id={`sales-due-${index}`}
                  type="date"
                  value={item.dueDate}
                  onChange={(event) => updateItem(index, { dueDate: event.target.value })}
                />
              </div>
              <div className="sales-field">
                <label htmlFor={`sales-amount-${index}`}>Valor</label>
                {single ? (
                  <output id={`sales-amount-${index}`} className="sales-installment-card__amount">{formatCents(item.amountCents)}</output>
                ) : (
                  <MoneyInput id={`sales-amount-${index}`} valueCents={item.amountCents} onChange={(amountCents) => updateItem(index, { amountCents })} />
                )}
              </div>
            </li>
          ))}
        </ol>
        <dl className="sales-totals">
          <div><dt>Total da venda</dt><dd>{formatCents(totalCents)}</dd></div>
          <div><dt>Soma das parcelas</dt><dd>{formatCents(sumCents)}</dd></div>
          {diff !== 0 && (
            <div className="is-alert"><dt>{diff > 0 ? 'Falta ajustar' : 'Excedente'}</dt><dd>{formatCents(Math.abs(diff))}</dd></div>
          )}
        </dl>
        {!single && diff !== 0 && (
          <Button type="button" variant="outline" className="h-10 rounded-lg" onClick={() => set({ installments: redistribute(totalCents, value.installments), manualAmounts: false })}>
            <RefreshCw className="h-4 w-4" />Redistribuir valores
          </Button>
        )}
        {showErrors && Object.values(errors).filter(Boolean).map((message) => (
          <span key={message} className="sales-field__error">{message}</span>
        ))}
      </section>
    </div>
  );
}
