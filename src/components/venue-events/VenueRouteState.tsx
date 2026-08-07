import { Component, type ErrorInfo, type ReactNode } from "react";
import {
  AlertTriangle,
  Loader2,
  RefreshCw,
  ShieldX,
  UtensilsCrossed,
} from "lucide-react";
import { Link } from "react-router-dom";
import { FenasojaBrand } from "@/components/brand/FenasojaBrand";
import { Button } from "@/components/ui/button";
import "@/styles/venue-events-shell.css";

interface VenueRouteBoundaryProps {
  children: ReactNode;
}

interface VenueRouteBoundaryState {
  hasError: boolean;
}

export class VenueRouteBoundary extends Component<
  VenueRouteBoundaryProps,
  VenueRouteBoundaryState
> {
  state: VenueRouteBoundaryState = { hasError: false };

  static getDerivedStateFromError(): VenueRouteBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const component = info.componentStack
      ?.split("\n")
      .map((line) => line.trim())
      .find(Boolean)
      ?.slice(0, 120);

    // Keep diagnostics useful without emitting records, credentials or query payloads.
    console.error("[venue-events-route] render_failure", {
      errorName: error.name || "Error",
      component: component || "unknown",
    });
  }

  private retry = () => {
    this.setState({ hasError: false });
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <VenueRouteStateFrame role="alert" ariaLive="assertive">
        <span className="venue-route-state__icon venue-route-state__icon--error">
          <AlertTriangle aria-hidden="true" />
        </span>
        <p className="venue-route-state__kicker venue-route-state__kicker--error">
          Falha de exibição
        </p>
        <h1 className="venue-route-state__title">
          Não foi possível abrir o módulo
        </h1>
        <p className="venue-route-state__description">
          Recarregue a página para restabelecer a experiência ou volte ao portal
          para escolher outro acesso.
        </p>
        <div className="venue-route-state__actions">
          <Button type="button" onClick={this.retry}>
            <RefreshCw aria-hidden="true" />
            Tentar novamente
          </Button>
          <Button asChild variant="outline">
            <Link to="/portal">Voltar ao portal</Link>
          </Button>
        </div>
      </VenueRouteStateFrame>
    );
  }
}

interface VenueRouteLoadingProps {
  label?: string;
}

export function VenueRouteLoading({
  label = "Carregando Agenda Restaurante e Arena…",
}: VenueRouteLoadingProps) {
  return (
    <VenueRouteStateFrame role="status" ariaLive="polite" isBusy>
      <span className="venue-route-state__icon venue-route-state__icon--loading">
        <Loader2 className="venue-route-state__spinner" aria-hidden="true" />
      </span>
      <p className="venue-route-state__loading-label">{label}</p>
      <p className="venue-route-state__loading-detail">
        Preparando agenda, permissões e recursos operacionais.
      </p>
    </VenueRouteStateFrame>
  );
}

interface VenuePermissionDeniedProps {
  description?: string;
}

export function VenuePermissionDenied({
  description = "Sua conta não possui a permissão necessária para acessar este domínio. Solicite a liberação ao administrador responsável.",
}: VenuePermissionDeniedProps) {
  return (
    <VenueRouteStateFrame>
      <span className="venue-route-state__icon venue-route-state__icon--permission">
        <ShieldX aria-hidden="true" />
      </span>
      <p className="venue-route-state__kicker">Acesso por perfil</p>
      <h1 className="venue-route-state__title">
        Módulo não liberado para este perfil
      </h1>
      <p className="venue-route-state__description">{description}</p>
      <Button
        asChild
        variant="outline"
        className="venue-route-state__single-action"
      >
        <Link to="/portal">Voltar ao portal</Link>
      </Button>
    </VenueRouteStateFrame>
  );
}

interface VenueRouteStateFrameProps {
  children: ReactNode;
  role?: "alert" | "status";
  ariaLive?: "assertive" | "polite";
  isBusy?: boolean;
}

function VenueRouteStateFrame({
  children,
  role,
  ariaLive,
  isBusy = false,
}: VenueRouteStateFrameProps) {
  return (
    <main className="venue-route-state-page">
      <section
        className="venue-route-state"
        role={role}
        aria-live={ariaLive}
        aria-busy={isBusy || undefined}
      >
        <div className="venue-route-state__brand-row">
          <FenasojaBrand
            compact
            subtitle="Agenda Restaurante e Arena"
            tone="light"
          />
          <UtensilsCrossed
            className="venue-route-state__brand-icon"
            aria-hidden="true"
          />
        </div>
        <div className="venue-route-state__body">{children}</div>
      </section>
    </main>
  );
}
