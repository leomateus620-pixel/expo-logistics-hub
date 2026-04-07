import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import bgImage from '@/assets/fenasoja-bg-2026.png';
import bgMobile from '@/assets/fenasoja-bg-mobile.png';
import logoHorizontal from '@/assets/logofeira26.webp';
import { LogIn } from 'lucide-react';
import splashImg from '@/assets/fenasoja-splash-2026.png';

export default function LoginPage() {
  // Preload splash image while user is on login screen
  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'image';
    link.href = splashImg;
    document.head.appendChild(link);
    return () => { document.head.removeChild(link); };
  }, []);
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [bgReady, setBgReady] = useState(false);

  // Progressive image loading
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError('');
    setLoading(true);
    const { error } = await signIn(email.trim(), password);
    if (error) setError('Email ou senha incorretos');
    setLoading(false);
  };

  return (
    <div className="fixed inset-0" style={{ backgroundColor: '#1a2e1a' }}>
      {/* Background layer — CSS background, fixed, stable */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat transition-opacity duration-500"
        style={{
          backgroundImage: `url(${bgImage})`,
          opacity: bgReady ? 1 : 0,
        }}
        aria-hidden="true"
      />
      {/* Mobile background variant */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat transition-opacity duration-500 md:hidden"
        style={{
          backgroundImage: `url(${bgMobile})`,
          opacity: bgReady ? 1 : 0,
        }}
        aria-hidden="true"
      />
      {/* Hide desktop bg on mobile */}
      <style>{`@media (max-width: 767px) { .login-bg-desktop { display: none; } }`}</style>

      {/* Dark overlay */}
      <div className="absolute inset-0 bg-black/40" />

      {/* Content layer — scrollable, stable on keyboard open */}
      <div className="relative z-10 min-h-[100dvh] flex items-center justify-center p-4 overflow-y-auto">
        {/* Liquid Glass Card */}
        <div
          className="w-full max-w-sm rounded-2xl p-8 space-y-6 will-change-transform"
          style={{
            background: 'rgba(255, 255, 255, 0.08)',
            backdropFilter: 'blur(28px) saturate(1.5)',
            WebkitBackdropFilter: 'blur(28px) saturate(1.5)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            boxShadow: '0 8px 40px rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.12)',
          }}
        >
          {/* Logo + Branding */}
          <div className="flex flex-col items-center gap-4">
            <img
              src={logoHorizontal}
              alt="Fenasoja 2026"
              className="w-48 h-auto object-contain drop-shadow-lg"
            />
            <div className="text-center space-y-1">
              <h1
                className="text-2xl font-bold tracking-tight"
                style={{
                  color: 'rgba(255, 255, 255, 0.95)',
                  textShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
                }}
              >
                Fenasoja Logística
              </h1>
              <p
                className="text-sm font-medium"
                style={{
                  color: 'rgba(255, 255, 255, 0.65)',
                  textShadow: '0 1px 4px rgba(0, 0, 0, 0.2)',
                }}
              >
                Comissão de Logística
              </p>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full h-12 rounded-xl px-4 text-sm text-white placeholder:text-white/50 outline-none transition-all focus:ring-2 focus:ring-white/30"
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
              className="w-full h-12 rounded-xl px-4 text-sm text-white placeholder:text-white/50 outline-none transition-all focus:ring-2 focus:ring-white/30"
              style={{
                background: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
              }}
            />
            {error && (
              <p className="text-sm text-center font-medium text-red-300 drop-shadow-sm">
                {error}
              </p>
            )}
            <Button
              type="submit"
              className="w-full h-12 rounded-xl text-sm font-semibold active:scale-[0.97] transition-transform"
              disabled={loading}
            >
              <LogIn className="w-4 h-4 mr-2" />
              {loading ? 'Entrando...' : 'Entrar'}
            </Button>
          </form>

          <p
            className="text-xs text-center"
            style={{ color: 'rgba(255, 255, 255, 0.45)' }}
          >
            Acesso restrito. Solicite suas credenciais ao administrador.
          </p>
        </div>
      </div>
    </div>
  );
}
