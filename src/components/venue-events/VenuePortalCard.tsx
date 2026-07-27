import {
  ArrowRight,
  Building2,
  CheckCircle2,
  UtensilsCrossed,
} from "lucide-react";
import "@/styles/venue-portal-card.css";

interface VenuePortalCardProps {
  onAccess: () => void;
}

export function VenuePortalCard({ onAccess }: VenuePortalCardProps) {
  return (
    <button
      type="button"
      onClick={onAccess}
      className="venue-portal-card"
      aria-label="Acessar Eventos Restaurante e Arena"
    >
      <span className="venue-portal-card__content">
        <span className="venue-portal-card__icon" aria-hidden="true">
          <UtensilsCrossed />
        </span>

        <span className="venue-portal-card__body">
          <span className="venue-portal-card__meta">
            <span>Operação de espaços</span>
            <span className="venue-portal-card__availability">
              <CheckCircle2 aria-hidden="true" />
              Acesso autenticado
            </span>
          </span>

          <span className="venue-portal-card__title">
            Eventos Restaurante e Arena
          </span>
          <span className="venue-portal-card__description">
            Reservas, contrapartidas de patrocinadores, aprovações e recursos
            operacionais em um único domínio.
          </span>

          <span
            className="venue-portal-card__venues"
            aria-label="Espaços atendidos"
          >
            <span>
              <UtensilsCrossed aria-hidden="true" />
              Restaurante
            </span>
            <span>
              <Building2 aria-hidden="true" />
              Arena
            </span>
          </span>
        </span>

        <span className="venue-portal-card__cta">
          Acessar módulo
          <ArrowRight aria-hidden="true" />
        </span>
      </span>
    </button>
  );
}
