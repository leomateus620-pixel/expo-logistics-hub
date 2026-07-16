import { ArrowRight, CalendarRange, CheckCircle2 } from 'lucide-react';

export function CronogramaPortalCard({ onAccess }: { onAccess: () => void }) {
  return (
    <button
      type="button"
      onClick={onAccess}
      className="cronograma-portal-card group w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-[oklch(var(--brand-orange-500))] focus-visible:ring-offset-2 focus-visible:ring-offset-[oklch(var(--brand-navy-900))]"
      aria-label="Acessar Cronograma e Eventos"
    >
      <span className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:items-center">
        <span className="cronograma-portal-icon flex h-12 w-12 items-center justify-center rounded-xl text-white" aria-hidden="true">
          <CalendarRange className="h-7 w-7" />
        </span>

        <span className="min-w-0">
          <span className="mb-2 flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[oklch(var(--brand-gold-400))]">Planejamento central</span>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-white/68">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              Ativo
            </span>
          </span>
          <span className="block text-xl font-black tracking-[-0.025em] text-white sm:text-2xl">
            Cronograma e Eventos
          </span>
          <span className="mt-1.5 block max-w-3xl text-sm leading-6 text-white/62">
            Reuniões, eventos, atividades e decisões do ciclo oficial 2026—2028.
          </span>
          <span className="mt-3 flex items-center gap-2" aria-label="Ciclo 2026 a 2028">
            {[2026, 2027, 2028].map((year, index) => (
              <span key={year} className="contents">
                <span className={index === 2 ? 'text-xs font-black text-[oklch(var(--brand-orange-500))]' : 'text-xs font-bold text-white/48'}>{year}</span>
                {index < 2 && <span className="h-px w-6 bg-white/20" aria-hidden="true" />}
              </span>
            ))}
          </span>
        </span>

        <span className="inline-flex items-center gap-2 text-sm font-bold text-[oklch(var(--brand-gold-400))]">
          Acessar central
          <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" aria-hidden="true" />
        </span>
      </span>
    </button>
  );
}
