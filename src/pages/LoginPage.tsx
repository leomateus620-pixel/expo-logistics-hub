import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarRange, Loader2, LockKeyhole, LogIn, ShieldCheck } from 'lucide-react';
import { FenasojaBrand } from '@/components/brand/FenasojaBrand';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import {
  SELECTED_COMMISSION_STORAGE_KEY,
  getCommissionModule,
  getModuleRoute,
} from '@/modules/commissions/commissionRegistry';

interface LoginPageProps {
  returnTo?: string;
}

function getStoredModuleSlug() {
  try {
    return localStorage.getItem(SELECTED_COMMISSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

function getModuleSlugFromPath(path?: string) {
  return path?.match(/^\/comissoes\/([^/?#]+)/)?.[1] ?? null;
}

export default function LoginPage({ returnTo }: LoginPageProps) {
  const { signIn, user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { moduleSlug } = useParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const isAdminLogin = location.pathname === '/login/admin' || moduleSlug === 'admin' || returnTo?.startsWith('/admin');
  const selectedSlug = isAdminLogin ? 'admin' : moduleSlug || getModuleSlugFromPath(returnTo) || getStoredModuleSlug() || 'logistica';
  const isCronogramaLogin = selectedSlug === 'cronograma-eventos' || returnTo === '/cronograma-eventos';
  const isCommercialMapLogin = selectedSlug === 'mapa-comercial' || returnTo?.startsWith('/mapa-comercial');
  const selectedModule = getCommissionModule(selectedSlug);
  const contextName = isAdminLogin
    ? 'Administrador'
    : isCronogramaLogin
      ? 'Cronograma e Eventos'
      : isCommercialMapLogin
        ? 'Mapa Comercial'
        : selectedModule
          ? `Comissão de ${selectedModule.name}`
          : 'Comissão de Logística';
  const heroTitle = isCommercialMapLogin
    ? 'Gestão territorial e comercial do parque'
    : isCronogramaLogin
      ? 'Planejamento temporal da Fenasoja 2028'
      : 'Ambiente seguro das comissões';
  const heroDescription = isCronogramaLogin
    ? 'Consulte calendário, linha do tempo, reuniões centrais e decisões do ciclo oficial 2026—2028.'
    : isCommercialMapLogin
      ? 'Visualize estruturas, disponibilidade, reservas, vendas e contratos na base cartográfica controlada.'
      : 'Continue no módulo selecionado com as mesmas permissões e o mesmo contexto operacional.';

  const resolveTarget = () => {
    if (returnTo && returnTo !== '/' && !returnTo.startsWith('/login')) return returnTo;
    if (isAdminLogin) return '/admin';
    if (isCronogramaLogin) return '/cronograma-eventos';
    if (isCommercialMapLogin) return '/mapa-comercial';
    if (selectedModule) return getModuleRoute(selectedModule);
    return '/comissoes/logistica/dashboard';
  };

  useEffect(() => {
    if (!authLoading && user && location.pathname.startsWith('/login')) {
      navigate(resolveTarget(), { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, location.pathname]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (loading) return;
    setError('');
    setLoading(true);
    const result = await signIn(email.trim(), password);
    if (result.error) {
      setError('E-mail ou senha incorretos. Confira suas credenciais e tente novamente.');
    } else {
      navigate(resolveTarget(), { replace: true });
    }
    setLoading(false);
  };

  return (
    <main className="command-grid-bg relative min-h-[100dvh] overflow-hidden bg-[oklch(var(--brand-navy-900))] text-white">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_12%,oklch(var(--brand-indigo-500)/0.74),transparent_38%),radial-gradient(circle_at_95%_90%,oklch(var(--brand-orange-500)/0.22),transparent_35%)]"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -left-24 bottom-10 h-72 w-72 rotate-[-14deg] rounded-[30%] border border-[oklch(var(--brand-gold-400)/0.14)]"
        aria-hidden="true"
      />

      <div className="relative mx-auto grid min-h-[100dvh] w-full max-w-6xl items-center gap-8 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_420px] lg:px-8">
        <section className="hidden max-w-xl lg:block" aria-labelledby="login-hero-title">
          <FenasojaBrand subtitle="Gestão operacional" tone="dark" />
          <p className="mt-14 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-[oklch(var(--brand-gold-400))]">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            Acesso protegido
          </p>
          <h1 id="login-hero-title" className="mt-4 text-balance text-5xl font-black leading-[1.02] tracking-[-0.04em]">
            {heroTitle}
          </h1>
          <p className="mt-5 text-base leading-7 text-white/68">{heroDescription}</p>

          <div className="portal-glass-stat mt-10 grid grid-cols-3 gap-px overflow-hidden rounded-xl">
            {['Contexto preservado', 'Acesso por perfil', 'Dados protegidos'].map((item) => (
              <span key={item} className="bg-white/[0.035] px-3 py-4 text-center text-xs font-semibold text-white/72">
                {item}
              </span>
            ))}
          </div>
        </section>

        <section className="auth-glass-panel animate-soft-rise w-full rounded-2xl border p-5 text-card-foreground sm:p-7" aria-labelledby="login-title" aria-busy={loading}>
          <div className="flex items-start justify-between gap-4">
            <FenasojaBrand compact subtitle="Acesso ao sistema" tone="light" />
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-accent px-2 py-1 text-[10px] font-bold text-accent-foreground">
              {isAdminLogin && <LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" />}
              {isCronogramaLogin && <CalendarRange className="h-3.5 w-3.5" aria-hidden="true" />}
              {contextName}
            </span>
          </div>

          <div className="mt-8">
            <h2 id="login-title" className="text-2xl font-black tracking-tight text-foreground">Entrar</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">Use suas credenciais para continuar no ambiente selecionado.</p>
          </div>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <label className="block text-left">
              <span className="mb-2 block text-sm font-semibold text-foreground">E-mail</span>
              <input
                type="email"
                placeholder="seu.email@fenasoja.com.br"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                autoComplete="email"
                className="h-11 w-full rounded-lg border border-input bg-white/70 px-3 text-sm text-foreground shadow-inner outline-none transition-[border-color,background-color,box-shadow] duration-150 placeholder:text-muted-foreground focus:border-ring focus:bg-white/90 focus:ring-4 focus:ring-ring/15"
              />
            </label>
            <label className="block text-left">
              <span className="mb-2 block text-sm font-semibold text-foreground">Senha</span>
              <input
                type="password"
                placeholder="Digite sua senha"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                autoComplete="current-password"
                className="h-11 w-full rounded-lg border border-input bg-white/70 px-3 text-sm text-foreground shadow-inner outline-none transition-[border-color,background-color,box-shadow] duration-150 placeholder:text-muted-foreground focus:border-ring focus:bg-white/90 focus:ring-4 focus:ring-ring/15"
              />
            </label>

            {error && (
              <div className="rounded-lg border border-destructive/25 bg-destructive/[0.08] px-3 py-2.5 text-sm font-semibold text-destructive" role="alert">
                {error}
              </div>
            )}

            <Button type="submit" className="auth-primary-action h-11 w-full" disabled={loading}>
              {loading
                ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                : <LogIn className="mr-2 h-4 w-4" aria-hidden="true" />}
              {loading ? 'Entrando...' : 'Entrar no sistema'}
            </Button>
          </form>

          <div className="mt-6 border-t border-border pt-4 text-center">
            <p className="text-xs leading-5 text-muted-foreground">Acesso restrito. Solicite suas credenciais ao administrador.</p>
            <Link
              to="/portal"
              className="mt-2 inline-flex min-h-11 items-center rounded-lg px-3 py-2 text-xs font-bold text-primary transition-colors duration-150 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ArrowLeft className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
              Voltar ao portal
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
