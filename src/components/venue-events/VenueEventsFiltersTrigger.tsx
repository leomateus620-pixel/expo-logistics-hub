import { useState, type ReactNode } from "react";
import { Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Drawer, DrawerContent, DrawerTrigger } from "@/components/ui/drawer";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

interface OptionItem {
  value: string;
  label: string;
}

interface VenueEventsFiltersTriggerProps {
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  statusOptions: OptionItem[];
  spaceFilter: string;
  onSpaceFilterChange: (value: string) => void;
  spaces: OptionItem[];
  reviewOnly: boolean;
  onReviewOnlyChange: (value: boolean) => void;
  reviewCount: number;
  includeHistory: boolean;
  onIncludeHistoryChange: (value: boolean) => void;
  onClear: () => void;
}

export function VenueEventsFiltersTrigger({
  statusFilter,
  onStatusFilterChange,
  statusOptions,
  spaceFilter,
  onSpaceFilterChange,
  spaces,
  reviewOnly,
  onReviewOnlyChange,
  reviewCount,
  includeHistory,
  onIncludeHistoryChange,
  onClear,
}: VenueEventsFiltersTriggerProps) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  const activeCount =
    (statusFilter !== "all" ? 1 : 0) +
    (spaceFilter !== "all" ? 1 : 0) +
    (reviewOnly ? 1 : 0) +
    (includeHistory ? 1 : 0);

  const trigger = (
    <button
      type="button"
      className="venue-agenda-filters__trigger"
      data-open={open || undefined}
      aria-label="Abrir filtros do registro de eventos"
      aria-expanded={open}
    >
      <Filter aria-hidden="true" />
      <span className="venue-agenda-filters__trigger-label">Filtros</span>
      {activeCount > 0 && (
        <span className="venue-agenda-filters__badge">{activeCount}</span>
      )}
    </button>
  );

  const body: ReactNode = (
    <div className="venue-agenda-filters__panel">
      <header className="venue-agenda-filters__panel-header">
        <strong>Filtros dos eventos</strong>
        {activeCount > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 rounded-full px-2 text-[11px]"
            onClick={onClear}
          >
            <X aria-hidden="true" /> Limpar
          </Button>
        )}
      </header>

      <section className="venue-agenda-filters__section">
        <span className="venue-agenda-filters__label">Status</span>
        <Select value={statusFilter} onValueChange={onStatusFilterChange}>
          <SelectTrigger aria-label="Filtrar eventos por status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {statusOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </section>

      <section className="venue-agenda-filters__section">
        <span className="venue-agenda-filters__label">Área</span>
        <Select value={spaceFilter} onValueChange={onSpaceFilterChange}>
          <SelectTrigger aria-label="Filtrar eventos por espaço">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as áreas</SelectItem>
            {spaces.map((space) => (
              <SelectItem key={space.value} value={space.value}>
                {space.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </section>

      <section className="venue-agenda-filters__toggle">
        <span>
          <strong>Somente revisar</strong>
          <small>{reviewCount} evento(s) com pendência</small>
        </span>
        <Switch
          checked={reviewOnly}
          onCheckedChange={onReviewOnlyChange}
          aria-label="Mostrar somente eventos que exigem revisão"
        />
      </section>

      <section className="venue-agenda-filters__toggle">
        <span>
          <strong>Incluir histórico</strong>
          <small>Eventos de 2025 e anteriores</small>
        </span>
        <Switch
          checked={includeHistory}
          onCheckedChange={onIncludeHistoryChange}
          aria-label="Incluir eventos anteriores a 2026"
        />
      </section>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerTrigger asChild>{trigger}</DrawerTrigger>
        <DrawerContent className="venue-agenda-filters__drawer">
          {body}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={10}
        collisionPadding={16}
        className={cn(
          "venue-agenda-filters__popover w-[min(92vw,24rem)] rounded-2xl border-border/60 bg-white p-4 shadow-2xl",
        )}
      >
        {body}
      </PopoverContent>
    </Popover>
  );
}
