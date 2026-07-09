import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarRange, LockKeyhole, LogIn, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import bgImage from '@/assets/fenasoja-bg-2026.webp';
import bgMobile from '@/assets/fenasoja-bg-mobile.webp';
import logoHorizontal from '@/assets/logofeira26.webp';
import splashImg from '@/assets/fenasoja-splash-2026.webp';
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
  const [bgReady, setBgReady] = useState(false);

  const isAdminLogin = location.pathname === '/login/admin' || moduleSlug === 'admin' || returnTo?.startsWith('/admin');
  const selectedSlug = isAdminLogin ? 'admin' : moduleSlug || getModuleSlugFromPath(returnTo) || getStoredModuleSlug() || 'logistica';
  const isCronogramaLogin = selectedSlug === 'cronograma-eventos' || returnTo === '/cronograma-eventos';
  const selectedModule = getCommissionModule(selectedSlug);
  const contextName = isAdminLogin
    ? 'Administrador'
    : isCronogramaLogin
      ? 'Cronograma e Eventos'
      : selectedModule
      ? `Comissão de ${selectedModule.name}`
      : 'Comissão de Logística';
  const heroTitle = isCronogramaLogin ? 'Planejamento temporal da Fenasoja 2028' : 'Ambiente seguro das comissões';
  const heroDescription = isCronogramaLogin
    ? 'Acesse diretamente o calendário oficial, a linha do tempo, as reuniões centrais e as decisões pendentes do ciclo 2026—2028.'
    : 'Entre com suas credenciais para continuar no módulo selecionado, preservando permissões e contexto operacional.';

  const resolveTarget = () => {
    if (returnTo && returnTo !== '/' && !returnTo.startsWith('/login')) return returnTo;
    if (isAdminLogin) return '/admin';
    if (isCronogramaLogin) return '/cronograma-eventos';
    if (selectedModule) return getModuleRoute(selectedModule);
    return '/comissoes/logistica/dashboard';
  };

  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'image';
    link.href = splashImg;
    document.head.appendChild(link);
    return () => {
      document.head.removeChild(link);
    };
  }, []);

  useEffect(() => {
    const isMobile = window.innerWidth < 768;
    const src = isMobile ? bgMobile : bgImage;
    const img = new Image();
    img.src = src;
    if (img.complete) {
      setBgReady(true);
    } else {
      img.onload = () => setBgReady(true);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && user && location.pathname.startsWith('/login')) {
      navigate(resolveTarget(), { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, location.pathname]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError('');
    setLoading(true);
    const { error } = await signIn(email.trim(), password);
    if (error) {
      setError('E-mail ou senha incorretos. Confira suas credenciais e tente novamente.');
    } else {
      navigate(resolveTarget(), { replace: true });
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 bg-[hsl(135_48%_10%)]">
      <div
        className="absolute inset-0 hidden bg-cover bg-center bg-no-repeat transition-opacity duration-500 md:block"
        style={{ backgroundImage: `url(${bgImage})`, opacity: bgReady ? 0.78 : 0 }}
        aria-hidden="true"
      />
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat transition-opacity duration-500 md:hidden"
        style={{ backgroundImage: `url(${bgMobile})`, opacity: bgReady ? 0.78 : 0 }}
        aria-hidden="true"
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(212,164,50,0.20),transparent_30%),linear-gradient(135deg,rgba(4,31,17,0.92),rgba(7,44,24,0.84)_48%,rgba(3,21,12,0.96))]" aria-hidden="true" />
      <div className="absolute inset-0 command-grid-bg opacity-50" aria-hidden="true" />

      <div className="relative z-10 flex min-h-[100dvh] items-center justify-center overflow-y-auto p-4 sm:p-6">
        <div className="grid w-full max-w-5xl gap-5 lg:grid-cols-[1fr_430px] lg:items-center">
          <section className="hidden animate-soft-rise text-white lg:block">
            <img src={logoHorizontal} alt="Fenasoja 2026" className="h-auto w-52 object-contain drop-shadow-2xl" />
            <div className="mt-8 inline-flex items-center gap-2 rounded-full border border-gold/25 bg-white/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.22em] text-gold backdrop-blur-xl">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              Acesso restrito
            </div>
            <h1 className="mt-5 max-w-xl text-5xl font-black leading-none tracking-[-0.04em] drop-shadow-2xl">
              {heroTitle}
            </h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-white/70">
              {heroDescription}
            </p>
          </section>

          <section className="glass-panel animate-soft-rise w-full rounded-[2rem] p-5 text-white shadow-2xl sm:p-8" aria-labelledby="login-title">
            <div className="flex flex-col items-center gap-5 text-center">
              <img src={logoHorizontal} alt="Fenasoja 2026" className="h-auto w-44 object-contain drop-shadow-lg sm:w-52" />
              <div className="space-y-3">
                <span className="inline-flex items-center gap-2 rounded-full border border-gold/25 bg-gold/10 px-3 py-1 text-xs font-bold text-gold">
                  {isAdminLogin ? <LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" /> : null}
                  {isCronogramaLogin ? <CalendarRange className="h-3.5 w-3.5" aria-hidden="true" /> : null}
                  {contextName}
                </span>
                <div>
                  <h1 id="login-title" className="text-3xl font-black tracking-tight text-white">
                    Acessar sistema
                  </h1>
                  <p className="mt-2 text-sm leading-6 text-white/60">
                    Informe seu e-mail e senha para continuar.
                  </p>
                </div>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="mt-8 space-y-4">
              <label className="block text-left">
                <span className="mb-2 block text-xs font-bold uppercase tracking-[0.16em] text-white/70">E-mail</span>
                <input
                  type="email"
                  placeholder="seu.email@fenasoja.com.br"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="h-12 w-full rounded-2xl border border-white/15 bg-white/10 px-4 text-sm text-white normal-case placeholder:text-white/40 outline-none transition focus:border-gold/40 focus:ring-2 focus:ring-gold/25"
                />
              </label>
              <label className="block text-left">
                <span className="mb-2 block text-xs font-bold uppercase tracking-[0.16em] text-white/70">Senha</span>
                <input
                  type="password"
                  placeholder="Digite sua senha"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="h-12 w-full rounded-2xl border border-white/15 bg-white/10 px-4 text-sm text-white normal-case placeholder:text-white/40 outline-none transition focus:border-gold/40 focus:ring-2 focus:ring-gold/25"
                />
              </label>
              {error && (
                <div className="rounded-2xl border border-red-300/25 bg-red-500/15 px-4 py-3 text-sm font-semibold text-red-100" role="alert">
                  {error}
                </div>
              )}
              <Button type="submit" className="h-12 w-full rounded-2xl text-sm font-bold shadow-lg shadow-black/20 transition-transform active:scale-[0.98]" disabled={loading}>
                <LogIn className="mr-2 h-4 w-4" aria-hidden="true" />
                {loading ? 'Entrando...' : 'Entrar'}
              </Button>
            </form>

            <div className="mt-6 space-y-3 text-center">
              <p className="text-xs leading-5 text-white/50">Acesso restrito. Solicite suas credenciais ao administrador.</p>
              <Link to="/portal" className="inline-flex items-center rounded-xl px-3 py-2 text-xs font-bold text-gold transition hover:bg-gold/10 hover:text-gold focus-ring">
                <ArrowLeft className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
                Voltar ao portal
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
