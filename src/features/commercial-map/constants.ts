import type { CommercialStatus, MapClassification, MapLayer, VerificationStatus } from './types';

export const MAP_REFERENCE_WIDTH = 120;
/** Park-only crop of the official 2026 PDF: 5,500 x 4,150 PDF points. */
export const MAP_REFERENCE_HEIGHT = 90.545455;
export const OFFICIAL_REFERENCE_IMAGE = '/maps/fenasoja-oficial-2026-park.webp';

export const CLASSIFICATION_LABELS: Record<MapClassification, string> = {
  SELLABLE_LOT: 'Lote comercial',
  INTERNAL_STAND: 'Estande interno',
  QUADRA: 'Quadra',
  PAVILION: 'Pavilhão',
  BUILDING: 'Edificação permanente',
  RESTAURANT: 'Restaurante',
  FOOD_AREA: 'Área de alimentação',
  RESTROOM: 'Sanitário / fraldário',
  CHEMICAL_RESTROOM: 'Banheiro químico',
  GATE: 'Portão',
  PARKING: 'Estacionamento',
  ROAD: 'Rua / circulação veicular',
  PEDESTRIAN_PATH: 'Circulação de pedestres',
  GREEN_AREA: 'Área verde',
  TREE: 'Árvore',
  WATER: 'Lago / água',
  ADMINISTRATION: 'Administração',
  SECURITY: 'Segurança pública',
  EMERGENCY: 'Emergência / primeiros socorros',
  SERVICE: 'Estrutura de serviço',
  ATTRACTION: 'Atração / área de visitantes',
  EVENT_VENUE: 'Arena / espaço de eventos',
  LIVESTOCK_AREA: 'Área pecuária',
  RURAL_EXHIBITION: 'Exporural',
  RESTRICTED_AREA: 'Área restrita',
  LANDMARK: 'Marco de referência',
  OTHER: 'Estrutura a classificar',
};

export const VERIFICATION_LABELS: Record<VerificationStatus, string> = {
  DRAFT: 'Rascunho',
  NEEDS_REVIEW: 'Precisa de revisão',
  VERIFIED: 'Verificado',
  ARCHIVED: 'Arquivado',
};

export const STATUS_CONFIG: Record<CommercialStatus, {
  label: string;
  shortLabel: string;
  color: string;
  surface: string;
  border: string;
  symbol: string;
  description: string;
}> = {
  AVAILABLE: {
    label: 'Disponível', shortLabel: 'Disponível', color: '#22c55e', surface: '#dcfce7', border: '#15803d', symbol: '✓',
    description: 'Lote liberado para proposta comercial.',
  },
  RESERVED: {
    label: 'Reservado', shortLabel: 'Reservado', color: '#f59e0b', surface: '#fef3c7', border: '#b45309', symbol: '◷',
    description: 'Reserva ativa com prazo de expiração.',
  },
  IN_NEGOTIATION: {
    label: 'Em negociação', shortLabel: 'Negociação', color: '#3b82f6', surface: '#dbeafe', border: '#1d4ed8', symbol: '⇄',
    description: 'Negociação comercial em andamento.',
  },
  SOLD: {
    label: 'Vendido', shortLabel: 'Vendido', color: '#7c3aed', surface: '#ede9fe', border: '#5b21b6', symbol: '◆',
    description: 'Venda confirmada e vinculada ao contrato.',
  },
  BLOCKED: {
    label: 'Bloqueado', shortLabel: 'Bloqueado', color: '#ef4444', surface: '#fee2e2', border: '#b91c1c', symbol: '⌧',
    description: 'Lote bloqueado por decisão administrativa.',
  },
  UNAVAILABLE: {
    label: 'Indisponível', shortLabel: 'Indisponível', color: '#64748b', surface: '#e2e8f0', border: '#475569', symbol: '—',
    description: 'Espaço fora do fluxo comercial.',
  },
};

export const CLASSIFICATION_COLORS: Record<MapClassification, string> = {
  SELLABLE_LOT: '#3cab57',
  INTERNAL_STAND: '#62bd72',
  QUADRA: '#24543a',
  PAVILION: '#56616e',
  BUILDING: '#7b746b',
  RESTAURANT: '#ee7b22',
  FOOD_AREA: '#f0b429',
  RESTROOM: '#1d74aa',
  CHEMICAL_RESTROOM: '#168eb8',
  GATE: '#f4cd21',
  PARKING: '#d4b985',
  ROAD: '#3b332f',
  PEDESTRIAN_PATH: '#b8ad99',
  GREEN_AREA: '#75bf48',
  TREE: '#3c8b42',
  WATER: '#6fb6cf',
  ADMINISTRATION: '#cf8e76',
  SECURITY: '#313a3c',
  EMERGENCY: '#e63946',
  SERVICE: '#497c77',
  ATTRACTION: '#72a8b5',
  EVENT_VENUE: '#f28c1b',
  LIVESTOCK_AREA: '#d9c06a',
  RURAL_EXHIBITION: '#6fba43',
  RESTRICTED_AREA: '#c05b52',
  LANDMARK: '#b48bcb',
  OTHER: '#91a291',
};

export const DEFAULT_REFERENCE_LAYERS: MapLayer[] = [
  ['quadras', 'Quadras', '#24543a', 5],
  ['commercial', 'Lotes comerciais', '#38a553', 10],
  ['pavilions', 'Pavilhões', '#5d6874', 20],
  ['structures', 'Estruturas permanentes', '#827b72', 30],
  ['food', 'Alimentação', '#ee7b22', 40],
  ['restrooms', 'Banheiros', '#1ba8c7', 50],
  ['safety', 'Emergência e segurança', '#d83c45', 60],
  ['gates', 'Portões', '#f4cd21', 70],
  ['parking', 'Estacionamentos', '#c9ad79', 80],
  ['circulation', 'Ruas e circulação', '#3b332f', 90],
  ['green', 'Áreas verdes', '#6fb846', 100],
  ['exporural', 'Exporural e pecuária', '#69ae42', 120],
  ['reference', 'Referência oficial 2026', '#94a3b8', 130],
].map(([key, name, color, sortOrder]) => ({
  id: `reference:${key}`,
  projectId: 'reference:fenasoja-2026',
  key: String(key),
  name: String(name),
  description: null,
  color: String(color),
  opacity: key === 'reference' ? 0.34 : 1,
  isVisible: true,
  isLocked: key === 'reference',
  sortOrder: Number(sortOrder),
}));

export const CAMERA_PRESETS = {
  overview: { label: 'Visão geral', position: [0, 96, 108] as const, target: [0, 0, 1] as const },
  top: { label: 'Vista superior', position: [0, 142, 0.1] as const, target: [0, 0, 0] as const },
  isometric: { label: 'Isométrica', position: [82, 76, 88] as const, target: [2, 0, 2] as const },
  commercial: { label: 'Área comercial', position: [-1, 49, 47] as const, target: [-4, 0, 2] as const },
  pavilions: { label: 'Pavilhões', position: [-22, 42, 58] as const, target: [-14, 0, 24] as const },
  parking: { label: 'Estacionamentos', position: [47, 58, 35] as const, target: [37, 0, 24] as const },
  gates: { label: 'Portões', position: [3, 100, 105] as const, target: [0, 0, 3] as const },
};

export const MAP_CAPABILITIES = [
  'map.view',
  'map.edit',
  'map.edit_geometry',
  'map.manage_lots',
  'map.manage_sales',
  'map.manage_contracts',
  'map.manage_layers',
  'map.admin',
] as const;
