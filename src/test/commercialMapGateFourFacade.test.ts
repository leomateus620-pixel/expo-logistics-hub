import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  GATE_FOUR_DISTRICT_LAYOUT,
  resolveGateFourInteractionFootprint,
} from '@/features/commercial-map/data/gateFourDistrict';
import { resolveGateFourFacadeDepths } from '@/features/commercial-map/components/canvas/GateFourLandmarks';

vi.mock('@react-three/fiber', () => ({ useThree: vi.fn() }));

describe('acabamentos das duas faces do Portão 4', () => {
  it('mantém faixas, placas e guarnições fora das vigas e dentro do envelope existente', () => {
    const plan = GATE_FOUR_DISTRICT_LAYOUT.gate4;
    const pierWidth = Math.max(0.18, plan.width * 0.13);
    const depths = resolveGateFourFacadeDepths(plan.depth, pierWidth);
    const interactionRing = resolveGateFourInteractionFootprint({ width: 0.96, depth: 0.96 });
    const hitHalfDepth = Math.max(...interactionRing.map(([, z]) => Math.abs(z)));
    const expectedFaceZ = plan.depth * 0.42 + pierWidth * 0.5;

    expect(depths.portalFaceZ).toBeCloseTo(expectedFaceZ, 10);
    [depths.band, depths.plaque, depths.trim, depths.metal].forEach((layer) => {
      [-1, 1].forEach((side) => {
        const centerZ = side * layer.centerZ;
        const innerFace = Math.abs(centerZ) - layer.thickness / 2;
        const outerFace = Math.abs(centerZ) + layer.thickness / 2;
        expect(innerFace).toBeGreaterThan(expectedFaceZ);
        expect(outerFace).toBeLessThan(expectedFaceZ + 0.05);
        expect(outerFace).toBeLessThan(hitHalfDepth);
      });
    });

    expect(depths.trim.centerZ - depths.trim.thickness / 2)
      .toBeGreaterThan(depths.plaque.centerZ + depths.plaque.thickness / 2);
  });

  it('aplica profundidade de face real em ambos os lados, sem multiplicadores que enterravam os acabamentos', () => {
    const source = readFileSync(resolve(
      'src/features/commercial-map/components/canvas/GateFourLandmarks.tsx',
    ), 'utf8').split('export function GateFourLandmark(')[1];

    expect(source).toContain('resolveGateFourFacadeDepths(portalDepth, pierWidth)');
    expect(source).toContain('[-1, 1].flatMap((depthSide)');
    ['band', 'plaque', 'trim', 'metal'].forEach((layer) => {
      expect(source).toContain(`depthSide * facadeDepths.${layer}.centerZ`);
      expect(source).toContain(`facadeDepths.${layer}.thickness`);
    });
    expect(source).not.toMatch(/portalDepth \* 0\.(47|48|49|505)\b/);
  });
});
