import { supabase } from '@/integrations/supabase/client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = (name: string, args: Record<string, unknown> = {}) => (supabase as any).rpc(name, args);

export interface PublicMapLinkOverview {
  id: string;
  slug: string;
  displayName: string;
  scopeKind: string;
  scopeKey: string | null;
  isActive: boolean;
  hasToken: boolean;
  /** Chave permanente do destino. Só gestores autorizados a recebem. */
  token: string | null;
  tokenVersion: number;
  revokedAt: string | null;
  updatedAt: string;
  sortOrder: number;
}

export interface PublicMapAreaInterest {
  slug: string;
  displayName: string;
  visits: number;
  sessions: number;
  sessionsWithSelection: number;
  lotSelections: number;
  detailViews: number;
  engagementSeconds: number;
}

export interface PublicMapLotInterest {
  lotId: string;
  publicIdentifier: string | null;
  areaSlug: string;
  selections: number;
  detailViews: number;
  sessions: number;
}

export interface PublicMapInterestSummary {
  from: string;
  to: string;
  areas: PublicMapAreaInterest[];
  lots: PublicMapLotInterest[];
  daily: { day: string; visits: number; sessions: number; selections: number }[];
}

function unwrap<T>(data: T | null, error: { message?: string } | null): T {
  if (error) throw new Error(error.message || 'PUBLIC_MAP_ADMIN_ERROR');
  return (data ?? ([] as unknown as T));
}

export async function fetchPublicMapLinks(): Promise<PublicMapLinkOverview[]> {
  const { data, error } = await rpc('public_map_links_overview');
  return unwrap<PublicMapLinkOverview[]>(data, error);
}

export async function fetchPublicMapInterest(fromIso: string, toIso: string): Promise<PublicMapInterestSummary> {
  const { data, error } = await rpc('public_map_interest_summary', { _from: fromIso, _to: toIso });
  return unwrap<PublicMapInterestSummary>(data, error);
}

export async function setPublicMapLinkActive(slug: string, active: boolean): Promise<void> {
  const { error } = await rpc('public_map_link_set_active', { _slug: slug, _active: active });
  if (error) throw new Error(error.message || 'PUBLIC_MAP_ADMIN_ERROR');
}

/** Sessões com seleção ÷ sessões com visita. Não é conversão de venda. */
export function interactionRate(area: Pick<PublicMapAreaInterest, 'sessions' | 'sessionsWithSelection'>): number {
  if (!area.sessions) return 0;
  return area.sessionsWithSelection / area.sessions;
}
