import { useEffect, useMemo, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCapabilities } from '@/hooks/useCapabilities';
import { useCurrentOrg } from '@/hooks/useCurrentOrg';
import { toast } from 'sonner';
import {
  bootstrapOfficialReference,
  createCommercialLot,
  fetchCommercialMap,
  fetchLotActivity,
  fetchLotContractVersions,
  mergeCommercialLots,
  publishCommercialMap,
  registerLotSale,
  reserveLot,
  saveMapCalibration,
  saveGeometryRevision,
  setMapLayerLock,
  setMapEntityVerification,
  splitCommercialLot,
  startLotNegotiation,
  uploadMapReference,
  uploadLotContract,
  updateCommercialLot,
} from '../services/commercialMapService';
import { useCommercialMapStore } from '../state/useCommercialMapStore';
import type { CommercialLot, MapEntity, MapPermissions } from '../types';
import { resolveMapPermissions } from '../utils/permissions';

const MAP_ERROR_MESSAGES: Record<string, string> = {
  MAP_PERMISSION_DENIED: 'Você não possui permissão para concluir esta operação.',
  GEOMETRY_VERSION_CONFLICT: 'A geometria foi alterada por outra pessoa. Recarregue o mapa antes de tentar novamente.',
  LOT_VERSION_CONFLICT: 'O cadastro do lote foi alterado por outra pessoa. Recarregue os dados antes de tentar novamente.',
  INVALID_POLYGON: 'O desenho gerou um polígono inválido. Corrija o traçado antes de salvar.',
  MAP_GEOMETRY_OVERLAP: 'A geometria invade a área de outro lote comercial.',
  MAP_LAYER_LOCKED: 'A camada está bloqueada. Desbloqueie-a antes de alterar geometrias.',
  VALIDATED_CALIBRATION_REQUIRED: 'Valide a calibração mais recente antes de aprovar ou publicar o mapa.',
  OFFICIAL_AREA_REQUIRED_FOR_VERIFICATION: 'Valide a área oficial deste lote antes de aprová-lo.',
  UNVERIFIED_MAP_ENTITIES: 'Todas as entidades ativas precisam estar verificadas antes da publicação.',
  LOT_HAS_ACTIVE_COMMERCIAL_FLOW: 'Conclua ou cancele a reserva/negociação antes de reorganizar este lote.',
  LOT_HAS_LINKED_RECORDS: 'Este lote possui reserva, negociação ou contrato ativo e não pode ser reorganizado.',
  INVALID_SPLIT_TOPOLOGY: 'A linha divisória não preserva integralmente a geometria original.',
  LOTS_NOT_ADJACENT_OR_INVALID_MERGE: 'Os lotes não compartilham um limite compatível para mesclagem.',
  DUPLICATE_CHILD_IDENTIFIER: 'Os lotes resultantes precisam de identificadores diferentes.',
  MAP_PROJECT_ALREADY_EXISTS: 'Já existe um projeto cartográfico ativo para esta organização.',
  VALIDATED_AREA_REQUIRED_FOR_SQM_PRICE: 'Valide a área oficial antes de usar preço por metro quadrado.',
  MINIMUM_PRICE_ABOVE_ASKING_PRICE: 'O preço mínimo não pode superar o valor solicitado.',
  LOT_NOT_AVAILABLE: 'Este lote não está mais disponível para reserva.',
  LOT_NOT_NEGOTIABLE: 'A situação atual do lote não permite iniciar uma negociação.',
  LOT_CANNOT_BE_SOLD: 'A situação atual do lote não permite registrar a venda.',
  lot_reservations_one_active_per_lot: 'Outra reserva ativa já foi registrada para este lote.',
  lot_sales_one_confirmed_per_lot: 'Este lote já possui uma venda confirmada.',
};

function mapErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : typeof error === 'object' && error && 'message' in error ? String(error.message) : '';
  const translated = Object.entries(MAP_ERROR_MESSAGES).find(([code]) => message.includes(code));
  if (translated) return translated[1];
  if (/failed to fetch|network|load failed/i.test(message)) return 'A conexão foi interrompida. Seus dados locais foram preservados; tente novamente.';
  return message || 'Não foi possível concluir a operação.';
}

