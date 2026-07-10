import { ArrowRight, CalendarRange, CheckCircle2 } from 'lucide-react';

export function CronogramaPortalCard({ onAccess }: { onAccess: () => void }) {
  return (
    <button
      type="button"
      onClick={onAccess}
      className="cronograma-portal-card focus-ring group w-full text-left"
      aria-label="Acessar Cronograma e Eventos"
    >
      <span className="cronograma-portal-rail" aria-hidden="true">
        {[2026, 2027, 2028].map((year, index) => (
          <span key={year} className="cronograma-portal-year">
            <span className="cronograma-portal-node" data-final={index === 2} />
            <span>{year}</span>
          </span>
        ))}
      </span>

      <span className="relative grid gap-5 p-5 sm:p-6 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:items-center">
        <span className="cronograma-portal-icon" aria-hidden="true">
          <CalendarRange className="h-7 w-7" />
        </span>

        <span className="min-w-0">
          <span className="mb-2 flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-gold">Módulo próprio</span>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-100/82">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              Ativo
            </span>
          </span>
          <span className="block text-2xl font-black tracking-[-0.025em] text-white sm:text-3xl">
            Cronograma e Eventos
          </span>
          <span className="mt-2 block max-w-3xl text-sm leading-6 text-white/66">
            Central oficial de planejamento temporal, reuniões, eventos e atividades da Fenasoja 2028.
          </span>
        </span>

        <span className="inline-flex items-center gap-2 text-sm font-bold text-gold">
          Acessar central
          <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" aria-hidden="true" />
        </span>
      </span>
    </button>
  );
}
