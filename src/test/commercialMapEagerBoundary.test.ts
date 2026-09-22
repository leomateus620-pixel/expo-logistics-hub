import { describe, expect, it, vi } from 'vitest';

// The data/UI route must be evaluable before renderer dependencies arrive.
// Geometry constructors stay behind the existing dynamic Canvas import.
vi.mock('three', () => { throw new Error('Three imported before the lazy renderer'); });
vi.mock('three-stdlib', () => { throw new Error('Three stdlib imported before the lazy renderer'); });

describe('map metadata and UI renderer boundary', () => {
  it('loads landmark metadata and viewport controls without importing renderer code', async () => {
    const [landmarks, viewport] = await Promise.all([
      import('@/features/commercial-map/utils/landmarks'),
      import('@/features/commercial-map/utils/contextualViewport'),
    ]);
    expect(landmarks.resolveStrategicLandmarkKind).toBeTypeOf('function');
    expect(viewport.readContextualViewportInsets).toBeTypeOf('function');
  });

  it('evaluates the full commercial route without Three before any query or Canvas mounts', async () => {
    const route = await import('@/pages/CommercialMapPage');
    expect(route.default).toBeTypeOf('function');
  });
});
