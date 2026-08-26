import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ReactElement } from 'react';
import {
  EXECUTIVE_CHARACTER_PROFILES,
  SEATED_EXECUTIVE_CLIP,
} from '@/features/commercial-map/data/executiveCharacters';
import { OFFICIAL_REFERENCE_ENTITIES } from '@/features/commercial-map/data/officialReference2026';
import { SeatedExecutiveErrorBoundary } from '@/features/commercial-map/components/canvas/executives/SeatedExecutiveErrorBoundary';
import {
  HEADQUARTERS_EXECUTIVE_CAMERA,
  HEADQUARTERS_EXECUTIVE_COMPACT_WIDTH,
  HEADQUARTERS_SOFA_LAYOUT,
  interiorSupportsSeatedExecutives,
  shouldUseCompactExecutiveCamera,
} from '@/features/commercial-map/utils/seatedExecutiveExperience';

function BrokenSeatedAsset(): ReactElement {
  throw new Error('SeatedIdle indisponivel');
}

describe('personagens sentados na Casa da Soja', () => {
  afterEach(() => vi.restoreAllMocks());

  it('isola uma falha dos GLBs sem remover o restante do interior', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <div>
        <span>Interior B12 preservado</span>
        <SeatedExecutiveErrorBoundary>
          <BrokenSeatedAsset />
        </SeatedExecutiveErrorBoundary>
        <SeatedExecutiveErrorBoundary>
          <span>Djeison preservado</span>
        </SeatedExecutiveErrorBoundary>
      </div>,
    );

    expect(screen.getByText('Interior B12 preservado')).toBeInTheDocument();
    expect(screen.getByText('Djeison preservado')).toBeInTheDocument();
  });

  it('consome SeatedIdle e posiciona os dois rigs no referencial local do sofa', () => {
    expect(SEATED_EXECUTIVE_CLIP).toBe('SeatedIdle');
    const profiles = Object.values(EXECUTIVE_CHARACTER_PROFILES);
    expect(profiles).toHaveLength(2);
    expect(EXECUTIVE_CHARACTER_PROFILES['fabiano-soltis'].heightMeters).toBe(1.78);
    expect(EXECUTIVE_CHARACTER_PROFILES['djeison-drey'].heightMeters).toBe(1.84);
    expect(profiles.map((profile) => profile.assetUrl).sort()).toEqual([
      '/models/executives/djeison-drey.glb',
      '/models/executives/fabiano-soltis.glb',
    ]);
    profiles.forEach((profile) => {
      const [x, y, z] = profile.seated.position;
      const usableHalfWidth = HEADQUARTERS_SOFA_LAYOUT.width / 2
        - HEADQUARTERS_SOFA_LAYOUT.usableInset;
      expect(x).toBeGreaterThanOrEqual(HEADQUARTERS_SOFA_LAYOUT.center[0] - usableHalfWidth);
      expect(x).toBeLessThanOrEqual(HEADQUARTERS_SOFA_LAYOUT.center[0] + usableHalfWidth);
      expect(y).toBe(0);
      expect(z).toBeGreaterThan(-1.35);
      expect(z).toBeLessThan(-1.05);
    });
    const separation = Math.abs(
      EXECUTIVE_CHARACTER_PROFILES['djeison-drey'].seated.position[0]
      - EXECUTIVE_CHARACTER_PROFILES['fabiano-soltis'].seated.position[0],
    );
    expect(separation).toBeGreaterThanOrEqual(0.72);
    expect(HEADQUARTERS_SOFA_LAYOUT.seatTopY).toBeCloseTo(0.49, 2);

    expect(HEADQUARTERS_EXECUTIVE_CAMERA.desktopPosition[0]).toBeCloseTo(
      HEADQUARTERS_SOFA_LAYOUT.center[0],
      1,
    );
    expect(HEADQUARTERS_EXECUTIVE_CAMERA.compactPosition[0]).toBeCloseTo(
      HEADQUARTERS_SOFA_LAYOUT.center[0],
      1,
    );
    expect(HEADQUARTERS_EXECUTIVE_CAMERA.target[0]).toBe(HEADQUARTERS_SOFA_LAYOUT.center[0]);
    expect(HEADQUARTERS_EXECUTIVE_CAMERA.target[2]).toBeGreaterThan(HEADQUARTERS_SOFA_LAYOUT.center[2]);
    expect(HEADQUARTERS_EXECUTIVE_CAMERA.desktopPosition[2]).toBeGreaterThan(2.5);
    expect(HEADQUARTERS_EXECUTIVE_CAMERA.desktopPosition[2]).toBeLessThan(3);
    expect(HEADQUARTERS_EXECUTIVE_CAMERA.target[1]).toBeLessThan(0.9);
    expect(HEADQUARTERS_EXECUTIVE_CAMERA.compactPosition[2]).toBeGreaterThan(
      HEADQUARTERS_EXECUTIVE_CAMERA.desktopPosition[2],
    );
  });

  it('monta a camada somente dentro de HeadquartersInteriorScene', () => {
    const headquarters = readFileSync(
      resolve('src/features/commercial-map/components/canvas/HeadquartersInteriorScene.tsx'),
      'utf8',
    );
    const canvas = readFileSync(
      resolve('src/features/commercial-map/components/canvas/CommercialMapCanvas.tsx'),
      'utf8',
    );
    const page = readFileSync(
      resolve('src/features/commercial-map/CommercialMapPage.tsx'),
      'utf8',
    );

    expect(headquarters).toContain('interiorSupportsSeatedExecutives(entity)');
    expect(headquarters).toContain('<Suspense fallback={null}>');
    expect(headquarters).toContain('<SeatedExecutiveCharacters reducedGraphics={reducedGraphics} />');
    expect(headquarters).not.toContain('rotation={[0, facing, 0]} dispose={null}');
    expect(
      readFileSync(
        resolve('src/features/commercial-map/components/canvas/executives/SeatedExecutiveCharacters.tsx'),
        'utf8',
      ),
    ).toContain('<primitive object={prepared.model} dispose={null} />');
    expect(canvas).toContain("interiorKind === 'fenasoja-headquarters'");
    expect(canvas).not.toContain('ExecutiveCharacterExperience');
    expect(page).not.toContain('ExecutiveCharacterControls');
    expect(page).not.toContain('Circuito executivo');
  });

  it('adapta o enquadramento ao canvas estreito e a preferencia de movimento', () => {
    expect(HEADQUARTERS_EXECUTIVE_COMPACT_WIDTH).toBe(820);
    expect(shouldUseCompactExecutiveCamera(639, 700)).toBe(true);
    expect(shouldUseCompactExecutiveCamera(640, 700)).toBe(true);
    expect(shouldUseCompactExecutiveCamera(641, 700)).toBe(true);
    expect(shouldUseCompactExecutiveCamera(819, 700)).toBe(true);
    expect(shouldUseCompactExecutiveCamera(820, 700)).toBe(true);
    expect(shouldUseCompactExecutiveCamera(821, 700)).toBe(false);
    expect(shouldUseCompactExecutiveCamera(900, 1_000)).toBe(true);

    const characters = readFileSync(
      resolve('src/features/commercial-map/components/canvas/executives/SeatedExecutiveCharacters.tsx'),
      'utf8',
    );
    expect(characters).toContain("matchMedia('(prefers-reduced-motion: reduce)')");
    expect(characters).toContain("query.addEventListener?.('change', updatePreference)");
    expect(characters).toContain('if (reducedMotion || typeof window');
    expect(characters).toContain('mixer.timeScale = reducedMotion ? 0 : 1');
    expect(characters).not.toContain('const reducedMotion = false');
    expect(characters).not.toContain('useFrame(() =>');
  });

  it('usa o kind oficial do interior para limitar a experiencia a sede Fenasoja', () => {
    const b12 = OFFICIAL_REFERENCE_ENTITIES.find((entity) => entity.publicIdentifier === 'B12');
    const b11 = OFFICIAL_REFERENCE_ENTITIES.find((entity) => entity.publicIdentifier === 'B11');
    expect(b12).toBeDefined();
    expect(b11).toBeDefined();
    expect(interiorSupportsSeatedExecutives(b12!)).toBe(true);
    expect(interiorSupportsSeatedExecutives(b11!)).toBe(false);
  });

  it('remove contratos externos de rota, foco e acompanhamento do store', () => {
    const store = readFileSync(
      resolve('src/features/commercial-map/state/useCommercialMapStore.ts'),
      'utf8',
    );
    expect(store).not.toContain('executiveFocusActive');
    expect(store).not.toContain('executiveTarget');
    expect(store).not.toContain('executiveCameraOffset');
    expect(store).not.toContain('executiveInteractionPhase');
  });
});
