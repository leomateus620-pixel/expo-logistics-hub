import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PARK_LOCAL_BOUNDS } from '../features/commercial-map/data/regional-highways';
import {
  REGIONAL_LANDSCAPE_DRAW_CALL_BUDGET,
  REGIONAL_LANDSCAPE_INSTANCE_BUDGET,
  buildRegionalLandscapePlan,
  regionalLandscapeDiagnostics,
  regionalLandscapePointIsClear,
  type RegionalLandscapeQualityTier,
} from '../features/commercial-map/utils/regionalLandscape';

const source = (path: string) => readFileSync(resolve(path), 'utf8').replace(/\r\n/g, '\n');
const QUALITY_TIERS = ['full', 'balanced', 'reduced'] as const satisfies readonly RegionalLandscapeQualityTier[];

describe('entorno regional cenográfico do Mapa Comercial', () => {
  it('gera planos determinísticos, congelados e limitados pelo orçamento de cada tier', () => {
    QUALITY_TIERS.forEach((qualityTier) => {
      const first = buildRegionalLandscapePlan(qualityTier);
      const second = buildRegionalLandscapePlan(qualityTier);

      expect(first).toEqual(second);
      expect(first).not.toBe(second);
      expect(Object.isFrozen(first)).toBe(true);
      expect(first).toHaveLength(REGIONAL_LANDSCAPE_INSTANCE_BUDGET[qualityTier]);
      expect(new Set(first.map((instance) => instance.id)).size).toBe(first.length);
      expect(new Set(first.map((instance) => instance.position.join(':'))).size).toBe(first.length);
      first.forEach((instance) => {
        expect(Object.isFrozen(instance)).toBe(true);
        expect(Object.isFrozen(instance.position)).toBe(true);
        expect(instance.variant).toBeGreaterThanOrEqual(0);
        expect(instance.variant).toBeLessThan(8);
      });
    });

    const full = buildRegionalLandscapePlan('full');
    const balanced = buildRegionalLandscapePlan('balanced');
    const reduced = buildRegionalLandscapePlan('reduced');
    expect(full.slice(0, balanced.length)).toEqual(balanced);
    expect(balanced.slice(0, reduced.length)).toEqual(reduced);
  });

  it('distribui as oito variantes entre clusters naturais em todos os presets', () => {
    QUALITY_TIERS.forEach((qualityTier) => {
      const diagnostics = regionalLandscapeDiagnostics(qualityTier);
      expect(diagnostics.instanceCount).toBe(REGIONAL_LANDSCAPE_INSTANCE_BUDGET[qualityTier]);
      expect(diagnostics.variantCount).toBe(8);
      expect(diagnostics.clusterCount).toBeGreaterThanOrEqual(12);
      expect(diagnostics.maximumRadius).toBeGreaterThan(100);
    });
  });

  it('mantém todas as copas fora do parque oficial, rodovias, trevos e vias traseiras', () => {
    buildRegionalLandscapePlan('full').forEach((instance) => {
      const [x, z] = instance.position;
      const outsideOfficialPark = x < PARK_LOCAL_BOUNDS.minX
        || x > PARK_LOCAL_BOUNDS.maxX
        || z < PARK_LOCAL_BOUNDS.minZ
        || z > PARK_LOCAL_BOUNDS.maxZ;

      expect(outsideOfficialPark, instance.id).toBe(true);
      expect(regionalLandscapePointIsClear(instance.position), instance.id).toBe(true);
      expect(Number.isFinite(instance.height)).toBe(true);
      expect(Number.isFinite(instance.canopyRadius)).toBe(true);
      expect(instance.height).toBeGreaterThan(0);
      expect(instance.canopyRadius).toBeGreaterThan(0);
    });
  });

  it('limita a camada a três draw calls e elimina a sombra falsa no reduced', () => {
    expect(REGIONAL_LANDSCAPE_DRAW_CALL_BUDGET).toEqual({
      full: 3,
      balanced: 3,
      reduced: 2,
    });
    QUALITY_TIERS.forEach((qualityTier) => {
      expect(regionalLandscapeDiagnostics(qualityTier).drawCalls)
        .toBe(REGIONAL_LANDSCAPE_DRAW_CALL_BUDGET[qualityTier]);
    });

    const component = source(
      'src/features/commercial-map/components/canvas/RegionalLandscapeLayer.tsx',
    );
    expect(component.match(/<instancedMesh\b/g)).toHaveLength(3);
    expect(component).toContain("const fakeShadows = qualityTier !== 'reduced';");
    expect(component).toContain('{fakeShadows && geometries.shadow && materials.shadow && (');
    expect(component.match(/castShadow=\{false\}/g)).toHaveLength(3);
    expect(component).not.toContain('castShadow={true}');
  });

  it('permanece não interativa, sem entidades, e libera todos os recursos próprios', () => {
    const component = source(
      'src/features/commercial-map/components/canvas/RegionalLandscapeLayer.tsx',
    );

    expect(component.match(/raycast=\{NO_RAYCAST\}/g)).toHaveLength(3);
    expect(component).not.toContain('onClick=');
    expect(component).not.toContain('onPointer');
    expect(component).not.toContain('MapEntity');
    expect(component).not.toContain('useCommercialMapStore');
    expect(component).toContain('presentationOnly: true');
    expect(component).toContain('selectable: false');
    expect(component).toContain('disposeInstancedMesh');
    expect(component).toContain('geometry?.dispose()');
    expect(component).toContain('material?.dispose()');
    expect(component).toContain('dispose={null}');
  });

  it('é composta somente no ambiente normal e dentro do grupo ambiental ativo', () => {
    const environment = source(
      'src/features/commercial-map/components/canvas/CommercialMapEnvironment.tsx',
    );
    const canvas = source(
      'src/features/commercial-map/components/canvas/CommercialMapCanvas.tsx',
    );
    const activeGroup = environment.slice(
      environment.indexOf('<group visible={active}>'),
      environment.indexOf('<SunrisePostProcessing'),
    );

    expect(environment).toContain("import { RegionalLandscapeLayer } from './RegionalLandscapeLayer';");
    expect(activeGroup).toContain(
      "{mode === 'normal' && <RegionalLandscapeLayer qualityTier={qualityTier} />}",
    );
    expect(canvas).not.toContain("from './RegionalLandscapeLayer'");
  });
});
