import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  COMMERCIAL_ELECTRICAL_CONNECTIONS,
  COMMERCIAL_ELECTRICAL_NODES,
  COMMERCIAL_ELECTRICAL_POLES,
} from '@/features/commercial-map/data/electricalInfrastructure';
import { OFFICIAL_REFERENCE_ENTITIES } from '@/features/commercial-map/data/officialReference2026';
import { useCommercialMapStore } from '@/features/commercial-map/state/useCommercialMapStore';
import {
  buildElectricalPoleCrossarmLayouts,
  resolveElectricalNodePlacements,
} from '@/features/commercial-map/utils/electricalInfrastructure';
import {
  buildNightLampFixtures,
  NIGHT_LIGHTING_CONFIG,
  summarizeNightLighting,
} from '@/features/commercial-map/utils/nightLighting';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('Modo Noturno global do Mapa Comercial', () => {
  beforeEach(() => {
    useCommercialMapStore.setState(useCommercialMapStore.getInitialState(), true);
  });

  afterEach(() => {
    useCommercialMapStore.setState(useCommercialMapStore.getInitialState(), true);
  });

  it('alterna o estado global sem tocar seleção, câmera ou amanhecer', () => {
    const store = useCommercialMapStore.getState();
    store.setSelectedEntityId('lote-1');
    const before = useCommercialMapStore.getState();
    expect(before.nightModeActive).toBe(false);

    before.toggleNightMode();
    const night = useCommercialMapStore.getState();
    expect(night.nightModeActive).toBe(true);
    expect(night.selectedEntityId).toBe('lote-1');
    expect(night.cameraSequence).toBe(before.cameraSequence);
    expect(night.sunrisePhase).toBe(before.sunrisePhase);

    night.toggleNightMode();
    expect(useCommercialMapStore.getState().nightModeActive).toBe(false);
  });

  it('sai da noite ao reproduzir o amanhecer e ao trocar de escopo', () => {
    useCommercialMapStore.getState().setNightModeActive(true);
    useCommercialMapStore.getState().requestSunrise();
    expect(useCommercialMapStore.getState()).toMatchObject({
      nightModeActive: false,
      sunrisePhase: 'running',
    });

    useCommercialMapStore.getState().setNightModeActive(true);
    useCommercialMapStore.getState().activateScope('outro-escopo', null);
    expect(useCommercialMapStore.getState().nightModeActive).toBe(false);
  });

  it('deriva as luminárias dos 408 postes oficiais: duas por poste e três nas junções', () => {
    const placements = resolveElectricalNodePlacements(
      COMMERCIAL_ELECTRICAL_NODES,
      OFFICIAL_REFERENCE_ENTITIES,
      true,
    );
    const layouts = buildElectricalPoleCrossarmLayouts(
      COMMERCIAL_ELECTRICAL_NODES,
      COMMERCIAL_ELECTRICAL_CONNECTIONS,
      placements,
    );
    const fixtures = buildNightLampFixtures(placements, layouts);
    const summary = summarizeNightLighting(fixtures);

    expect(COMMERCIAL_ELECTRICAL_POLES).toHaveLength(408);
    expect(summary.poleCount).toBe(408);
    expect(summary.twoLampPoles + summary.threeLampPoles).toBe(408);
    expect(summary.threeLampPoles).toBeGreaterThan(0);
    expect(summary.threeLampPoles).toBeLessThan(summary.twoLampPoles);
    expect(summary.lampCount).toBe(summary.twoLampPoles * 2 + summary.threeLampPoles * 3);
    expect(summary.drawCalls).toBe(NIGHT_LIGHTING_CONFIG.drawCalls);

    // Transformers never receive luminaires.
    const poleIds = new Set(COMMERCIAL_ELECTRICAL_POLES.map((pole) => pole.id));
    fixtures.forEach((fixture) => expect(poleIds.has(fixture.poleId)).toBe(true));
  });

  it('posiciona cada luminária no braço do poste e a poça acima de qualquer lote plano', () => {
    const placements = resolveElectricalNodePlacements(COMMERCIAL_ELECTRICAL_NODES, OFFICIAL_REFERENCE_ENTITIES);
    const layouts = buildElectricalPoleCrossarmLayouts(
      COMMERCIAL_ELECTRICAL_NODES,
      COMMERCIAL_ELECTRICAL_CONNECTIONS,
      placements,
    );
    const placementByNode = new Map(placements.map((placement) => [placement.node.id, placement]));
    const fixtures = buildNightLampFixtures(placements, layouts);

    fixtures.forEach((fixture) => {
      const placement = placementByNode.get(fixture.poleId)!;
      const [x, z] = placement.renderPosition;
      const reach = Math.hypot(fixture.headPosition[0] - x, fixture.headPosition[2] - z);
      expect(reach).toBeCloseTo(fixture.armLength, 6);
      expect(fixture.armLength).toBeGreaterThan(NIGHT_LIGHTING_CONFIG.armLength * 0.9);
      expect(fixture.armLength).toBeLessThan(NIGHT_LIGHTING_CONFIG.armLength * 1.1);
      expect(fixture.headPosition[1]).toBeCloseTo(
        placement.groundElevation + placement.node.height - NIGHT_LIGHTING_CONFIG.armDrop,
        6,
      );
      expect(Math.hypot(...fixture.direction)).toBeCloseTo(1, 6);
      expect(fixture.poolCenter[1]).toBeGreaterThanOrEqual(NIGHT_LIGHTING_CONFIG.poolClearance);
      expect(fixture.poolRadius).toBeGreaterThan(1.5);
      expect(fixture.intensity).toBeGreaterThan(0.8);
      expect(fixture.intensity).toBeLessThan(1.15);
      expect(fixture.seed).toBeGreaterThanOrEqual(0);
      expect(fixture.seed).toBeLessThan(1);
    });

    // Two-lamp poles face opposite sides of the same crossarm.
    const byPole = new Map<string, typeof fixtures[number][]>();
    fixtures.forEach((fixture) => {
      byPole.set(fixture.poleId, [...(byPole.get(fixture.poleId) ?? []), fixture]);
    });
    byPole.forEach((lamps) => {
      const [left, right] = lamps;
      expect(left.direction[0] + right.direction[0]).toBeCloseTo(0, 6);
      expect(left.direction[1] + right.direction[1]).toBeCloseTo(0, 6);
    });

    // Deterministic: the same inventory always yields the same fixtures.
    expect(buildNightLampFixtures(placements, layouts)).toEqual(fixtures);
  });

  it('renderiza toda a rede em cinco draw calls instanciados, sem luzes dinâmicas', () => {
    const layer = read('src/features/commercial-map/components/canvas/NightLightingLayer.tsx');
    const canvas = read('src/features/commercial-map/components/canvas/CommercialMapCanvas.tsx');
    const landmarks = read('src/features/commercial-map/components/canvas/StrategicLandmarks.tsx');

    expect(layer.match(/<instancedMesh/g)).toHaveLength(NIGHT_LIGHTING_CONFIG.drawCalls);
    expect(layer).not.toMatch(/<pointLight/i);
    expect(layer).not.toMatch(/<spotLight/i);
    expect(layer).not.toContain('new THREE.PointLight');
    // Ground pools blend with the surface beneath them (an irradiance multiply
    // plus a bounded screen fill) instead of painting opaque discs over it.
    expect(layer).toContain('blending: THREE.CustomBlending');
    expect(layer).toContain('blendSrc: THREE.DstColorFactor');
    expect(layer).toContain('blendSrc: THREE.OneMinusDstColorFactor');
    expect(layer).toContain('blendDst: THREE.OneFactor');
    expect(NIGHT_LIGHTING_CONFIG.poolMultiplyGain).toBeLessThan(1);
    expect(NIGHT_LIGHTING_CONFIG.poolScreenGain).toBeLessThan(0.5);
    expect(layer).toContain('depthWrite: false');
    // The reveal is damped in the frame loop and only invalidates while moving.
    expect(layer).toContain('THREE.MathUtils.damp(');
    expect(layer).toContain('if (!revealSettled || !presenceSettled) invalidate();');
    expect(layer).toContain('toneMapped: false');

    expect(canvas).toContain('<NightLightingLayer');
    expect(canvas).toContain('polesVisible={electricalNetworkVisible}');
    // The amusement park keeps its own night presentation inside the global night.
    expect(landmarks).toContain('parkActive={selected || nightModeActive}');
  });

  it('expõe o ícone de lua junto aos modos no desktop e no celular', () => {
    const topBar = read('src/features/commercial-map/components/controls/CommercialMapTopBar.tsx');
    const toolbar = read('src/features/commercial-map/components/controls/MapToolbar.tsx');
    const topBarStyles = read('src/features/commercial-map/components/controls/commercial-map-topbar.css');
    const styles = read('src/features/commercial-map/commercial-map.css');

    expect(topBar).toContain('Moon,');
    expect(topBar).toContain("'night-mode',");
    expect(topBar).toContain("nightModeActive ? 'Sair do Modo Noturno' : 'Ativar Modo Noturno'");
    expect(topBar).toContain('{ active: nightModeActive, night: true }');
    expect(topBar.indexOf("'sunrise',")).toBeLessThan(topBar.indexOf("'night-mode',"));
    expect(topBarStyles).toContain('.commercial-map-topbar__trigger.is-night.is-open');

    expect(toolbar).toContain('commercial-map-night-toggle');
    expect(toolbar).toContain('aria-pressed={nightModeActive}');
    expect(toolbar.indexOf('commercial-map-toolbar-mobile')).toBeLessThan(
      toolbar.lastIndexOf('commercial-map-night-toggle'),
    );
    expect(styles).toContain('.commercial-map-night-toggle.is-active');
  });
});
