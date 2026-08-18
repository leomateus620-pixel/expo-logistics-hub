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
      data-venue={active}
      role="tablist"
      aria-label="Selecionar ambiente operacional"
    >
      {VENUE_WORKSPACES.map(({ id, shortLabel, icon: Icon }) => {
        const isActive = id === active;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={isActive}
            data-venue={id}
            data-active={isActive || undefined}
            className="venue-workspace-switcher__option"
            onClick={() => onSelect(id)}
          >
            <Icon aria-hidden="true" />
            <span>{shortLabel}</span>
            <small>{counts[id]}</small>
          </button>
        );
      })}
    </div>
  );
}
