import { Input } from '@/components/ui/input';
import { formatCentsPlain, parseMoneyInputToCents } from '../salesMoney';

interface Props {
  id: string;
  valueCents: number;
  onChange: (cents: number) => void;
  ariaLabel?: string;
}

/** Campo monetário BR: digitação em centavos, nunca negativo. */
export function MoneyInput({ id, valueCents, onChange, ariaLabel }: Props) {
  return (
    <div className="sales-money">
      <span aria-hidden="true">R$</span>
      <Input
        id={id}
        aria-label={ariaLabel}
        inputMode="numeric"
        autoComplete="off"
        value={formatCentsPlain(valueCents)}
        onChange={(event) => onChange(parseMoneyInputToCents(event.target.value))}
        onFocus={(event) => event.currentTarget.select()}
      />
    </div>
  );
}
