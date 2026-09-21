import { markCommercialMapStage } from '../utils/performanceDiagnostics';
import { supabase } from '@/integrations/supabase/client';
import type { CommercialLot, CommercialStatus, MapEntity } from '../types';
import type { PublicLot, PublicMapContext, PublicMapInventory } from './publicMapTypes';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = (name: string, args: Record<string, unknown>) => (supabase as any).rpc(name, args);

export class PublicMapAccessError extends Error {
  constructor(message = 'PUBLIC_MAP_LINK_INVALID') {
    super(message);
    this.name = 'PublicMapAccessError';
  }
}

function assertScoped(error: { message?: string } | null) {
  if (!error) return;
  const message = error.message ?? '';
  if (message.includes('PUBLIC_MAP_LINK_INVALID') || message.includes('PUBLIC_MAP_LOT_OUT_OF_SCOPE')) {
    throw new PublicMapAccessError(message);
  }
  throw new Error(message || 'PUBLIC_MAP_UNAVAILABLE');
}

async function publicRpc(name: string, args: Record<string, unknown>, signal?: AbortSignal) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, 20_000);
  markCommercialMapStage(name + ':start');
  try { return await rpc(name, args).abortSignal(controller.signal); }
  finally { clearTimeout(timeout); signal?.removeEventListener('abort', abort); markCommercialMapStage(name + ':end'); }
}

/** Inventário do escopo do link. Toda validação de token/escopo acontece no servidor. */
export async function fetchPublicInventory(slug: string, token: string, signal?: AbortSignal): Promise<PublicMapInventory> {
  const { data, error } = await publicRpc('public_map_inventory', { _slug: slug, _token: token }, signal);
  assertScoped(error);
  if (!data) throw new Error('PUBLIC_MAP_UNAVAILABLE');
  return data as PublicMapInventory;
}

/**
 * Contexto cartográfico do parque: geometria publicável, camadas e nomes de
 * referência. Sem lotes, preços, status comercial ou qualquer dado interno.
 */
export async function fetchPublicContext(slug: string, token: string, signal?: AbortSignal): Promise<PublicMapContext> {
  const { data, error } = await publicRpc('public_map_context', { _slug: slug, _token: token }, signal);
  assertScoped(error);
  if (!data) throw new Error('PUBLIC_MAP_UNAVAILABLE');
  return data as PublicMapContext;
}

export interface PublicScopeRevision {
  slug: string;
  revision: string;
  contextRevision?: string;
  lotCount: number;
  serverTime: string;
}

/** Leitura leve da revisão oficial do escopo (sem inventário). */
export async function fetchPublicScopeRevision(slug: string, token: string, signal?: AbortSignal): Promise<PublicScopeRevision> {
  const { data, error } = await publicRpc('public_map_scope_revision', { _slug: slug, _token: token }, signal);
  assertScoped(error);
  if (!data) throw new Error('PUBLIC_MAP_UNAVAILABLE');
  return data as PublicScopeRevision;
}

export async function fetchPublicLot(slug: string, token: string, lotId: string, signal?: AbortSignal): Promise<PublicLot> {
  const { data, error } = await publicRpc('public_map_lot', { _slug: slug, _token: token, _lot_id: lotId }, signal);
  assertScoped(error);
  if (!data) throw new Error('PUBLIC_MAP_UNAVAILABLE');
  return data as PublicLot;
}

export interface PublicTelemetryInput {
  eventId: string;
  sessionId: string;
  pageViewId: string;
  eventType: 'area_visit' | 'map_ready' | 'lot_selected' | 'lot_details_viewed' | 'engagement_interval' | 'viewer_error';
  lotId?: string | null;
  durationSeconds?: number | null;
  metadata?: Record<string, unknown>;
}

/** Única escrita externa. Falha de telemetria nunca interrompe o mapa. */
export async function trackPublicMapEvent(slug: string, token: string, input: PublicTelemetryInput): Promise<void> {
  try {
    await rpc('public_map_track', {
      _slug: slug,
      _token: token,
      _event_id: input.eventId,
      _session_id: input.sessionId,
      _page_view_id: input.pageViewId,
      _event_type: input.eventType,
      _lot_id: input.lotId ?? null,
      _duration_seconds: input.durationSeconds ?? null,
      _metadata: input.metadata ?? {},
    });
  } catch {
    /* telemetria é best-effort */
  }
}

const AVAILABILITY_TO_STATUS: Record<PublicLot['availability'], CommercialStatus> = {
  AVAILABLE: 'AVAILABLE',
  RESERVED: 'RESERVED',
  SOLD: 'SOLD',
  UNAVAILABLE: 'BLOCKED',
};

/**
 * Converte o lote público no formato que o canvas já conhece, sem inventar
 * dados internos: tudo que não é publicável fica nulo.
 */
export function toCanvasLot(lot: PublicLot): CommercialLot {
  return {
    id: lot.id,
    entityId: lot.entityId,
    publicIdentifier: lot.publicIdentifier,
    block: lot.block,
    lotNumber: lot.lotNumber,
    levelLabel: lot.levelLabel,
    displayName: lot.displayName,
    description: null,
    status: AVAILABILITY_TO_STATUS[lot.availability],
    officialAreaSqm: lot.officialAreaSqm,
    calculatedAreaSqm: null,
    areaValidationStatus: 'UNVALIDATED',
    frontageMeters: null,
    depthMeters: null,
    pricingMode: 'PRICE_PER_SQUARE_METER',
    basePrice: null,
    pricePerSqm: lot.pricing.renovacaoPricePerSqm,
    askingPrice: lot.pricing.renovacaoTotal,
    minimumPrice: null,
    infrastructure: lot.infrastructure ?? [],
    hasElectricity: lot.hasElectricity,
    hasWater: lot.hasWater,
    hasInternet: lot.hasInternet,
    isCorner: lot.isCorner,
    isCovered: lot.isCovered,
    accessibilityNotes: null,
    commercialNotes: null,
    internalNotes: null,
    currentBuyer: null,
    reservationExpiresAt: null,
    saleDate: null,
    salespersonName: null,
    activeContractNumber: null,
    archivedAt: null,
    createdBy: null,
    updatedBy: null,
    createdAt: null,
    updatedAt: null,
  };
}

export function findPavilionEntity(entities: MapEntity[], identifier: string | null): MapEntity | null {
  if (!identifier) return null;
  return entities.find((entity) => entity.publicIdentifier === identifier) ?? null;
}
