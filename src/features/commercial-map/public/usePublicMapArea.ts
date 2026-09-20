import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  fetchPublicInventory,
  fetchPublicLot,
  toCanvasLot,
  trackPublicMapEvent,
  type PublicTelemetryInput,
} from './publicMapService';
import type { PublicLot } from './publicMapTypes';

const SESSION_KEY = 'fenasoja-public-map-session';
const SESSION_TTL_MS = 30 * 60 * 1000;

function randomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Sessão pseudônima, renovada após ~30 minutos de inatividade. Sem dado pessoal. */
export function resolvePublicSessionId(now = Date.now()): string {
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { id: string; seenAt: number };
      if (parsed?.id && now - parsed.seenAt < SESSION_TTL_MS) {
        window.sessionStorage.setItem(SESSION_KEY, JSON.stringify({ id: parsed.id, seenAt: now }));
        return parsed.id;
      }
    }
    const id = randomId();
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify({ id, seenAt: now }));
    return id;
  } catch {
    return randomId();
  }
}

export function usePublicMapInventory(slug: string, token: string) {
  return useQuery({
    queryKey: ['public-map', 'inventory', slug, token],
    queryFn: () => fetchPublicInventory(slug, token),
    enabled: Boolean(slug && token),
    staleTime: 5 * 60 * 1000,
    retry: false,
    meta: { persist: false },
  });
}

export function usePublicLot(slug: string, token: string, lotId: string | null) {
  return useQuery({
    queryKey: ['public-map', 'lot', slug, token, lotId],
    queryFn: () => fetchPublicLot(slug, token, lotId as string),
    enabled: Boolean(slug && token && lotId),
    staleTime: 5 * 60 * 1000,
    retry: false,
    meta: { persist: false },
  });
}

export function usePublicMapTelemetry(slug: string, token: string) {
  const sessionId = useMemo(() => resolvePublicSessionId(), []);
  const pageViewId = useMemo(() => randomId(), []);
  const sentOnce = useRef(new Set<string>());

  const track = useCallback((
    eventType: PublicTelemetryInput['eventType'],
    options?: { lotId?: string | null; durationSeconds?: number; once?: string; metadata?: Record<string, unknown> },
  ) => {
    if (!slug || !token) return;
    if (options?.once) {
      if (sentOnce.current.has(options.once)) return;
      sentOnce.current.add(options.once);
    }
    void trackPublicMapEvent(slug, token, {
      eventId: randomId(),
      sessionId,
      pageViewId,
      eventType,
      lotId: options?.lotId ?? null,
      durationSeconds: options?.durationSeconds ?? null,
      metadata: options?.metadata,
    });
  }, [pageViewId, sessionId, slug, token]);

  // Permanência: pulsos de 30s enquanto a aba está visível.
  useEffect(() => {
    if (!slug || !token) return undefined;
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') track('engagement_interval', { durationSeconds: 30 });
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [slug, token, track]);

  return track;
}

export function usePublicCanvasLots(lots: PublicLot[] | undefined) {
  return useMemo(() => (lots ?? []).map(toCanvasLot), [lots]);
}
