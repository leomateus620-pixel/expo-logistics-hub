import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, ShieldCheck, Sparkles } from 'lucide-react';
import CommissionCard from '@/components/commissions/CommissionCard';
import { CronogramaPortalCard } from '@/components/cronograma-eventos/CronogramaPortalCard';
import {
  SELECTED_COMMISSION_STORAGE_KEY,
  getPublicCommissionModules,
} from '@/modules/commissions/commissionRegistry';
import bgImage from '@/assets/fenasoja-bg-2026.webp';
import bgMobile from '@/assets/fenasoja-bg-mobile.webp';
import logo from '@/assets/logofeira26.webp';

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

  const toggleSlug = (slug: string) => {
    setExpandedSlug((prev) => (prev === slug ? null : slug));
  };

  useEffect(() => {
    if (!expandedSlug) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpandedSlug(null);
    };
    const onClick = (e: MouseEvent) => {
      if (!gridRef.current) return;
      if (!gridRef.current.contains(e.target as Node)) setExpandedSlug(null);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onClick);
    };
  }, [expandedSlug]);

  return (
    <div className="min-h-screen overflow-hidden bg-[hsl(135_48%_10%)] text-white">
      <div className="fixed inset-0 hidden bg-cover bg-center bg-no-repeat opacity-75 md:block" style={{ backgroundImage: `url(${bgImage})` }} aria-hidden="true" />
      <div className="fixed inset-0 bg-cover bg-center bg-no-repeat opacity-75 md:hidden" style={{ backgroundImage: `url(${bgMobile})` }} aria-hidden="true" />
      <div className="fixed inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(212,164,50,0.20),transparent_28%),linear-gradient(135deg,rgba(4,31,17,0.92),rgba(7,44,24,0.82)_42%,rgba(3,21,12,0.96))]" aria-hidden="true" />
      <div className="fixed inset-0 command-grid-bg opacity-60" aria-hidden="true" />

      <main className="relative z-10 mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-5 sm:px-6 lg:px-8">
        <header className="grid gap-6 pb-7 pt-2 lg:grid-cols-[1fr_360px] lg:items-end lg:pb-10">
          <div className="animate-soft-rise flex max-w-4xl flex-col gap-6">
            <img src={logo} alt="Fenasoja 2026" className="h-auto w-36 object-contain drop-shadow-2xl sm:w-48" />
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-gold/25 bg-white/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.22em] text-gold backdrop-blur-xl">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                Sistema Integrado de Gestão Operacional
              </div>
              <h1 className="mt-5 max-w-4xl text-balance text-4xl font-black leading-[0.98] tracking-[-0.04em] text-white drop-shadow-2xl sm:text-5xl lg:text-7xl">
                Portal das Comissões Fenasoja
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-white/75 sm:text-lg">
                Acesse a central temporal da Fenasoja ou escolha uma comissão para entrar em seu ambiente operacional.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={accessAdmin}
            className="glass-panel interactive-lift group flex min-h-36 flex-col justify-between rounded-3xl p-5 text-left focus-ring lg:min-h-48"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gold/20 text-gold ring-1 ring-gold/30">
                <ShieldCheck className="h-6 w-6" aria-hidden="true" />
              </div>
              <span className="rounded-full border border-gold/25 bg-gold/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-gold">
                Acesso superior
              </span>
            </div>
            <div>
              <h2 className="text-2xl font-black tracking-tight text-white">Administrador</h2>
              <p className="mt-2 text-sm leading-6 text-white/70">Central institucional para visão consolidada, comissões e governança do sistema.</p>
              <span className="mt-4 inline-flex items-center text-sm font-bold text-gold">
                Entrar como admin
                <ArrowRight className="ml-2 h-4 w-4 transition group-hover:translate-x-1" aria-hidden="true" />
              </span>
            </div>
          </button>
        </header>

        <section aria-label="Acesso direto aos módulos institucionais" className="mb-6">
          <CronogramaPortalCard onAccess={accessCronograma} />
        </section>

        <section
          ref={gridRef}
          aria-label="Comissões disponíveis"
          className="grid flex-1 grid-cols-1 items-start gap-3 pb-8 md:grid-cols-2 xl:grid-cols-3"
        >
          {modules.map((module, index) => (
            <CommissionCard
              key={module.slug}
              module={module}
              index={index}
              expanded={expandedSlug === module.slug}
              onToggle={() => toggleSlug(module.slug)}
              onAccess={() => accessModule(module.slug)}
            />
          ))}
        </section>
      </main>
    </div>
  );
}
