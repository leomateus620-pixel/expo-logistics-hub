import { ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { LogOut, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { FenasojaBrand } from '@/components/brand/FenasojaBrand';

interface AdminFrameProps {
  title: string;
  description: string;
  children: ReactNode;
}

export default function AdminFrame({ title, description, children }: AdminFrameProps) {
  const { signOut } = useAuth();

  const navItems = [
    { to: '/admin', label: 'Comissões' },
    { to: '/admin/geral', label: 'Visão geral' },
    { to: '/portal', label: 'Portal' },
  ];

  return (
    <div className="min-h-screen bg-background">
      <a href="#main-content" className="skip-to-content">
        Pular para conteúdo
      </a>
      <header className="sticky top-0 z-30 border-b border-border bg-card">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between md:px-6">
          <Link to="/admin" className="flex min-w-0 items-center gap-3 rounded-lg focus-ring">
            <FenasojaBrand compact markOnly tone="light" />
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">
                Administrador
              </p>
              <h1 className="truncate text-base font-black text-foreground">Sistema Integrado Fenasoja 2028</h1>
            </div>
          </Link>

          <nav className="flex flex-wrap items-center gap-2" aria-label="Admin">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/admin'}
                className={({ isActive }) =>
                  cn(
                    'rounded-lg px-3 py-2 text-sm font-semibold transition-colors duration-150 focus-ring',
                    isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
            <button
              type="button"
              onClick={signOut}
              className="rounded-lg px-3 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-600 focus-ring"
            >
              <LogOut className="mr-1 inline h-4 w-4 align-text-bottom" aria-hidden="true" />
              Sair
            </button>
          </nav>
        </div>
      </header>

      <main id="main-content" className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-6 md:px-6">
        <section className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-xs)] md:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                Área administrativa
              </p>
              <h2 className="mt-3 text-2xl font-black tracking-tight text-foreground md:text-3xl">{title}</h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
            </div>
          </div>
        </section>
        {children}
      </main>
    </div>
  );
}
