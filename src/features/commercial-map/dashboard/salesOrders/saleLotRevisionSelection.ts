import { toCommercialPhase, type CommercialLot, type MapEntity } from '../../types';

export interface SaleLotScope {
  key: string;
  label: string;
  projectId: string;
}

const fold = (value: string | null | undefined) => (value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .toLocaleLowerCase('pt-BR');

export function scopeForLot(lot: CommercialLot, entities: readonly MapEntity[]): SaleLotScope | null {
  const entity = entities.find((candidate) => candidate.id === lot.entityId);
  if (!entity) return null;
  const parent = entity.parentEntityId
    ? entities.find((candidate) => candidate.id === entity.parentEntityId)
    : null;
  if (parent) {
    return {
      key: `parent:${parent.id}`,
      label: parent.name || parent.publicIdentifier,
      projectId: entity.projectId,
    };
  }
  if (entity.segmentId) {
    return {
      key: `segment:${entity.segmentId}`,
      label: lot.block ? `Quadra ${lot.block}` : 'Área externa',
      projectId: entity.projectId,
    };
  }
  return null;
}

export function searchableLotText(lot: CommercialLot, location: string): string {
  return fold([lot.lotNumber, lot.displayName, lot.publicIdentifier, lot.block, location].filter(Boolean).join(' '));
}

export function matchesLotSearch(lot: CommercialLot, location: string, search: string): boolean {
  const query = fold(search);
  return Boolean(query) && searchableLotText(lot, location).includes(query);
}

export function commercialStatusLabel(lot: CommercialLot): string {
  const phase = toCommercialPhase(lot.status);
  if (phase === 'AVAILABLE') return 'Disponível';
  if (phase === 'SALE_OPEN') return 'Venda em aberto';
  if (phase === 'SOLD') return 'Vendido';
  return 'Bloqueado';
}

export function candidateDisabledReason(lot: CommercialLot, price: number | null): string | null {
  if (lot.status !== 'AVAILABLE') return commercialStatusLabel(lot);
  if (price === null) return 'Sem preço oficial';
  return null;
}

export function buildAutomaticRevisionReason(addedLabels: readonly string[], removedLabels: readonly string[]): string {
  const parts: string[] = [];
  if (addedLabels.length) parts.push(`Adicionados: ${addedLabels.join(', ')}`);
  if (removedLabels.length) parts.push(`Retirados: ${removedLabels.join(', ')}`);
  return parts.join('; ') || 'Valores ou parcelas da venda atualizados';
}