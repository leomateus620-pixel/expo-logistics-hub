import { useNavigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import CommissionCard from '@/components/commissions/CommissionCard';
import {
  SELECTED_COMMISSION_STORAGE_KEY,
  adminPortalCard,
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

  const accessModule = (slug: string) => {
    saveSelectedModule(slug);
    navigate(`/login/${slug}`);
  };

  const accessAdmin = () => {
    saveSelectedModule('admin');
    navigate('/login/admin');
  };

  return (
    <div className="min-h-screen overflow-hidden bg-[hsl(135_40%_14%)] text-white">
      <div
        className="fixed inset-0 hidden bg-cover bg-center bg-no-repeat opacity-80 md:block"
        style={{ backgroundImage: `url(${bgImage})` }}
        aria-hidden="true"
      />
      <div
        className="fixed inset-0 bg-cover bg-center bg-no-repeat opacity-80 md:hidden"
        style={{ backgroundImage: `url(${bgMobile})` }}
        aria-hidden="true"
      />
      <div className="fixed inset-0 bg-[linear-gradient(180deg,rgba(9,42,22,0.86),rgba(9,42,22,0.94))]" aria-hidden="true" />

      <main className="relative z-10 mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-5 pb-6 pt-2 md:flex-row md:items-end md:justify-between md:pb-8">
          <div className="flex max-w-3xl flex-col gap-5">
            <img src={logo} alt="Fenasoja 2026" className="h-auto w-36 object-contain drop-shadow-xl sm:w-44" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gold">
                Sistema Integrado de Gestao Operacional
              </p>
              <h1 className="mt-3 max-w-3xl text-3xl font-black leading-tight tracking-tight text-white sm:text-4xl lg:text-5xl">
                Fenasoja
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-white/72 sm:text-base">
                Selecione a comissao para acessar o ambiente operacional correspondente.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={accessAdmin}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-gold/30 bg-white/10 px-4 text-sm font-semibold text-gold shadow-lg backdrop-blur-xl transition hover:bg-gold/15 focus-ring md:min-w-44"
          >
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            Administrador
          </button>
        </header>

        <section className="grid flex-1 grid-cols-1 gap-4 pb-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {modules.map((module) => (
            <CommissionCard
              key={module.slug}
              module={module}
              onAccess={() => accessModule(module.slug)}
            />
          ))}
          <CommissionCard
            module={{
              ...adminPortalCard,
              accentClass: 'from-gold/25 via-emerald-500/10 to-transparent',
              sensitive: true,
            }}
            actionLabel="Entrar como admin"
            onAccess={accessAdmin}
          />
        </section>
      </main>
    </div>
  );
}
