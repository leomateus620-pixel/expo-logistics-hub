import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  createEventCenterArchitecture,
  eventCenterPartsForDetail,
} from '@/features/commercial-map/utils/eventCenterArchitecture';
import { buildEventCenterGeometry } from '@/features/commercial-map/components/canvas/EventCenterGeometry';
import { resolveGastronomyMarkerAnchor } from '@/features/commercial-map/components/canvas/gastronomyMarkerAnchor';
import {
  OFFICIAL_REFERENCE_ENTITIES,
  OFFICIAL_REFERENCE_LOTS,
  officialPdfPointToLocal,
} from '@/features/commercial-map/data/officialReference2026';
import {
  EVENT_CENTER_QE12_ALIGNMENT,
  FENASOJA_EVENT_CENTER_LAYOUT,
  FENASOJA_EVENT_CENTER_RENDER_BUDGET,
  FENASOJA_EVENT_CENTER_REVISION,
  eventCenterCardinalFacingRadians,
  eventCenterEnvelope,
  eventCenterModelBounds,
  eventCenterVisualHeight,
} from '@/features/commercial-map/utils/eventCenter';
import { landmarkFrontVector } from '@/features/commercial-map/utils/fenasojaReferenceStructures';
import {
  resolveStrategicLandmarkKind,
  strategicLandmarkBounds,
  strategicLandmarkFacingRadians,
  strategicLandmarkFocusDirection,
  strategicLandmarkSearchAliases,
  strategicLandmarkSupportsInterior,
  strategicLandmarkVisualHeight,
} from '@/features/commercial-map/utils/landmarks';

const eventCenter = OFFICIAL_REFERENCE_ENTITIES.find((entity) => entity.publicIdentifier === 'C1');

if (!eventCenter) throw new Error('A referência oficial deve conter o Centro de Eventos C1.');

const landmarkRenderer = readFileSync(
  resolve('src/features/commercial-map/components/canvas/StrategicLandmarks.tsx'),
  'utf8',
);
const canvasRenderer = readFileSync(
  resolve('src/features/commercial-map/components/canvas/CommercialMapCanvas.tsx'),
  'utf8',
);

