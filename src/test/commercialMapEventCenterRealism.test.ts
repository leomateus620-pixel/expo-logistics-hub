import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  OFFICIAL_REFERENCE_ENTITIES,
  OFFICIAL_REFERENCE_LOTS,
  officialPdfPointToLocal,
} from '@/features/commercial-map/data/officialReference2026';
import {
  FENASOJA_EVENT_CENTER_LAYOUT,
  FENASOJA_EVENT_CENTER_RENDER_BUDGET,
  FENASOJA_EVENT_CENTER_REVISION,
  eventCenterEnvelope,
  eventCenterVisualHeight,
} from '@/features/commercial-map/utils/eventCenter';
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

  it('troca o bloco genérico por landmark baixo, longitudinal e voltado ao sul', () => {
    const persistedEventCenter = { ...eventCenter, id: 'db:uuid:event-center' };
    const bounds = strategicLandmarkBounds(eventCenter);

    expect(resolveStrategicLandmarkKind(persistedEventCenter)).toBe('fenasoja-event-center');
    expect(strategicLandmarkFacingRadians(persistedEventCenter)).toBe(0);
    expect(strategicLandmarkFocusDirection(persistedEventCenter)).toEqual([0.16, 0.42, 1]);
    expect(strategicLandmarkSearchAliases(persistedEventCenter)).toContain('Fenasoja Event Center');
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
    expect(FENASOJA_EVENT_CENTER_REVISION).toBe('2026.8-event-center-realism.1');
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
