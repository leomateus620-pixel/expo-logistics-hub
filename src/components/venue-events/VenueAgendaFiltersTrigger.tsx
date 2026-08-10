import { useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Drawer, DrawerContent, DrawerTrigger } from "@/components/ui/drawer";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

export type VenueAgendaMode = "dia" | "semana" | "mes";

interface SpaceOption {
  id: string;
  name: string;
}

interface VenueAgendaFiltersTriggerProps {
  mode: VenueAgendaMode;
  onModeChange: (mode: VenueAgendaMode) => void;
  date: string;
  onDateChange: (date: string) => void;
  onToday: () => void;
  onMove: (direction: -1 | 1) => void;
  spaceFilter: string;
  onSpaceFilterChange: (value: string) => void;
  spaces: SpaceOption[];
  onClear: () => void;
}

const MODE_LABELS: Record<VenueAgendaMode, string> = {
  dia: "Dia",
  semana: "Semana",
  mes: "Mês",
};

export function VenueAgendaFiltersTrigger({
  mode,
  onModeChange,
  date,
  onDateChange,
  onToday,
  onMove,
  spaceFilter,
  onSpaceFilterChange,
  spaces,
  onClear,
}: VenueAgendaFiltersTriggerProps) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  const activeCount = (spaceFilter !== "all" ? 1 : 0) + (mode !== "mes" ? 1 : 0);

  const trigger = (
    <button
      type="button"
      className="venue-agenda-filters__trigger"
      data-open={open || undefined}
      aria-label="Abrir filtros da agenda"
      aria-expanded={open}
    >
      <Filter aria-hidden="true" />
      <span className="venue-agenda-filters__trigger-label">Filtros</span>
      <span className="venue-agenda-filters__trigger-mode">
        {MODE_LABELS[mode]}
      </span>
      {activeCount > 0 && (
        <span className="venue-agenda-filters__badge">{activeCount}</span>
      )}
    </button>
  );

  const body: ReactNode = (
    <div className="venue-agenda-filters__panel">
      <header className="venue-agenda-filters__panel-header">
        <strong>Filtros da agenda</strong>
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
        <span className="venue-agenda-filters__label">Janela</span>
        <div className="venue-agenda-filters__modes" role="group">
          {(Object.keys(MODE_LABELS) as VenueAgendaMode[]).map((item) => (
            <button
              key={item}
              type="button"
              data-active={mode === item}
              aria-pressed={mode === item}
              onClick={() => onModeChange(item)}
            >
              {MODE_LABELS[item]}
            </button>
          ))}
        </div>
      </section>

      <section className="venue-agenda-filters__section">
        <span className="venue-agenda-filters__label">Data de referência</span>
        <div className="venue-agenda-filters__date">
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Período anterior"
            onClick={() => onMove(-1)}
          >
            <ChevronLeft />
          </Button>
          <Input
            type="date"
            aria-label="Data de referência da agenda"
            value={date}
            onChange={(event) => onDateChange(event.target.value)}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Próximo período"
            onClick={() => onMove(1)}
          >
            <ChevronRight />
          </Button>
          <Button type="button" variant="outline" onClick={onToday}>
            Hoje
          </Button>
        </div>
      </section>

      <section className="venue-agenda-filters__section">
        <span className="venue-agenda-filters__label">Área</span>
        <Select value={spaceFilter} onValueChange={onSpaceFilterChange}>
          <SelectTrigger aria-label="Filtrar agenda por espaço">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as áreas</SelectItem>
            {spaces.map((space) => (
              <SelectItem key={space.id} value={space.id}>
                {space.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
