import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { SalesBuyerDraft } from '../salesTypes';
import { formatDocument, formatPhoneBr, isValidDocument, isValidEmail, isValidPhoneBr } from '../salesValidation';

interface Props {
  value: SalesBuyerDraft;
  onChange: (value: SalesBuyerDraft) => void;
  showErrors: boolean;
}

export function buyerErrors(value: SalesBuyerDraft) {
  return {
    buyerName: value.buyerName.trim().length < 3 ? 'Informe o nome ou razão social.' : null,
    documentNumber: isValidDocument(value.documentNumber) ? null : 'CPF ou CNPJ inválido.',
    phone: isValidPhoneBr(value.phone) ? null : 'Informe um celular com DDD.',
    email: isValidEmail(value.email) ? null : 'E-mail inválido.',
  };
}

export function SalesBuyerForm({ value, onChange, showErrors }: Props) {
  const errors = buyerErrors(value);
  const set = (patch: Partial<SalesBuyerDraft>) => onChange({ ...value, ...patch });

  return (
    <div className="sales-sheet-body">
      <div className="sales-field">
        <label htmlFor="sales-buyer-name">Nome / Razão social</label>
        <Input
          id="sales-buyer-name"
          value={value.buyerName}
          onChange={(event) => set({ buyerName: event.target.value.toUpperCase() })}
          placeholder="EXPOSITOR OU EMPRESA"
          autoComplete="off"
        />
        {showErrors && errors.buyerName && <span className="sales-field__error">{errors.buyerName}</span>}
      </div>

      <div className="sales-grid">
        <div className="sales-field">
          <label htmlFor="sales-buyer-doc">CPF ou CNPJ</label>
          <Input
            id="sales-buyer-doc"
            value={value.documentNumber}
            onChange={(event) => set({ documentNumber: formatDocument(event.target.value) })}
            inputMode="numeric"
            placeholder="000.000.000-00"
          />
          {showErrors && errors.documentNumber && <span className="sales-field__error">{errors.documentNumber}</span>}
        </div>
        <div className="sales-field">
          <label htmlFor="sales-buyer-phone">Celular</label>
          <Input
            id="sales-buyer-phone"
            value={value.phone}
            onChange={(event) => set({ phone: formatPhoneBr(event.target.value) })}
            inputMode="tel"
            placeholder="(55) 99999-9999"
          />
          {showErrors && errors.phone && <span className="sales-field__error">{errors.phone}</span>}
        </div>
      </div>

      <div className="sales-field">
        <label htmlFor="sales-buyer-email">E-mail (opcional)</label>
        <Input
          id="sales-buyer-email"
          value={value.email}
          onChange={(event) => set({ email: event.target.value })}
          inputMode="email"
          placeholder="contato@empresa.com.br"
        />
        {showErrors && errors.email && <span className="sales-field__error">{errors.email}</span>}
      </div>

      <div className="sales-field">
        <label htmlFor="sales-buyer-notes">Observações (opcional)</label>
        <Textarea
          id="sales-buyer-notes"
          rows={2}
          value={value.notes}
          onChange={(event) => set({ notes: event.target.value })}
        />
      </div>
    </div>
  );
}
