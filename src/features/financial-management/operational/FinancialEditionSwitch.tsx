import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FinancialEditionCode } from './financialEditionSelection';
import '@/styles/financial-sidebar.css';

/** Seletor de edição sempre visível: histórico 2026 e operação 2028 nunca se misturam. */
export function FinancialEditionSwitch({ value, onChange }: { value: FinancialEditionCode; onChange: (code: FinancialEditionCode) => void }) {
  const options: Array<{ code: FinancialEditionCode; hint: string }> = [
    { code: '2026', hint: 'Histórico' },
    { code: '2028', hint: 'Operacional' },
  ];
  return (
    <div role="radiogroup" aria-label="Edição do Financeiro" className="financial-edition-switch">
      {options.map(({ code, hint }) => {
        const active = value === code;
        return (
          <button key={code} type="button" role="radio" aria-checked={active} tabIndex={active ? 0 : -1} onClick={() => onChange(code)}
            onKeyDown={(event) => {
              if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
              event.preventDefault();
              const next = event.key === 'Home' ? '2026' : event.key === 'End' ? '2028' : code === '2026' ? '2028' : '2026';
              onChange(next);
              const group = event.currentTarget.parentElement;
              (group?.querySelector(`[data-edition="${next}"]`) as HTMLButtonElement | null)?.focus();
            }} data-edition={code}
            className={cn('financial-edition-switch__option', active && 'is-active')}>
            <span className="financial-edition-switch__year">{code}</span>
            <span className="financial-edition-switch__hint">{hint}</span>
            {active && <Check className="financial-edition-switch__check" aria-hidden="true" />}
          </button>
        );
      })}
    </div>
  );
}
