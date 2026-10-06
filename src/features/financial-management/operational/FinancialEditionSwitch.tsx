import { History, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FinancialEditionCode } from './financialEditionSelection';

/** Seletor de edição sempre visível: histórico 2026 e operação 2028 nunca se misturam. */
export function FinancialEditionSwitch({ value, onChange }: { value: FinancialEditionCode; onChange: (code: FinancialEditionCode) => void }) {
  const options: Array<{ code: FinancialEditionCode; label: string; hint: string; Icon: typeof History }> = [
    { code: '2026', label: 'Fenasoja 2026 · Histórico', hint: 'Somente leitura', Icon: History },
    { code: '2028', label: 'Fenasoja 2028', hint: 'Operação: cadastrar e acompanhar', Icon: Sparkles },
  ];
  return (
    <div role="radiogroup" aria-label="Edição do Financeiro" className="mb-4 grid gap-2 sm:grid-cols-2">
      {options.map(({ code, label, hint, Icon }) => {
        const active = value === code;
        return (
          <button key={code} type="button" role="radio" aria-checked={active} onClick={() => onChange(code)}
            className={cn('flex items-center gap-3 rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground hover:bg-accent')}>
            <Icon className="h-5 w-5 shrink-0" aria-hidden />
            <span><span className="block font-semibold">{label}</span><span className={cn('block text-xs', active ? 'text-primary-foreground/80' : 'text-muted-foreground')}>{hint}</span></span>
          </button>
        );
      })}
    </div>
  );
}