export function useMapPermissions(): MapPermissions {
  const { myRole } = useCurrentOrg();
  const { capSet } = useCapabilities();
  return resolveMapPermissions(myRole, capSet);
}

export function useCommercialMap() {
  const { orgId } = useCurrentOrg();
  const initializeLayers = useCommercialMapStore((state) => state.initializeLayers);
  const setReferenceOpacity = useCommercialMapStore((state) => state.setReferenceOpacity);
  const syncedCalibration = useRef<string | null>(null);
  const query = useQuery({
    queryKey: ['commercial-map', orgId],
    queryFn: () => fetchCommercialMap(orgId!),
    enabled: Boolean(orgId),
    staleTime: 30_000,
    retry: 1,
  });

  useEffect(() => {
    if (query.data?.layers) initializeLayers(query.data.layers);
  }, [initializeLayers, query.data?.layers]);

  useEffect(() => {
    const calibration = query.data?.calibration;
    if (!calibration) return;
    const calibrationKey = `${calibration.id}:${calibration.version}`;
    if (syncedCalibration.current === calibrationKey) return;
    syncedCalibration.current = calibrationKey;
    setReferenceOpacity(calibration.opacity);
  }, [query.data?.calibration, setReferenceOpacity]);

  return query;
}

export interface MapEntityFilterResult {
  entities: MapEntity[];
  matchingEntityIds: ReadonlySet<string>;
  hasActiveCriteria: boolean;
}

export function useMapEntityFilter(entities: MapEntity[], lots: CommercialLot[]): MapEntityFilterResult {
  const search = useCommercialMapStore((state) => state.search);
  const statusFilters = useCommercialMapStore((state) => state.statusFilters);
  const layerVisibility = useCommercialMapStore((state) => state.layerVisibility);
  const normalizedSearch = search.trim().toLocaleLowerCase('pt-BR');
  const lotByEntity = useMemo(() => new Map(lots.map((lot) => [lot.entityId, lot])), [lots]);

  return useMemo(() => {
    const filteredEntities = entities.filter((entity) => {
      if (layerVisibility[entity.layerId] === false) return false;
      const lot = lotByEntity.get(entity.id);
      if (statusFilters.length > 0 && (!lot || !statusFilters.includes(lot.status))) return false;
      if (!normalizedSearch) return true;
      const haystack = [
        entity.publicIdentifier,
        entity.name,
        entity.description,
        lot?.publicIdentifier,
        lot?.block,
        lot?.lotNumber,
        lot?.displayName,
        lot?.currentBuyer,
        lot?.activeContractNumber,
      ].filter(Boolean).join(' ').toLocaleLowerCase('pt-BR');
      return haystack.includes(normalizedSearch);
    });

    return {
      entities: filteredEntities,
      matchingEntityIds: new Set(filteredEntities.map((entity) => entity.id)),
      hasActiveCriteria: Boolean(normalizedSearch || statusFilters.length > 0),
    };
  }, [entities, layerVisibility, lotByEntity, normalizedSearch, statusFilters]);
}

export function useFilteredMapEntities(entities: MapEntity[], lots: CommercialLot[]) {
  return useMapEntityFilter(entities, lots).entities;
}

