import type { CommercialStatus, MapClassification, MapLayer, VerificationStatus } from './types';

export const MAP_REFERENCE_WIDTH = 120;
export const MAP_REFERENCE_HEIGHT = 67.5;
export const OFFICIAL_REFERENCE_IMAGE = '/maps/fenasoja-oficial-2024-optimized.webp';

export const CLASSIFICATION_LABELS: Record<MapClassification, string> = {
  SELLABLE_LOT: 'Lote comercial',
  INTERNAL_STAND: 'Estande interno',
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
  PAVILION: '#56616e',
  BUILDING: '#7b746b',
  RESTAURANT: '#ee7b22',
  FOOD_AREA: '#f0b429',
  RESTROOM: '#8d7158',
  CHEMICAL_RESTROOM: '#16a7c9',
  GATE: '#f4cd21',
  PARKING: '#d4b985',
  ROAD: '#b8bab6',
  PEDESTRIAN_PATH: '#d9d6cd',
  GREEN_AREA: '#75bf48',
  TREE: '#3c8b42',
  WATER: '#6fb6cf',
  ADMINISTRATION: '#cf8e76',
  SECURITY: '#313a3c',
  EMERGENCY: '#e63946',
  SERVICE: '#497c77',
  ATTRACTION: '#72a8b5',
  LIVESTOCK_AREA: '#d9c06a',
  RURAL_EXHIBITION: '#6fba43',
  RESTRICTED_AREA: '#c05b52',
  LANDMARK: '#b48bcb',
  OTHER: '#91a291',
};

export const DEFAULT_REFERENCE_LAYERS: MapLayer[] = [
  ['commercial', 'Lotes comerciais', '#38a553', 10],
  ['pavilions', 'Pavilhões', '#5d6874', 20],
  ['structures', 'Estruturas permanentes', '#827b72', 30],
  ['food', 'Alimentação', '#ee7b22', 40],
  ['restrooms', 'Banheiros', '#1ba8c7', 50],
  ['safety', 'Emergência e segurança', '#d83c45', 60],
  ['gates', 'Portões', '#f4cd21', 70],
  ['parking', 'Estacionamentos', '#c9ad79', 80],
  ['circulation', 'Ruas e circulação', '#b8bab6', 90],
  ['green', 'Áreas verdes', '#6fb846', 100],
  ['water', 'Água', '#6fb6cf', 110],
  ['exporural', 'Exporural', '#69ae42', 120],
  ['reference', 'Referência original', '#94a3b8', 130],
].map(([key, name, color, sortOrder]) => ({
  id: `reference:${key}`,
  projectId: 'reference:fenasoja-2024',
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
  overview: { label: 'Visão geral', position: [0, 68, 72] as const, target: [0, 0, 0] as const },
  top: { label: 'Vista superior', position: [0, 98, 0.1] as const, target: [0, 0, 0] as const },
  isometric: { label: 'Isométrica', position: [63, 58, 63] as const, target: [0, 0, 0] as const },
  commercial: { label: 'Área comercial', position: [-3, 42, 39] as const, target: [-1, 0, 6] as const },
  pavilions: { label: 'Pavilhões', position: [-14, 34, 54] as const, target: [-8, 0, 21] as const },
  parking: { label: 'Estacionamentos', position: [-40, 48, -20] as const, target: [-33, 0, -20] as const },
  gates: { label: 'Portões', position: [2, 72, 72] as const, target: [0, 0, 10] as const },
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
