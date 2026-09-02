import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
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

const eventCenter = OFFICIAL_REFERENCE_ENTITIES.find(
  (entity) => entity.publicIdentifier === 'C1',
);

if (!eventCenter) throw new Error('A referência oficial deve conter o Centro de Eventos C1.');

const landmarkRenderer = readFileSync(resolve(
  'src/features/commercial-map/components/canvas/StrategicLandmarks.tsx',
), 'utf8');
const canvasRenderer = readFileSync(resolve(
  'src/features/commercial-map/components/canvas/CommercialMapCanvas.tsx',
), 'utf8');

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
    expect(envelope.entranceWidth).toBeCloseTo(bounds.width * 0.225, 8);
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
    const worldXs = [modelBounds.width / 2, -modelBounds.width / 2].flatMap((x) => (
      [modelBounds.depth / 2, -modelBounds.depth / 2].map((z) => x * cosine + z * sine)
    ));
    const worldZs = [modelBounds.width / 2, -modelBounds.width / 2].flatMap((x) => (
      [modelBounds.depth / 2, -modelBounds.depth / 2].map((z) => -x * sine + z * cosine)
    ));

    expect(targetLot, 'lote Q-E-12 ausente da referência oficial').toBeDefined();
    expect(EVENT_CENTER_QE12_ALIGNMENT.eventCenterIdentifier).toBe('C1');
    expect(EVENT_CENTER_QE12_ALIGNMENT.targetLotIdentifier).toBe('Q-E-12');
    expect(EVENT_CENTER_QE12_ALIGNMENT.facingRadians).toBe(-1.565390974146972);
    expect(EVENT_CENTER_QE12_ALIGNMENT.facingRadians).toBeCloseTo(
      Math.atan2(towardLot[0], towardLot[1]),
      8,
    );
    expect(FENASOJA_EVENT_CENTER_LAYOUT.facingRadians).toBe(EVENT_CENTER_QE12_ALIGNMENT.facingRadians);
    expect(eventCenterCardinalFacingRadians()).toBeCloseTo(-Math.PI / 2, 12);
    expect(resolveStrategicLandmarkKind(persistedEventCenter)).toBe('fenasoja-event-center');
    expect(strategicLandmarkFacingRadians(persistedEventCenter))
      .toBe(EVENT_CENTER_QE12_ALIGNMENT.facingRadians);
    expect(strategicLandmarkFocusDirection(persistedEventCenter)).toEqual([-0.96, 0.42, 0.12]);
    expect(strategicLandmarkSearchAliases(persistedEventCenter)).toContain('Fenasoja Event Center');
    expect((front[0] * towardLot[0] + front[1] * towardLot[1]) / towardLotLength)
      .toBeCloseTo(1, 8);
    expect(front[0]).toBeLessThan(-0.99);
    expect(modelBounds.width).toBeCloseTo(bounds.depth, 8);
    expect(modelBounds.depth).toBeCloseTo(bounds.width, 8);
    expect(Math.max(...worldXs) - Math.min(...worldXs)).toBeLessThanOrEqual(bounds.width + 0.08);
    expect(Math.max(...worldZs) - Math.min(...worldZs)).toBeLessThanOrEqual(bounds.depth + 0.08);
    expect(eventCenterVisualHeight(bounds)).toBeCloseTo(2.5636, 4);
    expect(strategicLandmarkVisualHeight(eventCenter)).toBeCloseTo(
      eventCenterVisualHeight(bounds),
      8,
    );
    expect(strategicLandmarkVisualHeight(eventCenter)).toBeGreaterThan(
      eventCenter.geometry.extrusionHeight,
    );
  });

  it('versiona a leitura fotográfica, materiais e identidade oficial', () => {
    expect(FENASOJA_EVENT_CENTER_REVISION).toBe('2026.9-event-center-qe12.1');
    expect(FENASOJA_EVENT_CENTER_LAYOUT.identity).toEqual({
      symbolAsset: '/alvorada/fenasoja-symbol-official.png',
      wordmark: 'FENASOJA',
    });
    expect(FENASOJA_EVENT_CENTER_LAYOUT.palette).toMatchObject({
      roof: '#c8cbca',
      fronton: '#20272a',
      glass: '#27464b',
      concrete: '#85857d',
      landscape: '#315e3d',
    });

    const symbolPath = resolve(
      'public',
      FENASOJA_EVENT_CENTER_LAYOUT.identity.symbolAsset.replace(/^\/+/, ''),
    );
    expect(existsSync(symbolPath)).toBe(true);
    expect(statSync(symbolPath).size).toBeGreaterThan(0);
  });

  it('compõe silhueta, frontão, fachada e entorno com LOD eficiente', () => {
    const eventCenterRenderer = landmarkRenderer.slice(
      landmarkRenderer.indexOf('function FenasojaEventCenter'),
      landmarkRenderer.indexOf('function FenasojaRestaurant'),
    );

    expect(eventCenterRenderer).toContain('createGableRoofGeometry');
    expect(eventCenterRenderer).toContain('entranceGableGeometry');
    expect(eventCenterRenderer).toContain('<EventCenterIdentityPanel');
    expect(eventCenterRenderer).toContain('size={[entranceWidth * 0.72, entranceWidth * 0.36]}');
    expect(eventCenterRenderer).toContain('glazingItems');
    expect(eventCenterRenderer).toContain('canopyPosts');
    expect(eventCenterRenderer).toContain('planterItems');
    expect(eventCenterRenderer).toContain('roofSeams');
    expect(eventCenterRenderer).toContain('showDetail');
    expect(eventCenterRenderer).toContain('showFocusDetail');
    expect(eventCenterRenderer).toContain('<BatchedTransforms items={roofBatch}');
    expect(eventCenterRenderer).toContain("featureType: 'FENASOJA_EVENT_CENTER'");
    expect(eventCenterRenderer).not.toMatch(/<(?:pointLight|spotLight)\b/);
    expect(landmarkRenderer).toContain('eventCenterModelBounds(bounds, facingRadians)');
    const eventCenterFocusProfile = canvasRenderer.slice(
      canvasRenderer.indexOf("if (landmark === 'fenasoja-event-center')"),
      canvasRenderer.indexOf("if (landmark === 'commercial-pavilion')"),
    );
    expect(eventCenterFocusProfile).toContain('contextRatio: 0.085');
    expect(eventCenterFocusProfile).toContain('fitPadding: 1.32');
    expect(eventCenterFocusProfile).toContain('minimumDirectionY: 0.48');
  });

  it('mantém budgets progressivos abaixo dos limites móveis', () => {
    expect(FENASOJA_EVENT_CENTER_RENDER_BUDGET).toMatchObject({
      basePrimaryDrawCalls: 9,
      detailPrimaryDrawCalls: 13,
      focusPrimaryDrawCalls: 15,
      measuredModelBasePrimaryDrawCalls: 7,
      measuredModelDetailPrimaryDrawCalls: 10,
      measuredModelFocusPrimaryDrawCalls: 11,
      maxRepeatedOrBatchedElements: 96,
      measuredFocusRepeatedOrBatchedElements: 90,
      maxApproximateTriangles: 1_800,
      measuredFocusApproximateTriangles: 1_592,
    });
    expect(FENASOJA_EVENT_CENTER_RENDER_BUDGET.measuredBaseWithOverlayDrawCalls)
      .toBeLessThanOrEqual(FENASOJA_EVENT_CENTER_RENDER_BUDGET.basePrimaryDrawCalls);
    expect(FENASOJA_EVENT_CENTER_RENDER_BUDGET.measuredDetailWithOverlayDrawCalls)
      .toBeLessThanOrEqual(FENASOJA_EVENT_CENTER_RENDER_BUDGET.detailPrimaryDrawCalls);
    expect(FENASOJA_EVENT_CENTER_RENDER_BUDGET.measuredFocusWithOverlayDrawCalls)
      .toBeLessThanOrEqual(FENASOJA_EVENT_CENTER_RENDER_BUDGET.focusPrimaryDrawCalls);
    expect(FENASOJA_EVENT_CENTER_RENDER_BUDGET.measuredFocusRepeatedOrBatchedElements)
      .toBeLessThanOrEqual(FENASOJA_EVENT_CENTER_RENDER_BUDGET.maxRepeatedOrBatchedElements);
    expect(FENASOJA_EVENT_CENTER_RENDER_BUDGET.measuredFocusApproximateTriangles)
      .toBeLessThanOrEqual(FENASOJA_EVENT_CENTER_RENDER_BUDGET.maxApproximateTriangles);
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
      "{kind === 'fenasoja-event-center' && <FenasojaEventCenter {...modelProps} />}",
    );
  });
});
