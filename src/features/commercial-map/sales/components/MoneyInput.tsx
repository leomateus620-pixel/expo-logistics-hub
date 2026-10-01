import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { formatCentsPlain, parseMoneyInputToCents, parseReaisInputToCents } from '../salesMoney';

interface Props {
  id: string;
  valueCents: number;
  onChange: (cents: number) => void;
  ariaLabel?: string;
  mode?: 'cents' | 'reais';
}

/** Campo monetário BR: taxas digitadas em reais; parcelas conservam a máscara em centavos. */
export function MoneyInput({ id, valueCents, onChange, ariaLabel, mode = 'cents' }: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  const reais = mode === 'reais';
  return (
    <div className="sales-money">
      <span aria-hidden="true">R$</span>
      <Input
        id={id}
        aria-label={ariaLabel}
        inputMode={reais ? 'decimal' : 'numeric'}
        autoComplete="off"
        value={reais && draft !== null ? draft : formatCentsPlain(valueCents)}
        onChange={(event) => {
          if (reais) setDraft(event.target.value);
          onChange(reais ? parseReaisInputToCents(event.target.value) : parseMoneyInputToCents(event.target.value));
        }}
        onFocus={(event) => {
          if (reais) setDraft(formatCentsPlain(valueCents));
          event.currentTarget.select();
        }}
        onBlur={() => { if (reais) setDraft(null); }}
      />
    </div>
  );
}
