import { useState, type ReactNode } from 'react';
import { ChevronLeft, Loader2, LogOut, MapPinned } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { FenasojaBrand } from '@/components/brand/FenasojaBrand';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import './commercial-map-shell.css';

export function CommercialMapShell({ children }: { children: ReactNode }) {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSignOut = async () => {
    if (isSigningOut) return;

    setIsSigningOut(true);
    try {
      await signOut();
      navigate('/portal', { replace: true });
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <div className="commercial-map-module">
      <a className="commercial-map-module__skip-link" href="#commercial-map-main">
        Ir para o mapa comercial
      </a>

      <header className="commercial-map-module__bar">
        <div className="commercial-map-module__leading">
          <Link
            to="/portal"
            className="commercial-map-module__back"
            aria-label="Voltar ao portal de acesso"
          >
            <ChevronLeft aria-hidden="true" />
            <span>Portal</span>
          </Link>

          <span className="commercial-map-module__divider" aria-hidden="true" />

          <div className="commercial-map-module__identity">
            <FenasojaBrand
              compact
              markOnly
              tone="dark"
              className="commercial-map-module__brand"
            />
            <span className="commercial-map-module__icon" aria-hidden="true">
              <MapPinned />
            </span>
            <span className="commercial-map-module__title-group">
              <span className="commercial-map-module__eyebrow">Gestão territorial</span>
              <strong>Mapa Comercial</strong>
            </span>
          </div>
        </div>

        <div className="commercial-map-module__actions">
          <span className="commercial-map-module__edition">FENASOJA 2028</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleSignOut}
            disabled={isSigningOut}
            className="commercial-map-module__sign-out"
            aria-label={isSigningOut ? 'Encerrando sessão' : 'Sair do Mapa Comercial'}
          >
            {isSigningOut
              ? <Loader2 className="commercial-map-module__spinner" aria-hidden="true" />
              : <LogOut aria-hidden="true" />}
            <span>{isSigningOut ? 'Saindo…' : 'Sair'}</span>
          </Button>
        </div>
      </header>

      <main id="commercial-map-main" className="commercial-map-module__content" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
