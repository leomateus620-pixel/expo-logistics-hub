import { useState, type ReactNode } from "react";
import { ChevronLeft, Loader2, LogOut, UtensilsCrossed } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { AgendaWordmark } from '@/components/brand/AgendaWordmark';
import { FenasojaBrand } from "@/components/brand/FenasojaBrand";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useCurrentOrg } from "@/hooks/useCurrentOrg";
import { presentFenasojaProductName } from "@/lib/fenasoja-brand";
import { VenueHeaderSearch } from "@/components/venue-events/VenueHeaderSearch";
import { VenueSearchProvider } from "@/components/venue-events/VenueSearchContext";
import "@/styles/venue-events-shell.css";

interface VenueModuleShellProps {
  children: ReactNode;
}

export function VenueModuleShell({ children }: VenueModuleShellProps) {
  const { signOut } = useAuth();
  const { orgName } = useCurrentOrg();
  const navigate = useNavigate();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSignOut = async () => {
    if (isSigningOut) return;

    setIsSigningOut(true);
    try {
      await signOut();
      navigate("/portal", { replace: true });
    } finally {
      setIsSigningOut(false);
    }
  };

  const organizationLabel = presentFenasojaProductName(orgName);

  return (
    <div className="venue-module-shell">
      <a className="venue-module-shell__skip-link" href="#venue-events-main">
        Ir para o conteúdo da Agenda Restaurante e Arena
      </a>

      <header className="venue-module-shell__bar">
        <div className="venue-module-shell__bar-inner">
          <div className="venue-module-shell__leading">
            <Link
              to="/portal"
              className="venue-module-shell__back"
              aria-label="Voltar ao portal de acesso"
            >
              <ChevronLeft aria-hidden="true" />
              <span>Portal</span>
            </Link>

            <span className="venue-module-shell__divider" aria-hidden="true" />

            <div className="venue-module-shell__identity">
              <FenasojaBrand
                compact
                markOnly
                tone="dark"
                className="venue-module-shell__brand"
              />
              <span
                className="venue-module-shell__module-icon"
                aria-hidden="true"
              >
                <UtensilsCrossed />
              </span>
              <span className="venue-module-shell__title-group">
                <span className="venue-module-shell__eyebrow">
                  Gestão de espaços
                </span>
                <span className="venue-module-shell__title">
                  <AgendaWordmark variant="venue" />
                </span>
              </span>

              <VenueHeaderSearch className="venue-module-shell__search" />
            </div>

          </div>

          <div className="venue-module-shell__actions">
            <div
              className="venue-module-shell__organization"
              aria-label={`Organização ativa: ${organizationLabel}`}
            >
              <span>Organização ativa</span>
              <strong>{organizationLabel}</strong>
            </div>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleSignOut}
              disabled={isSigningOut}
              className="venue-module-shell__sign-out"
              aria-label={
                isSigningOut ? "Encerrando sessão" : "Sair da plataforma"
              }
            >
              {isSigningOut ? (
                <Loader2
                  className="venue-module-shell__spinner"
                  aria-hidden="true"
                />
              ) : (
                <LogOut aria-hidden="true" />
              )}
              <span>{isSigningOut ? "Saindo…" : "Sair"}</span>
            </Button>
          </div>
        </div>
      </header>

      <div
        id="venue-events-main"
        className="venue-module-shell__content"
        tabIndex={-1}
      >
        {children}
      </div>
    </div>
  );
}
