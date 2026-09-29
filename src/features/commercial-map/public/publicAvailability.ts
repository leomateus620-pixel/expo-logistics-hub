import type { PublicLotAvailability } from './publicMapTypes';

/** Presentation compatibility with old RPC deployments; internal sale state is untouched. */
export function publicAvailability(value: PublicLotAvailability): 'AVAILABLE' | 'SOLD' | 'UNAVAILABLE' {
  if (value === 'AVAILABLE') return 'AVAILABLE';
  if (value === 'SOLD' || value === 'SALE_OPEN') return 'SOLD';
  return 'UNAVAILABLE';
}
