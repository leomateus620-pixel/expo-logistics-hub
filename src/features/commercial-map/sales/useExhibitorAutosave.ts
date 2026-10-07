import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { SalesBuyerDraft } from './salesTypes';
import { fetchProjectIdForLot, upsertExhibitor } from './exhibitorService';
import { buyerErrors } from './components/SalesBuyerForm';

export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'error';

const DEBOUNCE_MS = 800;
/** O avanço da venda espera o cadastro complementar no máximo este tempo. */
export const EXHIBITOR_FLUSH_MAX_WAIT_MS = 4_000;

function isComplete(buyer: SalesBuyerDraft): boolean {
  return Object.values(buyerErrors(buyer)).every((error) => error === null);
}

export function exhibitorDraftKey(buyer: SalesBuyerDraft, projectId: string | null | undefined): string {
  return [projectId ?? '', buyer.buyerName.trim(), buyer.tradeName.trim(), buyer.documentNumber.replace(/\D+/g, ''), buyer.phone.replace(/\D+/g, ''), buyer.email.trim().toLowerCase()].join('|');
}

interface InflightSave { key: string; generation: number; promise: Promise<string | null> }

/**
 * Salva o expositor só quando os campos obrigatórios estão válidos (nunca a cada tecla).
 * Mesmo conteúdo + contexto reaproveita a gravação em andamento; depois de esperar
 * uma gravação anterior, confere se o conteúdo atual já foi salvo. Respostas de
 * um formulário reiniciado/fechado (geração anterior) são descartadas.
 */
export function useExhibitorAutosave(buyer: SalesBuyerDraft, firstLotId: string | null, enabled: boolean) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AutosaveStatus>('idle');
  const [exhibitorId, setExhibitorId] = useState<string | null>(null);
  const saved = useRef<{ key: string; id: string } | null>(null);
  const inflight = useRef<InflightSave | null>(null);
  const generation = useRef(0);
  const latestBuyer = useRef(buyer);
  latestBuyer.current = buyer;

  const project = useQuery({
    queryKey: ['commercial-map', 'sales-project-of-lot', firstLotId],
    queryFn: () => fetchProjectIdForLot(firstLotId as string),
    enabled: Boolean(firstLotId),
    staleTime: Infinity,
  });
  const projectId = project.data ?? null;

  const save = useCallback(async (): Promise<string | null> => {
    const current = latestBuyer.current;
    if (!isComplete(current) || !projectId) return null;
    const key = exhibitorDraftKey(current, projectId);
    if (saved.current?.key === key) return saved.current.id;
    const running = inflight.current;
    if (running && running.generation === generation.current) {
      if (running.key === key) return running.promise;
      await running.promise.catch(() => null);
      // A gravação anterior pode já ter persistido exatamente este conteúdo.
      if (saved.current?.key === key) return saved.current.id;
    }
    const gen = generation.current;
    setStatus('saving');
    const promise = upsertExhibitor({
      projectId,
      name: current.buyerName,
      tradeName: current.tradeName,
      document: current.documentNumber,
      phone: current.phone,
      email: current.email,
    }).then((id) => {
      if (gen !== generation.current) return null; // formulário reiniciado: resposta antiga
      saved.current = { key, id };
      setExhibitorId(id);
      setStatus('saved');
      void queryClient.invalidateQueries({ queryKey: ['commercial-map', 'exhibitors'] });
      return id;
    }).catch(() => {
      if (gen === generation.current) setStatus('error');
      return null;
    }).finally(() => {
      if (inflight.current?.promise === promise) inflight.current = null;
    });
    inflight.current = { key, generation: gen, promise };
    return promise;
  }, [projectId, queryClient]);

  /** Espera a gravação por no máximo `maxWaitMs`; o pedido leva os dados como cópia. */
  const flushWithin = useCallback(async (maxWaitMs = EXHIBITOR_FLUSH_MAX_WAIT_MS): Promise<string | null> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), maxWaitMs); });
    try { return await Promise.race([save(), timeout]); } finally { clearTimeout(timer); }
  }, [save]);

  useEffect(() => {
    if (!enabled || !isComplete(buyer) || !projectId || exhibitorDraftKey(buyer, projectId) === saved.current?.key) return;
    const timer = window.setTimeout(() => { void save(); }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [buyer, enabled, projectId, save]);

  const reset = useCallback(() => {
    generation.current += 1;
    saved.current = null;
    inflight.current = null;
    setExhibitorId(null);
    setStatus('idle');
  }, []);

  return { status, exhibitorId, flush: save, flushWithin, reset, ready: Boolean(projectId) };
}