describe('contrato de realismo do Centro de Eventos Fenasoja C1', () => {
  it('mantém centro, footprint e vínculo cartográfico oficiais sem mutar a entidade', () => {
    const [sourceX, sourceZ] = FENASOJA_EVENT_CENTER_LAYOUT.sourceCenter;
    const [sourceWidth, sourceDepth] = FENASOJA_EVENT_CENTER_LAYOUT.sourceFootprint;
    const [expectedCenterX, expectedCenterZ] = officialPdfPointToLocal([sourceX, sourceZ]);
    const [expectedMinX, expectedMinZ] = officialPdfPointToLocal([
      sourceX - sourceWidth / 2,
      sourceZ - sourceDepth / 2,
    ]);
    const [expectedMaxX, expectedMaxZ] = officialPdfPointToLocal([
      sourceX + sourceWidth / 2,
      sourceZ + sourceDepth / 2,
    ]);
    const before = JSON.stringify(eventCenter);
    const bounds = strategicLandmarkBounds(eventCenter);

    expect(FENASOJA_EVENT_CENTER_LAYOUT.sourceBounds).toEqual([4020, 3180, 4490, 3435]);
    expect(EVENT_CENTER_QE12_ALIGNMENT.eventCenterSourceCenter).toEqual([4255, 3307.5]);
    expect(bounds.centerX).toBeCloseTo(expectedCenterX, 6);
    expect(bounds.centerZ).toBeCloseTo(expectedCenterZ, 6);
    expect(bounds.minX).toBeCloseTo(expectedMinX, 6);
    expect(bounds.minZ).toBeCloseTo(expectedMinZ, 6);
    expect(bounds.maxX).toBeCloseTo(expectedMaxX, 6);
    expect(bounds.maxZ).toBeCloseTo(expectedMaxZ, 6);
    expect(bounds.width).toBeCloseTo(10.2545, 4);
    expect(bounds.depth).toBeCloseTo(5.5636, 4);
    expect(JSON.stringify(eventCenter)).toBe(before);
  });

  it('limita toda a nova arquitetura ao envelope interno de C1', () => {
    const bounds = strategicLandmarkBounds(eventCenter);
    const envelope = eventCenterEnvelope(bounds);

    expect(envelope.width).toBeCloseTo(bounds.width * 0.965, 8);
    expect(envelope.depth).toBeCloseTo(bounds.depth * 0.94, 8);
    expect(envelope.hallDepth).toBeCloseTo(bounds.depth * 0.69, 8);
    expect(envelope.hallRearOffset).toBeLessThan(0);
    expect(envelope.entranceWidth).toBeCloseTo(bounds.width * 0.386, 8);
    expect(envelope.width).toBeLessThan(bounds.width);
    expect(envelope.depth).toBeLessThan(bounds.depth);
  });

  it('reorienta a fachada para o lote Q-E-12 sem sair do envelope oficial', () => {
    const persistedEventCenter = { ...eventCenter, id: 'db:uuid:event-center' };
    const bounds = strategicLandmarkBounds(eventCenter);
    const modelBounds = eventCenterModelBounds(bounds);
    const targetLot = OFFICIAL_REFERENCE_LOTS.find((lot) => lot.publicIdentifier === 'Q-E-12');
    const [lotX, lotZ] = EVENT_CENTER_QE12_ALIGNMENT.targetSourceCenter;
    const towardLot = [
      lotX - EVENT_CENTER_QE12_ALIGNMENT.eventCenterSourceCenter[0],
      lotZ - EVENT_CENTER_QE12_ALIGNMENT.eventCenterSourceCenter[1],
    ] as const;
    const towardLotLength = Math.hypot(towardLot[0], towardLot[1]);
    const front = landmarkFrontVector(FENASOJA_EVENT_CENTER_LAYOUT.facingRadians);
    const cosine = Math.cos(FENASOJA_EVENT_CENTER_LAYOUT.facingRadians);
    const sine = Math.sin(FENASOJA_EVENT_CENTER_LAYOUT.facingRadians);
    const worldXs = [modelBounds.width / 2, -modelBounds.width / 2].flatMap((x) =>
      [modelBounds.depth / 2, -modelBounds.depth / 2].map((z) => x * cosine + z * sine),
    );
    const worldZs = [modelBounds.width / 2, -modelBounds.width / 2].flatMap((x) =>
      [modelBounds.depth / 2, -modelBounds.depth / 2].map((z) => -x * sine + z * cosine),
    );

    expect(targetLot, 'lote Q-E-12 ausente da referência oficial').toBeDefined();
    expect(EVENT_CENTER_QE12_ALIGNMENT.eventCenterIdentifier).toBe('C1');
    expect(EVENT_CENTER_QE12_ALIGNMENT.targetLotIdentifier).toBe('Q-E-12');
    expect(EVENT_CENTER_QE12_ALIGNMENT.facingRadians).toBe(-1.565390974146972);
    expect(EVENT_CENTER_QE12_ALIGNMENT.facingRadians).toBeCloseTo(Math.atan2(towardLot[0], towardLot[1]), 8);
    expect(FENASOJA_EVENT_CENTER_LAYOUT.facingRadians).toBe(EVENT_CENTER_QE12_ALIGNMENT.facingRadians);
    expect(eventCenterCardinalFacingRadians()).toBeCloseTo(-Math.PI / 2, 12);
    expect(resolveStrategicLandmarkKind(persistedEventCenter)).toBe('fenasoja-event-center');
    expect(strategicLandmarkFacingRadians(persistedEventCenter)).toBe(
      EVENT_CENTER_QE12_ALIGNMENT.facingRadians,
    );
    expect(strategicLandmarkFocusDirection(persistedEventCenter)).toEqual([-0.96, 0.42, 0.12]);
    expect(strategicLandmarkSearchAliases(persistedEventCenter)).toContain('Fenasoja Event Center');
    expect((front[0] * towardLot[0] + front[1] * towardLot[1]) / towardLotLength).toBeCloseTo(1, 8);
    expect(front[0]).toBeLessThan(-0.99);
    expect(modelBounds.width).toBeCloseTo(bounds.depth, 8);
    expect(modelBounds.depth).toBeCloseTo(bounds.width, 8);
    expect(Math.max(...worldXs) - Math.min(...worldXs)).toBeLessThanOrEqual(bounds.width + 0.08);
    expect(Math.max(...worldZs) - Math.min(...worldZs)).toBeLessThanOrEqual(bounds.depth + 0.08);
    expect(eventCenterVisualHeight(bounds)).toBeCloseTo(2.5636, 4);
    expect(strategicLandmarkVisualHeight(eventCenter)).toBeCloseTo(eventCenterVisualHeight(bounds), 8);
    expect(strategicLandmarkVisualHeight(eventCenter)).toBeGreaterThan(eventCenter.geometry.extrusionHeight);
  });

  it('versiona a leitura fotográfica, materiais e identidade oficial', () => {
    expect(FENASOJA_EVENT_CENTER_REVISION).toBe('2026.11-event-center-architecture.2');
    expect(FENASOJA_EVENT_CENTER_LAYOUT.identity).toEqual({
      symbolAsset: '/alvorada/fenasoja-symbol-official.png',
      wordmark: 'FENASOJA',
    });
    expect(FENASOJA_EVENT_CENTER_LAYOUT.palette).toMatchObject({
      roof: '#818b89',
      fronton: '#20272a',
      glass: '#27464b',
      concrete: '#a7a496',
      landscape: '#315e3d',
    });

    const symbolPath = resolve(
      'public',
      FENASOJA_EVENT_CENTER_LAYOUT.identity.symbolAsset.replace(/^\/+/, ''),
    );
    expect(existsSync(symbolPath)).toBe(true);
    expect(statSync(symbolPath).size).toBeGreaterThan(0);
  });

  it.each(['base', 'detail', 'focus'] as const)(
    'compila %s dentro do footprint e do volume de seleção',
    (detail) => {
      const bounds = strategicLandmarkBounds(eventCenter);
      const height = eventCenterVisualHeight(bounds);
      const layout = createEventCenterArchitecture(eventCenterModelBounds(bounds), height);
      const parts = eventCenterPartsForDetail(layout.parts, detail);
      const buffers = buildEventCenterGeometry(layout.parts, detail);
      const combined = new THREE.Box3();
      let triangles = 2; // the official sign
      try {
        for (const geometry of buffers.surfaces.values()) {
          expect(geometry.boundingBox).not.toBeNull();
          combined.union(geometry.boundingBox!);
          triangles += (geometry.index?.count ?? geometry.attributes.position.count) / 3;
          const positions = geometry.attributes.position;
          for (let index = 0; index < positions.count; index++) {
            const point = new THREE.Vector3()
              .fromBufferAttribute(positions, index)
              .applyAxisAngle(new THREE.Vector3(0, 1, 0), FENASOJA_EVENT_CENTER_LAYOUT.facingRadians);
            expect(Math.abs(point.x)).toBeLessThan(bounds.width / 2 + 0.04);
            expect(Math.abs(point.z)).toBeLessThan(bounds.depth / 2 + 0.04);
            expect(point.y).toBeGreaterThanOrEqual(-0.0001);
            expect(point.y).toBeLessThan(height);
          }
        }
        expect(parts.every((part) => part.size.every((value) => Number.isFinite(value) && value > 0))).toBe(
          true,
        );
        expect(parts.length).toBeLessThanOrEqual(
          FENASOJA_EVENT_CENTER_RENDER_BUDGET.maxRepeatedOrBatchedElements,
        );
        expect(triangles).toBeLessThanOrEqual(FENASOJA_EVENT_CENTER_RENDER_BUDGET.maxApproximateTriangles);
        // One batch per surface, one identity panel, two selection overlays.
        expect(buffers.surfaces.size + 3).toBeLessThanOrEqual(
          FENASOJA_EVENT_CENTER_RENDER_BUDGET[`${detail}PrimaryDrawCalls`],
        );
        expect(combined.min.y).toBeCloseTo(0, 5);
        expect(combined.max.y).toBeGreaterThan(layout.roof.ridgeY);
      } finally {
        buffers.dispose();
      }
    },
  );

  it('conserva aberturas, lanternim, entrada e circulação em todos os LODs', () => {
    const bounds = strategicLandmarkBounds(eventCenter);
    const layout = createEventCenterArchitecture(
      eventCenterModelBounds(bounds),
      eventCenterVisualHeight(bounds),
    );
    expect(new Set(layout.parts.map((part) => part.id)).size).toBe(layout.parts.length);
    const base = eventCenterPartsForDetail(layout.parts, 'base');
    const focus = eventCenterPartsForDetail(layout.parts, 'focus');
    expect(
      base.filter((part) => part.id.startsWith('side-opening-') && part.id.endsWith('-pane')),
    ).toHaveLength(14);
    expect(base.some((part) => part.id === 'entry-doors-pane')).toBe(true);
    expect(base.some((part) => part.id === 'monitor-body')).toBe(true);
    expect(base.some((part) => part.id === 'main-roof-sheet-1')).toBe(true);
    expect(base.length).toBeLessThan(focus.length);
    const pavement = base.find((part) => part.id === 'pavement')!;
    expect(pavement.size[1]).toBeLessThan(0.03);
    expect(pavement.position[1] - pavement.size[1] / 2).toBe(0);
    expect(focus.some((part) => part.surface === 'green')).toBe(false);
    const apronFront = pavement.position[2] + pavement.size[2] / 2;
    expect(apronFront).toBeCloseTo(eventCenterModelBounds(bounds).depth / 2 - 0.025);
    expect(apronFront - layout.entry.front).toBeCloseTo(0.6);
    expect(pavement.size[0]).toBe(layout.envelope.width);
    expect(focus.some((part) => part.id === 'entry-path')).toBe(false);
    const door = focus.find((part) => part.id === 'entry-doors-pane')!;
    expect(layout.entry.front - door.position[2]).toBeGreaterThan(0.17);
    expect(focus.some((part) => part.id.startsWith('stone-course-'))).toBe(true);
    expect(layout.entry.rise).toBeLessThan(eventCenterVisualHeight(bounds) * 0.25);
    expect(layout.monitor.width).toBeLessThan(layout.roof.width * 0.6);
  });

  it('ancora Gastronomia sobre a superfície efetivamente compilada, com apenas a folga técnica', () => {
    const bounds = strategicLandmarkBounds(eventCenter);
    const layout = createEventCenterArchitecture(
      eventCenterModelBounds(bounds),
      eventCenterVisualHeight(bounds),
    );
    const buffers = buildEventCenterGeometry(layout.parts, 'focus');
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    try {
      const meshes = [...buffers.surfaces.values()].map((geometry) => new THREE.Mesh(geometry, material));
      const ray = new THREE.Raycaster(
        new THREE.Vector3(layout.marker[0], 10, layout.marker[2]),
        new THREE.Vector3(0, -1, 0),
      );
      const top = ray.intersectObjects(meshes, false)[0].point.y;
      const anchor = resolveGastronomyMarkerAnchor(eventCenter)!;
      expect(anchor[1] - eventCenter.geometry.elevation - top).toBeCloseTo(0.025, 3);
      const world = new THREE.Vector3(...layout.marker).applyAxisAngle(
        new THREE.Vector3(0, 1, 0),
        FENASOJA_EVENT_CENTER_LAYOUT.facingRadians,
      );
      expect(anchor[0]).toBeCloseTo(bounds.centerX + world.x, 6);
      expect(anchor[2]).toBeCloseTo(bounds.centerZ + world.z, 6);
    } finally {
      buffers.dispose();
      material.dispose();
    }
  });

  it('libera apenas buffers próprios e conserva o enquadramento existente', () => {
    const bounds = strategicLandmarkBounds(eventCenter);
    const layout = createEventCenterArchitecture(
      eventCenterModelBounds(bounds),
      eventCenterVisualHeight(bounds),
    );
    const first = buildEventCenterGeometry(layout.parts, 'base');
    const second = buildEventCenterGeometry(layout.parts, 'base');
    let disposed = 0;
    first.surfaces.forEach((buffer) => buffer.addEventListener('dispose', () => disposed++));
    first.dispose();
    expect(disposed).toBe(first.surfaces.size);
    for (const [surface, buffer] of second.surfaces) {
      expect(buffer).not.toBe(first.surfaces.get(surface));
      expect(buffer.attributes.position.count).toBeGreaterThan(0);
    }
    second.dispose();
    const profile = canvasRenderer.slice(
      canvasRenderer.indexOf("if (landmark === 'fenasoja-event-center')"),
      canvasRenderer.indexOf("if (landmark === 'commercial-pavilion')"),
    );
    expect(profile).toContain('contextRatio: 0.085');
    expect(profile).toContain('fitPadding: 1.32');
    expect(profile).toContain('minimumDirectionY: 0.48');
  });

  it('preserva identidade operacional, seleção e ausência de interior inventado', () => {
    expect(eventCenter.id).toBe('reference:2026:c1');
    expect(eventCenter.parentEntityId).toBe('reference:2026:quadra-c');
    expect(eventCenter.classification).toBe('EVENT_VENUE');
    expect(eventCenter.isSellable).toBe(false);
    expect(eventCenter.geometry.extrusionHeight).toBeCloseTo(1.55, 8);
    expect(OFFICIAL_REFERENCE_LOTS.some((lot) => lot.entityId === eventCenter.id)).toBe(false);
    expect(strategicLandmarkSupportsInterior(eventCenter)).toBe(false);
    expect(landmarkRenderer).toContain(
      "{kind === 'fenasoja-event-center' && <FenasojaEventCenter {...modelProps} toneDown={toneDown} />}",
    );
  });
});
