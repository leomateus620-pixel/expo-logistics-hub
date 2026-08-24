export interface HydrologicalNodePresentationColors {
  body: string;
  top: string;
  accessory: string;
  ring: string;
}

/**
 * Single semantic color contract shared by the Three.js renderer and the PT-BR legend.
 * Values are authored in sRGB and node materials render them without tone mapping.
 */
export const HYDROLOGICAL_PRESENTATION_PALETTE = {
  pipes: {
    distribution: '#20A9DC',
    hydrantSupply: '#D94945',
  },
  nodes: {
    TAP: {
      body: '#20A9DC',
      top: '#D5F0F8',
      accessory: '#E8F7FB',
      ring: '#20A9DC',
    },
    HYDRANT: {
      body: '#2A9B61',
      top: '#DC433F',
      accessory: '#E8F7FB',
      ring: '#DC433F',
    },
    RESERVOIR: {
      body: '#7698AA',
      top: '#EEF3F5',
      accessory: '#D5F0F8',
      ring: '#7698AA',
    },
    WELL: {
      body: '#FFFFFF',
      top: '#D5F0F8',
      accessory: '#3294BD',
      ring: '#3294BD',
    },
    VALVE: {
      body: '#F0A33B',
      top: '#FFE4A6',
      accessory: '#FFF2D5',
      ring: '#F0A33B',
    },
    TECHNICAL_MARKER: {
      body: '#EEF3F5',
      top: '#7A8F9B',
      accessory: '#55717E',
      ring: '#7A8F9B',
    },
    JUNCTION: {
      body: '#56727A',
      top: '#8CA4AA',
      accessory: '#8CA4AA',
      ring: '#8CA4AA',
    },
    SUPPLY_ENTRY: {
      body: '#0F6497',
      top: '#D64A46',
      accessory: '#E8F7FB',
      ring: '#0F6497',
    },
  } satisfies Record<string, HydrologicalNodePresentationColors>,
} as const;

export type HydrologicalPresentationPalette = typeof HYDROLOGICAL_PRESENTATION_PALETTE;
