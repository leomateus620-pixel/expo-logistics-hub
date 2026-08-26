import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string) {
  return readFileSync(resolve(path), 'utf8');
}

describe('integração compartilhada dos acessos externos do mapa comercial', () => {
  const canvas = source(
    'src/features/commercial-map/components/canvas/CommercialMapCanvas.tsx',
  );

  it('monta infraestrutura e ambientação no mapa completo e no segmento industrial', () => {
    expect(canvas).toContain("import { ParkAccessEnvironmentLayer } from './ParkAccessEnvironmentLayer';");
    expect(canvas).toContain("import { ParkAccessInfrastructure } from './ParkAccessInfrastructure';");
    expect(canvas).toContain('selectParkAccessCompatibleTreesForPresentation(sceneTrees)');
    expect(canvas).toContain('(!isolatedArea || isolatedArea === COMMERCIAL_MAP_SEGMENT_IDS.industry)');
    expect(canvas).toContain('!hydrologicalModeActive');
    expect(canvas).toContain('<ParkAccessEnvironmentLayer');
    expect(canvas).toContain('surfacesVisible={parkAccessPresentation.surfaces.visible}');
    expect(canvas).toContain('surfaceOpacity={parkAccessPresentation.surfaces.opacity}');
    expect(canvas).toContain('architectureVisible={parkAccessPresentation.architecture.visible}');
    expect(canvas).toContain('architectureOpacity={parkAccessPresentation.architecture.opacity}');
    expect(canvas).toContain('vegetationVisible={treesVisible}');
  });

  it('substitui somente o visual genérico de A1-A3 e preserva seleção e labels', () => {
    expect(canvas).toContain('Object.values(PARK_ACCESS_SPATIAL_PLAN.gates)');
    expect(canvas).toContain('gate.officialEntityIdentifier');
    expect(canvas).toContain('visible={!usesDetailedParkAccessArchitecture}');
    expect(canvas).toContain('onClick: (event: ThreeEvent<MouseEvent>) => {');
    expect(canvas).toContain('onSelect(entity.id);');
    expect(canvas).toContain('<EntityLabel');

    const detailedHitTarget = canvas.indexOf('detailedParkAccessHitArea.width');
    const detailedVisualGuard = canvas.indexOf('visible={!usesDetailedParkAccessArchitecture}');
    expect(canvas).toContain('rotationRadians: Math.PI / 2 - gate.approachHeadingRadians');
    expect(canvas).toContain('<boxGeometry args={[');
    expect(canvas).toContain('<cylinderGeometry args={[0.72, 0.72, 1.18, 10]} />');
    expect(detailedHitTarget).toBeGreaterThan(-1);
    expect(detailedVisualGuard).toBeGreaterThan(detailedHitTarget);
  });

  it('mantém a nova cena estática, não interativa e isolada de backend e regras comerciais', () => {
    const implementation = [
      'src/features/commercial-map/components/canvas/ParkAccessEnvironmentLayer.tsx',
      'src/features/commercial-map/components/canvas/ParkAccessInfrastructure.tsx',
      'src/features/commercial-map/data/parkAccessEnvironment.ts',
      'src/features/commercial-map/data/parkAccessSpatialPlan.ts',
      'src/features/commercial-map/utils/parkAccessArchitecture.ts',
      'src/features/commercial-map/utils/parkAccessEnvironment.ts',
      'src/features/commercial-map/utils/parkAccessInfrastructure.ts',
      'src/features/commercial-map/utils/parkAccessSpatialPlanAdapter.ts',
    ].map(source).join('\n');

    expect(implementation).not.toContain('useFrame');
    expect(implementation).not.toContain('@supabase');
    expect(implementation).not.toContain('supabase/');
    expect(implementation).not.toContain('react-router');
    expect(implementation).not.toContain('navigate(');
    expect(implementation).not.toContain('CommercialMapRepository');
    expect(implementation).not.toContain('updateLot');
  });
});
