import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, Loader2, LogOut, MapPinned, Search, X } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { FenasojaBrand } from '@/components/brand/FenasojaBrand';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useCommercialMapStore } from '../../state/useCommercialMapStore';
import './commercial-map-shell.css';

export function CommercialMapShell({ children }: { children: ReactNode }) {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchTriggerRef = useRef<HTMLButtonElement>(null);
  const search = useCommercialMapStore((state) => state.search);
  const setSearch = useCommercialMapStore((state) => state.setSearch);
  const setActivePanel = useCommercialMapStore((state) => state.setActivePanel);

  useEffect(() => {
    if (!isSearchOpen) return undefined;
    const frame = window.requestAnimationFrame(() => searchInputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [isSearchOpen]);

  useEffect(() => {
    const compactViewport = window.matchMedia('(max-width: 720px), (max-width: 950px) and (max-height: 520px)');
    const syncSearchMode = () => {
      if (!compactViewport.matches) setIsSearchOpen(false);
    };
    compactViewport.addEventListener('change', syncSearchMode);
    return () => compactViewport.removeEventListener('change', syncSearchMode);
  }, []);

  const closeSearch = (clear = false) => {
    if (clear) setSearch('');
    setIsSearchOpen(false);
    window.requestAnimationFrame(() => searchTriggerRef.current?.focus());
  };

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

      <header className={`commercial-map-module__bar ${isSearchOpen ? 'is-search-open' : ''}`}>
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

          {isSearchOpen ? (
            <form
              id="commercial-map-mobile-search"
              className="commercial-map-module__search"
              role="search"
              onSubmit={(event) => {
                event.preventDefault();
                setActivePanel('results');
              }}
            >
              <Search aria-hidden="true" />
              <input
                ref={searchInputRef}
                data-commercial-map-search
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== 'Escape') return;
                  event.preventDefault();
                  event.stopPropagation();
                  closeSearch(true);
                }}
                placeholder="ID, nome, quadra, lote, rua ou empresa"
                aria-label="Buscar no mapa comercial"
                autoComplete="off"
              />
              <button type="button" onClick={() => closeSearch(true)} aria-label="Fechar e limpar busca">
                <X aria-hidden="true" />
              </button>
            </form>
          ) : (
            <button
              ref={searchTriggerRef}
              type="button"
              className={`commercial-map-module__search-trigger ${search ? 'has-query' : ''}`}
              onClick={() => setIsSearchOpen(true)}
              aria-label={search ? 'Abrir busca do mapa, filtro ativo' : 'Buscar no mapa comercial'}
              aria-expanded={isSearchOpen}
              aria-controls="commercial-map-mobile-search"
              data-commercial-map-shell-search-trigger
            >
              <Search aria-hidden="true" />
              <span>Buscar no mapa</span>
            </button>
          )}
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
