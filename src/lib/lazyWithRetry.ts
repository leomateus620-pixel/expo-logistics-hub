import { lazy, type ComponentType } from 'react';

const RELOAD_FLAG = 'lovable:chunk-reload';

/**
 * Lazy loader resilient to stale chunk hashes after a new deploy.
 * On a dynamic import failure it forces a single hard reload so the
 * browser fetches the fresh index/manifest instead of a 404 chunk.
 */
export function lazyWithRetry<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
) {
  return lazy(async () => {
    try {
      const mod = await factory();
      window.sessionStorage.removeItem(RELOAD_FLAG);
      return mod;
    } catch (error) {
      const alreadyReloaded = window.sessionStorage.getItem(RELOAD_FLAG) === '1';
      if (!alreadyReloaded) {
        window.sessionStorage.setItem(RELOAD_FLAG, '1');
        window.location.reload();
        // Keep the suspense boundary pending while the reload happens.
        return await new Promise<{ default: T }>(() => {});
      }
      throw error;
    }
  });
}
