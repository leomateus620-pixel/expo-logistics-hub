import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { SalesBuyerDraft } from './salesTypes';
import { fetchProjectIdForLot, upsertExhibitor } from './exhibitorService';
import { buyerErrors } from './components/SalesBuyerForm';

export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'error';

const DEBOUNCE_MS = 800;

function isComplete(buyer: SalesBuyerDraft): boolean {
  return Object.values(buyerErrors(buyer)).every((error) => error === null);
}

function keyOf(buyer: SalesBuyerDraft): string {
  return [buyer.buyerName.trim(), buyer.documentNumber.replace(/\D+/g, ''), buyer.phone.replace(/\D+/g, ''), buyer.email.trim().toLowerCase()].join('|');
}

/** Salva o expositor só quando os campos obrigatórios estão válidos (nunca a cada tecla). */
export function useExhibitorAutosave(buyer: SalesBuyerDraft, firstLotId: string | null, enabled: boolean) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AutosaveStatus>('idle');
  const [exhibitorId, setExhibitorId] = useState<string | null>(null);
  const lastSavedKey = useRef<string | null>(null);
  const inflight = useRef<Promise<string | null> | null>(null);

  const project = useQuery({
    queryKey: ['commercial-map', 'sales-project-of-lot', firstLotId],
    queryFn: () => fetchProjectIdForLot(firstLotId as string),
    enabled: Boolean(firstLotId),
    staleTime: Infinity,
  });

  const save = useCallback(async (): Promise<string | null> => {
    if (!isComplete(buyer) || !project.data) return null;
    const key = keyOf(buyer);
    if (key === lastSavedKey.current && exhibitorId) return exhibitorId;
    if (inflight.current) await inflight.current.catch(() => null);
    setStatus('saving');
    const run = upsertExhibitor({
      projectId: project.data,
      name: buyer.buyerName,
      document: buyer.documentNumber,
      phone: buyer.phone,
      email: buyer.email,
    }).then((id) => {
      lastSavedKey.current = key;
      setExhibitorId(id);
      setStatus('saved');
      void queryClient.invalidateQueries({ queryKey: ['commercial-map', 'exhibitors'] });
      return id;
    }).catch(() => {
      setStatus('error');
      return null;
    });
    inflight.current = run;
    const result = await run;
    inflight.current = null;
    return result;
  }, [buyer, project.data, exhibitorId, queryClient]);

  useEffect(() => {
    if (!enabled || !isComplete(buyer) || keyOf(buyer) === lastSavedKey.current) return;
    const timer = window.setTimeout(() => { void save(); }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [buyer, enabled, save]);

  const reset = useCallback(() => {
    lastSavedKey.current = null;
    setExhibitorId(null);
    setStatus('idle');
  }, []);

  return { status, exhibitorId, flush: save, reset, ready: Boolean(project.data) };
}
