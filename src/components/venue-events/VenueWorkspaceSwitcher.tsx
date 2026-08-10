import { CalendarDays } from "lucide-react";
import {
  VENUE_WORKSPACES,
  type VenueWorkspaceId,
} from "@/components/venue-events/venueWorkspaces";

interface VenueWorkspaceSwitcherProps {
  active: VenueWorkspaceId;
  counts: Record<VenueWorkspaceId, number>;
  onSelect: (id: VenueWorkspaceId) => void;
}

export function VenueWorkspaceSwitcher({
  active,
  counts,
  onSelect,
}: VenueWorkspaceSwitcherProps) {
  return (
    <div
      className="venue-workspace-switcher"
      role="tablist"
      aria-label="Selecionar ambiente operacional"
    >
      {VENUE_WORKSPACES.map(({ id, label, icon: Icon }) => {
        const isActive = id === active;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={isActive}
            data-venue={id}
            data-active={isActive}
            className="venue-workspace-switcher__option"
            onClick={() => onSelect(id)}
          >
            <span className="venue-workspace-switcher__icon" aria-hidden="true">
              <Icon />
            </span>
            <span className="venue-workspace-switcher__copy">
              <strong>{label}</strong>
            </span>
            <span className="venue-workspace-switcher__count">
              <CalendarDays aria-hidden="true" />
              {counts[id]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
