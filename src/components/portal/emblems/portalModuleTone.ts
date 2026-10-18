import type { PortalEntryId } from '@/modules/portal/portalRegistry';
import { PORTAL_MODULE_SYMBOLS } from './portalModuleSymbols';
import '@/styles/portal-module-tones.css';

/**
 * Data attributes that bind an element to its module tone. Any element with
 * the `portal-tone` class plus these attributes exposes `--pe-plate`,
 * `--pe-accent`, `--pe-accent-deep` and `--pe-support`.
 */
export function getPortalModuleTone(module: PortalEntryId) {
  const { plate, accent, support } = PORTAL_MODULE_SYMBOLS[module];
  return {
    'data-plate': plate,
    'data-accent': accent,
    'data-support': support,
  } as const;
}
