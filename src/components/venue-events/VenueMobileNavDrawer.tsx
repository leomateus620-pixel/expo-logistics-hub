import { ChevronRight, Menu, Plus } from "lucide-react";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { VENUE_NAV_ITEMS } from "@/components/venue-events/venueNavigation";
import type { VenueWorkspaceId } from "@/components/venue-events/venueWorkspaces";
import type { VenueView } from "@/lib/venue-operations";

interface VenueMobileNavDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  venueId: VenueWorkspaceId;
  venueLabel: string;
  view: VenueView;
  canCreate: boolean;
  onSelect: (view: VenueView) => void;
  onCreate: () => void;
}

export function VenueMobileNavDrawer({
  open,
  onOpenChange,
  venueId,
  venueLabel,
  view,
  canCreate,
  onSelect,
  onCreate,
}: VenueMobileNavDrawerProps) {
  const activeItem =
    VENUE_NAV_ITEMS.find((item) => item.id === view) ?? VENUE_NAV_ITEMS[0];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <button
          type="button"
          className="venue-nav-trigger"
          data-venue={venueId}
          aria-label="Abrir navegação do módulo"
          aria-expanded={open}
        >
          <Menu aria-hidden="true" />
          <span>{activeItem.shortLabel}</span>
        </button>
      </SheetTrigger>
      <SheetContent
        side="left"
        className="venue-nav-drawer"
        showCloseButton={false}
      >
        <SheetHeader className="venue-nav-drawer__header">
          <SheetTitle>Navegação</SheetTitle>
          <SheetDescription className="sr-only">
            Escolha a área do módulo Agenda Restaurante e Arena.
          </SheetDescription>
          <SheetClose asChild>
            <button type="button" aria-label="Fechar navegação">
              Fechar
            </button>
          </SheetClose>
        </SheetHeader>

        {canCreate && (
          <button
            type="button"
            className="venue-nav-drawer__create"
            onClick={onCreate}
          >
            <span className="venue-sidenav__create-icon">
              <Plus aria-hidden="true" />
            </span>

            <span>
              <strong>Novo evento</strong>
              <small>Cadastrar na {venueLabel}</small>
            </span>
          </button>
        )}

        <nav className="venue-nav-drawer__list" aria-label="Áreas do módulo">
          {VENUE_NAV_ITEMS.map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              type="button"
              data-active={view === id || undefined}
              aria-current={view === id ? "page" : undefined}
              onClick={() => onSelect(id)}
            >
              <Icon aria-hidden="true" />
              <span>{label}</span>
              <ChevronRight aria-hidden="true" />
            </button>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
