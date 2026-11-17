import { cleanup, render } from '@testing-library/react';
import type { RootState } from '@react-three/fiber';
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PublicSoldCompanyLabels } from '@/features/commercial-map/components/canvas/PublicSoldCompanyLabels';
import { OFFICIAL_REFERENCE_ENTITIES } from '@/features/commercial-map/data/officialReference2026';
import { preparePublicSoldCompanyGeometry } from '@/features/commercial-map/public/publicSoldCompanyGeometry';

const runtime = vi.hoisted(() => ({
  state: {
    gl: { capabilities: { maxTextureSize: 2048, getMaxAnisotropy: () => 1 } },
    // The browser remains portrait even when wrapped page chrome makes its map canvas squat.
    invalidate: vi.fn(), size: { width: 375, height: 363 },
  },
  renderFrame: null as ((state: Pick<RootState, 'camera' | 'size'>) => void) | null,
}));
vi.mock('@react-three/fiber', () => ({
  useThree: (selector: (state: typeof runtime.state) => unknown) => selector(runtime.state),
  useFrame: (callback: NonNullable<typeof runtime.renderFrame>) => { runtime.renderFrame = callback; },
}));

const lots = OFFICIAL_REFERENCE_ENTITIES.filter(entity => ['Q-P-09', 'Q-P-10', 'Q-P-11', 'Q-P-12'].includes(entity.publicIdentifier));
const groups = preparePublicSoldCompanyGeometry([{ key: 'p-grid', tradeName: 'FOROESTE VEICULOS', entityIds: lots.map(lot => lot.id) }], lots);
const [centerX, centerZ] = groups[0].components[0].fitCandidates[0].anchor;

function frame(pixelsPerUnit: number, cameraOffset = 0) {
  const { width, height } = runtime.state.size;
  const halfWidth = width / (2 * pixelsPerUnit), halfHeight = height / (2 * pixelsPerUnit);
  const camera = new THREE.OrthographicCamera(-halfWidth, halfWidth, halfHeight, -halfHeight, .1, 100);
  camera.position.set(centerX + cameraOffset, 40, centerZ);
  camera.up.set(0, 0, -1);
  camera.lookAt(centerX + cameraOffset, 0, centerZ);
  runtime.renderFrame?.({ camera, size: { width, height, left: 0, top: 0 } });
}

beforeEach(() => {
  const context = {
    measureText: (text: string) => {
      const width = Array.from(text).reduce((sum, character) => sum + (/[I. ]/.test(character) ? 16 : 35), 0);
      return { width, actualBoundingBoxLeft: width / 2, actualBoundingBoxRight: width / 2, actualBoundingBoxAscent: 36, actualBoundingBoxDescent: 3 };
    },
    createLinearGradient: () => ({ addColorStop: vi.fn() }),
    beginPath: vi.fn(), rect: vi.fn(), fill: vi.fn(), stroke: vi.fn(), fillText: vi.fn(),
    save: vi.fn(), translate: vi.fn(), scale: vi.fn(), restore: vi.fn(),
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('projected public sold company captions', () => {
  it('shows a single fitted caption at mobile overview, upgrades on zoom and hides outside the viewport', () => {
    const attributes = vi.spyOn(THREE.BufferGeometry.prototype, 'setAttribute');
    render(<PublicSoldCompanyLabels groups={groups} hoveredEntityId={null} selectedEntityId={null} />);
    const opacity = attributes.mock.calls.find(([name]) => name === 'labelOpacity')?.[1] as THREE.BufferAttribute;
    const visible = () => Array.from({ length: opacity.count / 4 }, (_, index) => opacity.getX(index * 4) > 0);
    expect(visible().length).toBeGreaterThan(1);

    // A 25 CSS px group cannot show a recognizable name at the 7 px minimum.
    frame(7.55);
    expect(visible().some(Boolean)).toBe(false);

    // Approximately 45 CSS px across the four-parcel public phone capture.
    frame(13.6);
    expect(visible()[0]).toBe(false);
    expect(visible()[1]).toBe(true);
    expect(visible().filter(Boolean)).toHaveLength(1);

    frame(35);
    expect(visible()[0]).toBe(true);
    expect(visible().filter(Boolean)).toHaveLength(1);

    frame(13.6);
    expect(visible()[1]).toBe(true);
    expect(visible().filter(Boolean)).toHaveLength(1);

    frame(13.6, 75);
    expect(visible().some(Boolean)).toBe(false);
  });
});
