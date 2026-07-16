import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import CommissionCard from '@/components/commissions/CommissionCard';
import { FenasojaBrand } from '@/components/brand/FenasojaBrand';
import { CronogramaPortalCard } from '@/components/cronograma-eventos/CronogramaPortalCard';
import {
  SELECTED_COMMISSION_STORAGE_KEY,
  getPublicCommissionModules,
} from '@/modules/commissions/commissionRegistry';

function saveSelectedModule(slug: string) {
  try {
    localStorage.setItem(SELECTED_COMMISSION_STORAGE_KEY, slug);
  } catch {
    return;
  }
}

export default function CommissionPortalPage() {
  const navigate = useNavigate();
  const modules = getPublicCommissionModules();
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);
  const gridRef = useRef<HTMLElement>(null);

  const accessModule = (slug: string) => {
    saveSelectedModule(slug);
    navigate(`/login/${slug}`);
  };

  const accessCronograma = () => {
    saveSelectedModule('cronograma-eventos');
    navigate('/login/cronograma-eventos');
  };

  const accessAdmin = () => {
    saveSelectedModule('admin');
    navigate('/login/admin');
  };

  useEffect(() => {
    if (!expandedSlug) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setExpandedSlug(null);
    };
    const closeOutside = (event: MouseEvent) => {
      if (gridRef.current && !gridRef.current.contains(event.target as Node)) {
        setExpandedSlug(null);
      }
    };
    window.addEventListener('keydown', closeOnEscape);
    window.addEventListener('mousedown', closeOutside);
    return () => {
      window.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('mousedown', closeOutside);
    };
  }, [expandedSlug]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-[oklch(var(--brand-navy-900))] text-[oklch(var(--brand-soft-white))]">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_82%_4%,oklch(var(--brand-indigo-500)/0.72),transparent_38%),radial-gradient(circle_at_12%_105%,oklch(var(--brand-orange-500)/0.22),transparent_34%)]"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -right-24 top-28 h-80 w-80 rotate-12 rounded-[28%] border border-[oklch(var(--brand-orange-500)/0.14)]"
        aria-hidden="true"
      />

      <main className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
        <header className="flex items-center justify-between gap-4 border-b border-white/10 pb-4">
          <FenasojaBrand subtitle="Sistema integrado de gestão" tone="dark" />
          <button
            type="button"
            onClick={accessAdmin}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/16 px-3 text-sm font-semibold text-white transition-colors duration-150 hover:border-[oklch(var(--brand-orange-500)/0.65)] hover:bg-white/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(var(--brand-orange-500))]"
          >
            <ShieldCheck className="h-4 w-4 text-[oklch(var(--brand-gold-400))]" aria-hidden="true" />
            <span className="hidden sm:inline">Administrador</span>
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        <section className="grid gap-6 py-8 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-end lg:py-12">
          <div className="max-w-3xl">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[oklch(var(--brand-gold-400))]">
              Portal das comissões · edição 2028
            </p>
            <h1 className="mt-3 text-balance text-4xl font-black leading-[1.02] tracking-[-0.04em] sm:text-5xl lg:text-6xl">
              Operação conectada para construir a próxima Fenasoja.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-white/68 sm:text-base sm:leading-7">
              Escolha uma frente de trabalho ou acesse o cronograma central. Cada módulo mantém seu contexto, seus dados e suas permissões.
            </p>
          </div>

          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-white/12 bg-white/12">
            <div className="bg-[oklch(var(--brand-navy-900))] p-4">
              <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/50">Comissões</dt>
              <dd className="mt-1 text-3xl font-black text-[oklch(var(--brand-gold-400))]">{modules.length}</dd>
            </div>
            <div className="bg-[oklch(var(--brand-navy-900))] p-4">
              <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/50">Ciclo</dt>
              <dd className="mt-1 text-3xl font-black text-white">2028</dd>
            </div>
          </dl>
        </section>

        <section aria-label="Acesso direto ao cronograma" className="mb-8">
          <CronogramaPortalCard onAccess={accessCronograma} />
        </section>

        <section ref={gridRef} aria-labelledby="commission-list-title" className="pb-10">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 id="commission-list-title" className="text-lg font-bold text-white">Frentes de trabalho</h2>
              <p className="mt-1 text-sm text-white/56">Expanda uma comissão para consultar o escopo e acessar o ambiente.</p>
            </div>
            <span className="text-xs font-semibold text-white/45">Acesso conforme perfil</span>
          </div>

          <div className="grid grid-cols-1 items-start gap-2.5 lg:grid-cols-2">
            {modules.map((module) => (
              <CommissionCard
                key={module.slug}
                module={module}
                expanded={expandedSlug === module.slug}
                onToggle={() => setExpandedSlug((current) => (current === module.slug ? null : module.slug))}
                onAccess={() => accessModule(module.slug)}
              />
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
