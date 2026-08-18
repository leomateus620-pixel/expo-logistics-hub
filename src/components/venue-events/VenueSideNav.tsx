import { useCallback, useEffect, useState } from "react";
import { PanelLeftClose, PanelLeftOpen, Plus } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { VENUE_NAV_ITEMS } from "@/components/venue-events/venueNavigation";
import type { VenueWorkspaceId } from "@/components/venue-events/venueWorkspaces";
import type { VenueView } from "@/lib/venue-operations";

const STORAGE_KEY = "fenasoja.venue.sidenav-collapsed";

interface VenueSideNavProps {
  venueId: VenueWorkspaceId;
  venueLabel: string;
  view: VenueView;
  canCreate: boolean;
  onSelect: (view: VenueView) => void;
  onCreate: () => void;
}

export function VenueSideNav({
  venueId,
  venueLabel,
  view,
  canCreate,
  onSelect,
  onCreate,
}: VenueSideNavProps) {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
    } catch {
      /* storage indisponível */
    }
  }, [collapsed]);

  const toggle = useCallback(() => setCollapsed((value) => !value), []);

  return (
    <TooltipProvider delayDuration={220}>
      <aside
        className="venue-sidenav"
        data-collapsed={collapsed || undefined}
        data-venue={venueId}
        aria-label="Navegação da Agenda Restaurante e Arena"
      >
        <div className="venue-sidenav__head">
          {!collapsed && (
            <span className="venue-sidenav__eyebrow">Navegação</span>
          )}
          <button
            type="button"
            onClick={toggle}
            className="venue-sidenav__toggle"
            aria-label={collapsed ? "Expandir navegação" : "Recolher navegação"}
            aria-expanded={!collapsed}
          >
            {collapsed ? (
              <PanelLeftOpen aria-hidden="true" />
            ) : (
              <PanelLeftClose aria-hidden="true" />
            )}
          </button>
        </div>

        {canCreate &&
          (collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="venue-sidenav__create"
                  onClick={onCreate}
                  aria-label={`Novo evento na ${venueLabel}`}
                >
                  <span className="venue-sidenav__create-icon">
                    <Plus aria-hidden="true" />
                  </span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                Novo evento · {venueLabel}
              </TooltipContent>
            </Tooltip>
          ) : (
            <button
              type="button"
              className="venue-sidenav__create"
              onClick={onCreate}
            >
              <span className="venue-sidenav__create-icon">
                <Plus aria-hidden="true" />
              </span>
              <span>Novo evento</span>
            </button>
          ))}


        <nav className="venue-sidenav__group" aria-label="Áreas do módulo">
          {VENUE_NAV_ITEMS.map((item, index) => {
            const Icon = item.icon;
            const active = view === item.id;
            const previous = VENUE_NAV_ITEMS[index - 1];
            const button = (
              <button
                key={item.id}
                type="button"
                className="venue-sidenav__item"
                data-active={active || undefined}
                aria-current={active ? "page" : undefined}
                aria-label={item.label}
                onClick={() => onSelect(item.id)}
              >
                <Icon aria-hidden="true" />
                {!collapsed && <span>{item.label}</span>}
              </button>
            );

            return (
              <div key={item.id} className="venue-sidenav__slot">
                {previous && previous.section !== item.section && (
                  <span className="venue-sidenav__divider" aria-hidden="true" />
                )}
                {collapsed ? (
                  <Tooltip>
                    <TooltipTrigger asChild>{button}</TooltipTrigger>
                    <TooltipContent side="right">{item.label}</TooltipContent>
                  </Tooltip>
                ) : (
                  button
                )}
              </div>
            );
          })}
        </nav>
      </aside>
    </TooltipProvider>
  );
}
