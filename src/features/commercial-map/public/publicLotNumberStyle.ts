import { STATUS_CONFIG } from '../constants';
import type { publicAvailability } from './publicAvailability';

export type PublicNumberAvailability = ReturnType<typeof publicAvailability>;

export const PUBLIC_NUMBER_STYLES = {
  AVAILABLE: { background: '#f2fbf4', border: STATUS_CONFIG.AVAILABLE.border, ink: '#173a2a', mark: 'dot' },
  SOLD: { background: '#f5f5ef', border: '#747c75', ink: '#26313b', mark: null },
  UNAVAILABLE: { background: STATUS_CONFIG.BLOCKED.surface, border: STATUS_CONFIG.BLOCKED.border, ink: '#541717', mark: 'bar' },
} as const satisfies Record<PublicNumberAvailability, { background: string; border: string; ink: string; mark: string | null }>;
