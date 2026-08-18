import {
  BarChart3,
  CalendarDays,
  FileKey2,
  History,
  ListChecks,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import type { VenueView } from "@/lib/venue-operations";

export interface VenueNavItem {
  id: VenueView;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
  section: "planejamento" | "gestao" | "controle";
}

/** Ordem operacional da sidebar — "Operação" foi descontinuada. */
export const VENUE_NAV_ITEMS: VenueNavItem[] = [
  {
    id: "agenda",
    label: "Agenda",
    shortLabel: "Agenda",
    icon: CalendarDays,
    section: "planejamento",
  },
  {
    id: "eventos",
    label: "Eventos",
    shortLabel: "Eventos",
    icon: ListChecks,
    section: "planejamento",
  },
  {
    id: "contrapartidas",
    label: "Contrapartidas",
    shortLabel: "Contratos",
    icon: FileKey2,
    section: "gestao",
  },
  {
    id: "patrocinadores",
    label: "Patrocinadores",
    shortLabel: "Parceiros",
    icon: UsersRound,
    section: "gestao",
  },
  {
    id: "historico",
    label: "Histórico",
    shortLabel: "Histórico",
    icon: History,
    section: "controle",
  },
  {
    id: "relatorios",
    label: "Relatórios",
    shortLabel: "Relatórios",
    icon: BarChart3,
    section: "controle",
  },
];

export const VENUE_VALID_VIEWS = new Set<VenueView>(
  VENUE_NAV_ITEMS.map((item) => item.id),
);
