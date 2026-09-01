import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { OFFICIAL_REFERENCE_ENTITIES } from '@/features/commercial-map/data/officialReference2026';
import {
  resolveStrategicLandmarkKind,
  strategicLandmarkBounds,
  strategicLandmarkVisualHeight,
} from '@/features/commercial-map/utils/landmarks';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const parkSource = read('src/features/commercial-map/components/canvas/AmusementPark.tsx');
const environmentSource = read('src/features/commercial-map/components/canvas/CommercialMapEnvironment.tsx');
const canvasSource = read('src/features/commercial-map/components/canvas/CommercialMapCanvas.tsx');
const officialSource = read('src/features/commercial-map/data/officialReference2026.ts');
const packageJson = JSON.parse(read('package.json')) as {
  dependencies: Record<string, string>;
};
const park = OFFICIAL_REFERENCE_ENTITIES.find((entity) => entity.publicIdentifier === 'J')!;

describe('Parque de Diversões J', () => {
  it('preserva o footprint oficial e registra J como landmark estratégico', () => {
    expect(officialSource).toContain("[930, 2450, 1600, 3000]");
    expect(resolveStrategicLandmarkKind(park)).toBe('amusement-park');
    const bounds = strategicLandmarkBounds(park);
    expect(bounds.width).toBeCloseTo(14.6182, 4);
    expect(bounds.depth).toBeCloseTo(12, 4);
    expect(strategicLandmarkVisualHeight(park)).toBeGreaterThan(park.geometry.extrusionHeight);
  });

  it('mantém GSAP e Rapier v1 nos trabalhos para os quais foram escolhidos', () => {
    expect(packageJson.dependencies.gsap).toMatch(/^\^3\./);
    expect(packageJson.dependencies['@react-three/rapier']).toMatch(/^\^1\./);
    expect(parkSource).toContain('gsap.timeline({');
    expect(parkSource).toContain('repeat: -1');
    expect(parkSource).toContain('timeline.kill()');
    expect(parkSource).toContain('<Physics paused={!parkActive}');
    expect(parkSource).toContain('body.current.applyImpulse({');
    expect(parkSource).toContain('body.current.applyTorqueImpulse(');
  });

  it('dorme quando inativo e ativa noite, LEDs instanciados e bloom sem point lights', () => {
    expect(parkSource).toContain('if (!parkActive || !wheel.current) return;');
    expect(parkSource).toContain('if (!parkActive || !body.current) return;');
    expect(parkSource).toContain('body.current?.sleep()');
    expect(parkSource).toContain('<instancedMesh');
    expect(parkSource).toContain('emissiveIntensity={parkActive ? 7 : 0}');
    expect(parkSource).not.toMatch(/<pointLight/i);
    expect(canvasSource).toContain("=== 'amusement-park'");
    expect(environmentSource).toContain("nightMode ? '#050916'");
    expect(environmentSource).toContain('<SunrisePostProcessing qualityTier={qualityTier} enabled={active} />');
  });
});
