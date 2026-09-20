import type { PublicLot } from './publicMapTypes';

/**
 * Escopo de interação da consulta pública.
 *
 * O cenário exibido é o parque inteiro (contexto cartográfico), mas somente os
 * lotes vinculados ao link podem ser inspecionados. A autorização é derivada
 * exclusivamente do vínculo oficial devolvido pelo servidor — nunca por
 * posição, proximidade, cor, nome ou prefixo.
 */
export interface PublicInteractionScope {
  /** IDs de entidade (lote) que o link autoriza a inspecionar. */
  interactiveEntityIds: ReadonlySet<string>;
}

export function buildPublicInteractionScope(lots: readonly PublicLot[]): PublicInteractionScope {
  return { interactiveEntityIds: new Set(lots.map((lot) => lot.entityId)) };
}

/** Verificação única usada por clique, toque, hover, teclado, lista, busca e URL. */
export function canInspectLot(
  scope: PublicInteractionScope | null | undefined,
  entityId: string | null | undefined,
): boolean {
  if (!entityId) return false;
  // Sem escopo público (mapa administrativo, comissões, vendas) nada muda.
  if (!scope) return true;
  return scope.interactiveEntityIds.has(entityId);
}

/** Lote autorizado a partir do identificador do próprio lote (lista/busca/URL). */
export function canInspectLotId(
  lots: readonly PublicLot[],
  lotId: string | null | undefined,
): boolean {
  if (!lotId) return false;
  return lots.some((lot) => lot.id === lotId);
}
