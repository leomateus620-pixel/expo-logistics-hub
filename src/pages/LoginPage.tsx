import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { LogIn } from 'lucide-react';
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
  const selectedModule = getCommissionModule(selectedSlug);
  const contextName = isAdminLogin
    ? 'Administrador'
    : selectedModule
      ? `Comissao de ${selectedModule.name}`
      : 'Comissao de Logistica';

  const resolveTarget = () => {
    if (returnTo && returnTo !== '/' && !returnTo.startsWith('/login')) return returnTo;
    if (isAdminLogin) return '/admin';
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
      setError('Email ou senha incorretos');
    } else {
      navigate(resolveTarget(), { replace: true });
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0" style={{ backgroundColor: '#1a2e1a' }}>
      <div
        className="absolute inset-0 hidden bg-cover bg-center bg-no-repeat transition-opacity duration-500 md:block"
        style={{
          backgroundImage: `url(${bgImage})`,
          opacity: bgReady ? 1 : 0,
        }}
        aria-hidden="true"
      />
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat transition-opacity duration-500 md:hidden"
        style={{
          backgroundImage: `url(${bgMobile})`,
          opacity: bgReady ? 1 : 0,
        }}
        aria-hidden="true"
      />
      <div className="absolute inset-0 bg-black/40" />

      <div className="relative z-10 flex min-h-[100dvh] items-center justify-center overflow-y-auto p-4">
        <div
          className="w-full max-w-sm space-y-6 rounded-2xl p-8 will-change-transform"
          style={{
            background: 'rgba(255, 255, 255, 0.08)',
            backdropFilter: 'blur(28px) saturate(1.5)',
            WebkitBackdropFilter: 'blur(28px) saturate(1.5)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            boxShadow: '0 8px 40px rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.12)',
          }}
        >
          <div className="flex flex-col items-center gap-4">
            <img
              src={logoHorizontal}
              alt="Fenasoja 2026"
              className="h-auto w-48 object-contain drop-shadow-lg"
            />
            <div className="space-y-1 text-center">
              <h1
                className="text-2xl font-bold tracking-tight"
                style={{
                  color: 'rgba(255, 255, 255, 0.95)',
                  textShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
                }}
              >
                Acesso
              </h1>
              <p
                className="text-sm font-medium"
                style={{
                  color: 'rgba(255, 255, 255, 0.65)',
                  textShadow: '0 1px 4px rgba(0, 0, 0, 0.2)',
                }}
              >
                {contextName}
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="h-12 w-full rounded-xl px-4 text-sm text-white placeholder:text-white/50 outline-none transition-all focus:ring-2 focus:ring-white/30"
              style={{
                background: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
              }}
            />
            <input
              type="password"
              placeholder="Senha"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="h-12 w-full rounded-xl px-4 text-sm text-white placeholder:text-white/50 outline-none transition-all focus:ring-2 focus:ring-white/30"
              style={{
                background: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
              }}
            />
            {error && (
              <p className="text-center text-sm font-medium text-red-300 drop-shadow-sm">
                {error}
              </p>
            )}
            <Button
              type="submit"
              className="h-12 w-full rounded-xl text-sm font-semibold transition-transform active:scale-[0.97]"
              disabled={loading}
            >
              <LogIn className="mr-2 h-4 w-4" />
              {loading ? 'Entrando...' : 'Entrar'}
            </Button>
          </form>

          <div className="space-y-3 text-center">
            <p className="text-xs" style={{ color: 'rgba(255, 255, 255, 0.45)' }}>
              Acesso restrito. Solicite suas credenciais ao administrador.
            </p>
            <Link
              to="/portal"
              className="block rounded-lg text-xs font-semibold text-gold/85 transition hover:text-gold focus-ring"
            >
              Trocar comissao
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
