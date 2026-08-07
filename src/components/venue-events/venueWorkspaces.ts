import { Landmark, UtensilsCrossed, type LucideIcon } from "lucide-react";
import type { VenueWorkspaceData } from "@/lib/venue-operations";

export type VenueWorkspaceId = "restaurante" | "arena";

export interface VenueWorkspaceDefinition {
  id: VenueWorkspaceId;
  /** venue_spaces.type discriminator */
  spaceType: string;
  label: string;
  shortLabel: string;
  agendaTitle: string;
  description: string;
  icon: LucideIcon;
}

export const VENUE_WORKSPACES: VenueWorkspaceDefinition[] = [
  {
    id: "restaurante",
    spaceType: "restaurante",
    label: "Agenda Restaurante",
    shortLabel: "Restaurante",
    agendaTitle: "Agenda do Restaurante",
    description: "Refeições, recepções e reservas do salão",
    icon: UtensilsCrossed,
  },
  {
    id: "arena",
    spaceType: "arena",
    label: "Agenda Arena",
    shortLabel: "Arena",
    agendaTitle: "Agenda da Arena",
    description: "Shows, competições e grandes públicos",
    icon: Landmark,
  },
];

export const DEFAULT_VENUE_WORKSPACE: VenueWorkspaceId = "restaurante";
const STORAGE_KEY = "fenasoja.venue.workspace";

export function isVenueWorkspaceId(value: unknown): value is VenueWorkspaceId {
  return VENUE_WORKSPACES.some((item) => item.id === value);
}

export function getVenueWorkspace(id: VenueWorkspaceId): VenueWorkspaceDefinition {
  return VENUE_WORKSPACES.find((item) => item.id === id) ?? VENUE_WORKSPACES[0];
}

export function readStoredVenueWorkspace(): VenueWorkspaceId {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isVenueWorkspaceId(stored) ? stored : DEFAULT_VENUE_WORKSPACE;
  } catch {
    return DEFAULT_VENUE_WORKSPACE;
  }
}

export function storeVenueWorkspace(id: VenueWorkspaceId) {
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* storage indisponível — o segmento da rota continua sendo a fonte da verdade */
  }
}

/** Ids dos espaços (e subespaços) que pertencem ao ambiente ativo. */
export function resolveVenueSpaceIds(
  spaces: VenueWorkspaceData["spaces"],
  workspaceId: VenueWorkspaceId,
): Set<string> {
  const definition = getVenueWorkspace(workspaceId);
  const roots = spaces.filter((space) => space.type === definition.spaceType);
  const ids = new Set(roots.map((space) => space.id));
  let changed = true;
  while (changed) {
    changed = false;
    for (const space of spaces) {
      if (
        !ids.has(space.id) &&
        space.parent_space_id &&
        ids.has(space.parent_space_id)
      ) {
        ids.add(space.id);
        changed = true;
      }
    }
  }
  return ids;
}

/** Id do espaço raiz do ambiente ativo (Restaurante Fenasoja / Arena Fenasoja). */
export function resolveVenueRootSpaceId(
  spaces: VenueWorkspaceData["spaces"],
  workspaceId: VenueWorkspaceId,
): string | null {
  const definition = getVenueWorkspace(workspaceId);
  return spaces.find((space) => space.type === definition.spaceType)?.id ?? null;
}

/**
 * Recorta os dados operacionais para o ambiente ativo.
 * Patrocinadores (stakeholders) e membros permanecem compartilhados.
 * Eventos alocados nos dois espaços aparecem nas duas agendas.
 */
export function scopeVenueWorkspaceData<T extends VenueWorkspaceData>(
  data: T,
  spaceIds: Set<string>,
): T {
  if (!spaceIds.size) return data;

  const eventIds = new Set(
    data.allocations
      .filter((allocation) => spaceIds.has(allocation.space_id))
      .map((allocation) => allocation.event_id),
  );

  const events = data.events.filter((event) => eventIds.has(event.id));
  const keptEventIds = new Set(events.map((event) => event.id));

  return {
    ...data,
    spaces: data.spaces.filter((space) => spaceIds.has(space.id)),
    events,
    allocations: data.allocations.filter((item) =>
      keptEventIds.has(item.event_id),
    ),
    responsibles: data.responsibles.filter((item) =>
      keptEventIds.has(item.event_id),
    ),
    resources: data.resources.filter((item) => keptEventIds.has(item.event_id)),
    checklist: data.checklist.filter((item) => keptEventIds.has(item.event_id)),
    blocks: data.blocks.filter((item) => spaceIds.has(item.space_id)),
    agreements: data.agreements.filter(
      (item) => !item.space_id || spaceIds.has(item.space_id),
    ),
    usages: data.usages.filter(
      (item) => !item.event_id || keptEventIds.has(item.event_id),
    ),
  };
}

/** Um evento é compartilhado quando ocupa espaços dos dois ambientes. */
export function isSharedVenueEvent(
  eventId: string,
  allocations: VenueWorkspaceData["allocations"],
  restauranteIds: Set<string>,
  arenaIds: Set<string>,
) {
  let inRestaurante = false;
  let inArena = false;
  for (const allocation of allocations) {
    if (allocation.event_id !== eventId) continue;
    if (restauranteIds.has(allocation.space_id)) inRestaurante = true;
    if (arenaIds.has(allocation.space_id)) inArena = true;
  }
  return inRestaurante && inArena;
}
