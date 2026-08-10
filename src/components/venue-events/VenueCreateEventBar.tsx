import { ArrowRight, CalendarPlus2 } from "lucide-react";
import type { VenueWorkspaceId } from "@/components/venue-events/venueWorkspaces";

interface VenueCreateEventBarProps {
  venueId: VenueWorkspaceId;
  venueLabel: string;
  onCreate: () => void;
}

export function VenueCreateEventBar({
  venueId,
  venueLabel,
  onCreate,
}: VenueCreateEventBarProps) {
  return (
    <button
      type="button"
      className="venue-create-event-bar"
      data-venue={venueId}
      onClick={onCreate}
      aria-label={`Novo evento: cadastrar na ${venueLabel}`}
    >
      <span className="venue-create-event-bar__icon" aria-hidden="true">
        <CalendarPlus2 />
      </span>
      <span className="venue-create-event-bar__copy">
        <strong>Novo evento</strong>
        <small>Cadastrar na {venueLabel}</small>
      </span>
      <ArrowRight className="venue-create-event-bar__arrow" aria-hidden="true" />
    </button>
  );
}
