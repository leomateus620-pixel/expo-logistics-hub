import type { PortalAccessState } from '@/components/portal/portalTypes';
import type { PortalEntryId } from '@/modules/portal/portalRegistry';

/**
 * Visible microcopy beside each portal card. Phrases are presentation only:
 * the control keeps its functional accessible name, and states that carry a
 * consequence (loading, denied, setup, expanded) stay on a single fixed label.
 * Every phrase is an action the module actually offers; keep them short
 * (≤ 26 characters) so the reserved width works on every viewport.
 */
interface ModulePhrases {
  allowed: readonly string[];
  guest: readonly string[];
}

const DIRECT_PHRASES: Record<Exclude<PortalEntryId, 'comissoes'>, ModulePhrases> = {
  'agenda-fenasoja': {
    allowed: ['Abrir agenda', 'Ver o ciclo oficial', 'Seguir os próximos marcos'],
    guest: ['Entrar na agenda oficial', 'Planejar o ciclo 2028', 'Acompanhar cada marco'],
  },
  'agenda-restaurante-arena': {
    allowed: ['Abrir agenda', 'Ver as reservas', 'Organizar os espaços'],
    guest: ['Entrar para reservar', 'Coordenar os espaços', 'Aprovar cada reserva'],
  },
  'mapa-comercial': {
    allowed: ['Abrir mapa', 'Localizar um lote', 'Consultar disponibilidade'],
    guest: ['Entrar no mapa do parque', 'Explorar lotes e pavilhões', 'Ver a disponibilidade'],
  },
  financeiro: {
    allowed: ['Abrir financeiro', 'Ver o orçamento', 'Acompanhar a execução'],
    guest: ['Entrar no financeiro', 'Acompanhar o orçamento', 'Gerir com segurança'],
  },
  administrador: {
    allowed: ['Abrir administração', 'Gerir permissões', 'Ajustar configurações'],
    guest: ['Entrar na administração', 'Gerir perfis e acessos', 'Configurar o sistema'],
  },
};

const COMMISSION_PHRASES = ['Ver comissões', 'Conhecer as frentes', 'Encontrar sua equipe'] as const;

export function resolvePortalActionPhrases(
  entryId: PortalEntryId,
  state: PortalAccessState,
  expanded: boolean,
  fixedLabel: string,
): readonly string[] {
  if (entryId === 'comissoes') return expanded ? [fixedLabel] : COMMISSION_PHRASES;

  const phrases = DIRECT_PHRASES[entryId];
  if (state === 'allowed') return phrases.allowed;
  if (state === 'login') return phrases.guest;
  return [fixedLabel];
}