export function useMapMutations() {
  const queryClient = useQueryClient();
  const { orgId } = useCurrentOrg();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['commercial-map', orgId] });
  const errorMessage = mapErrorMessage;

  const bootstrap = useMutation({
    mutationFn: () => bootstrapOfficialReference(orgId!),
    onSuccess: async () => {
      await invalidate();
      toast.success('Cartografia oficial 2026 sincronizada como rascunho auditável.');
    },
    onError: (error) => toast.error('Falha ao iniciar a base cartográfica', { description: errorMessage(error) }),
  });
  const geometry = useMutation({
    mutationFn: saveGeometryRevision,
    onSuccess: async () => {
      await invalidate();
      toast.success('Nova revisão geométrica salva.');
    },
    onError: (error) => toast.error('A geometria não foi salva', { description: errorMessage(error) }),
  });
  const lotCreation = useMutation({
    mutationFn: createCommercialLot,
    onSuccess: async () => {
      await invalidate();
      toast.success('Lote criado como geometria auditável.');
    },
    onError: (error) => toast.error('O lote não foi criado', { description: errorMessage(error) }),
  });
  const calibration = useMutation({
    mutationFn: saveMapCalibration,
    onSuccess: async () => {
      await invalidate();
      toast.success('Nova versão de calibração salva.');
    },
    onError: (error) => toast.error('A calibração não foi salva', { description: errorMessage(error) }),
  });
  const split = useMutation({
    mutationFn: splitCommercialLot,
    onSuccess: async () => {
      await invalidate();
      toast.success('Lote dividido com linhagem e auditoria preservadas.');
    },
    onError: (error) => toast.error('O lote não foi dividido', { description: errorMessage(error) }),
  });
  const lotUpdate = useMutation({
    mutationFn: updateCommercialLot,
    onSuccess: async () => {
      await invalidate();
      toast.success('Cadastro e preço do lote atualizados com auditoria.');
    },
    onError: (error) => toast.error('O lote não foi atualizado', { description: errorMessage(error) }),
  });
  const layerLock = useMutation({
    mutationFn: setMapLayerLock,
    onSuccess: async () => {
      await invalidate();
      toast.success('Bloqueio da camada atualizado.');
    },
    onError: (error) => toast.error('A camada não foi alterada', { description: errorMessage(error) }),
  });
  const verification = useMutation({
    mutationFn: setMapEntityVerification,
    onSuccess: async () => {
      await invalidate();
      toast.success('Estado de verificação atualizado.');
    },
    onError: (error) => toast.error('A verificação não foi alterada', { description: errorMessage(error) }),
  });
  const publish = useMutation({
    mutationFn: publishCommercialMap,
    onSuccess: async () => {
      await invalidate();
      toast.success('Nova versão do mapa publicada para a equipe.');
    },
    onError: (error) => toast.error('O mapa não foi publicado', { description: errorMessage(error) }),
  });
  const merge = useMutation({
    mutationFn: mergeCommercialLots,
    onSuccess: async () => {
      await invalidate();
      toast.success('Lotes mesclados com linhagem e auditoria preservadas.');
    },
    onError: (error) => toast.error('Os lotes não foram mesclados', { description: errorMessage(error) }),
  });
  const referenceUpload = useMutation({
    mutationFn: uploadMapReference,
    onError: (error) => toast.error('Falha no envio da referência', { description: errorMessage(error) }),
  });
  const reservation = useMutation({
    mutationFn: reserveLot,
    onSuccess: async () => {
      await invalidate();
      toast.success('Reserva confirmada e registrada no histórico.');
    },
    onError: (error) => toast.error('Não foi possível reservar o lote', { description: errorMessage(error) }),
  });
  const negotiation = useMutation({
    mutationFn: startLotNegotiation,
    onSuccess: async () => {
      await invalidate();
      toast.success('Negociação iniciada e registrada no histórico.');
    },
    onError: (error) => toast.error('Não foi possível iniciar a negociação', { description: errorMessage(error) }),
  });
  const sale = useMutation({
    mutationFn: registerLotSale,
    onSuccess: async () => {
      await invalidate();
      toast.success('Venda confirmada no mapa comercial.');
    },
    onError: (error) => toast.error('A venda não foi confirmada', { description: errorMessage(error) }),
  });
  const contract = useMutation({
    mutationFn: uploadLotContract,
    onSuccess: async (_data, variables) => {
      await Promise.all([
        invalidate(),
        queryClient.invalidateQueries({ queryKey: ['commercial-map', 'contracts', variables.lotId] }),
      ]);
      toast.success('Contrato armazenado com acesso privado.');
    },
    onError: (error) => toast.error('Falha no envio do contrato', { description: errorMessage(error) }),
  });

  return { bootstrap, geometry, lotCreation, lotUpdate, layerLock, verification, publish, calibration, split, merge, referenceUpload, reservation, negotiation, sale, contract };
}

export function useLotActivity(lotId: string | null) {
  return useQuery({
    queryKey: ['commercial-map', 'activity', lotId],
    queryFn: () => fetchLotActivity(lotId!),
    enabled: Boolean(lotId && !lotId.startsWith('reference:')),
    staleTime: 15_000,
  });
}

export function useLotContractVersions(lotId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['commercial-map', 'contracts', lotId],
    queryFn: () => fetchLotContractVersions(lotId!),
    enabled: Boolean(lotId && enabled && !lotId.startsWith('reference:')),
    staleTime: 4 * 60_000,
  });
}
