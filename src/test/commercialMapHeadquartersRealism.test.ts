import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  OFFICIAL_REFERENCE_ENTITIES,
  OFFICIAL_REFERENCE_LOTS,
  officialPdfPointToLocal,
} from '@/features/commercial-map/data/officialReference2026';
import {
  FENASOJA_HEADQUARTERS_LAYOUT,
  FENASOJA_HEADQUARTERS_RENDER_BUDGET,
  FENASOJA_HEADQUARTERS_REVISION,
  headquartersOrientedEnvelope,
} from '@/features/commercial-map/utils/headquarters';
import {
  resolveStrategicLandmarkKind,
  strategicLandmarkBounds,
  strategicLandmarkFacingRadians,
  strategicLandmarkSupportsInterior,
} from '@/features/commercial-map/utils/landmarks';

const THREE_HUNDRED_SIXTY_DEGREES = 360;

const headquarters = OFFICIAL_REFERENCE_ENTITIES.find(
  (entity) => entity.publicIdentifier === 'B12',
);

if (!headquarters) throw new Error('A referência oficial deve conter a Sede Fenasoja B12.');

const landmarkRenderer = readFileSync(resolve(
  'src/features/commercial-map/components/canvas/StrategicLandmarks.tsx',
), 'utf8');

describe('contrato de realismo da Sede Fenasoja / Comissão Central', () => {
  it('ancora o layout no centro e no footprint cartográfico oficiais de B12', () => {
    const [sourceX, sourceZ] = FENASOJA_HEADQUARTERS_LAYOUT.sourceCenter;
    const [sourceWidth, sourceDepth] = FENASOJA_HEADQUARTERS_LAYOUT.sourceFootprint;
    const [expectedCenterX, expectedCenterZ] = officialPdfPointToLocal([sourceX, sourceZ]);
    const [expectedMinX, expectedMinZ] = officialPdfPointToLocal([
      sourceX - sourceWidth / 2,
      sourceZ - sourceDepth / 2,
    ]);
    const [expectedMaxX, expectedMaxZ] = officialPdfPointToLocal([
      sourceX + sourceWidth / 2,
      sourceZ + sourceDepth / 2,
    ]);
    const bounds = strategicLandmarkBounds(headquarters);

    expect(FENASOJA_HEADQUARTERS_LAYOUT.sourceCenter).toEqual([4105, 3681]);
    expect(FENASOJA_HEADQUARTERS_LAYOUT.sourceFootprint).toEqual([135, 104]);
    expect(bounds.centerX).toBeCloseTo(expectedCenterX, 6);
    expect(bounds.centerZ).toBeCloseTo(expectedCenterZ, 6);
    expect(bounds.minX).toBeCloseTo(expectedMinX, 6);
    expect(bounds.minZ).toBeCloseTo(expectedMinZ, 6);
    expect(bounds.maxX).toBeCloseTo(expectedMaxX, 6);
    expect(bounds.maxZ).toBeCloseTo(expectedMaxZ, 6);
    expect(bounds.width).toBeCloseTo(2.9455, 4);
    expect(bounds.depth).toBeCloseTo(2.2691, 4);
  });

  it('mantém o envelope arquitetônico rotacionado integralmente dentro de B12', () => {
    const bounds = strategicLandmarkBounds(headquarters);
    const envelope = headquartersOrientedEnvelope(bounds);

    expect(envelope.localWidth).toBeCloseTo(
      bounds.width * FENASOJA_HEADQUARTERS_LAYOUT.envelope.widthRatio,
      8,
    );
    expect(envelope.localDepth).toBeCloseTo(
      bounds.depth * FENASOJA_HEADQUARTERS_LAYOUT.envelope.depthRatio,
      8,
    );
    expect(envelope.width).toBeLessThanOrEqual(bounds.width);
    expect(envelope.depth).toBeLessThanOrEqual(bounds.depth);
    expect(bounds.width - envelope.width).toBeGreaterThan(0);
    expect(bounds.depth - envelope.depth).toBeGreaterThan(0);
  });

  it('preserva a fachada em menos dez graus e o mesmo contrato do landmark', () => {
    expect(FENASOJA_HEADQUARTERS_LAYOUT.facingRadians).toBeCloseTo(-Math.PI / 18, 12);
    expect(THREE_HUNDRED_SIXTY_DEGREES * FENASOJA_HEADQUARTERS_LAYOUT.facingRadians / (Math.PI * 2))
      .toBeCloseTo(-10, 8);
    expect(strategicLandmarkFacingRadians(headquarters)).toBeCloseTo(
      FENASOJA_HEADQUARTERS_LAYOUT.facingRadians,
      12,
    );
    expect(resolveStrategicLandmarkKind(headquarters)).toBe('fenasoja-headquarters');
  });

  it('versiona a identidade oficial, a paleta azul-marinho e o asset aprovado', () => {
    expect(FENASOJA_HEADQUARTERS_REVISION).toBe('2026.8-headquarters-realism.2');
    expect(FENASOJA_HEADQUARTERS_LAYOUT.identity).toEqual({
      symbolAsset: '/alvorada/fenasoja-symbol-official.png',
      wordmark: 'FENASOJA',
      department: 'Comissão Central',
    });
    expect(FENASOJA_HEADQUARTERS_LAYOUT.palette).toEqual({
      navy: '#031834',
      navyDark: '#040203',
      roof: '#F9FAFB',
      glass: '#153a51',
      amber: '#F2751A',
      warmLight: '#F9C121',
    });

    const symbolPath = resolve(
      'public',
      FENASOJA_HEADQUARTERS_LAYOUT.identity.symbolAsset.replace(/^\/+/, ''),
    );
    expect(existsSync(symbolPath)).toBe(true);
    expect(statSync(symbolPath).size).toBeGreaterThan(0);
  });

  it('mantém budgets progressivos e limitados por nível de detalhe', () => {
    expect(FENASOJA_HEADQUARTERS_RENDER_BUDGET).toMatchObject({
      basePrimaryDrawCalls: 14,
      detailPrimaryDrawCalls: 28,
      focusPrimaryDrawCalls: 36,
      measuredModelBasePrimaryDrawCalls: 9,
      measuredModelDetailPrimaryDrawCalls: 25,
      measuredModelFocusPrimaryDrawCalls: 30,
      measuredBaseWithOverlayDrawCalls: 10,
      measuredDetailWithOverlayDrawCalls: 26,
      measuredFocusWithOverlayDrawCalls: 32,
    });
    expect(FENASOJA_HEADQUARTERS_RENDER_BUDGET.basePrimaryDrawCalls)
      .toBeLessThan(FENASOJA_HEADQUARTERS_RENDER_BUDGET.detailPrimaryDrawCalls);
    expect(FENASOJA_HEADQUARTERS_RENDER_BUDGET.detailPrimaryDrawCalls)
      .toBeLessThan(FENASOJA_HEADQUARTERS_RENDER_BUDGET.focusPrimaryDrawCalls);
    expect(FENASOJA_HEADQUARTERS_RENDER_BUDGET.measuredBaseWithOverlayDrawCalls)
      .toBeLessThanOrEqual(FENASOJA_HEADQUARTERS_RENDER_BUDGET.basePrimaryDrawCalls);
    expect(FENASOJA_HEADQUARTERS_RENDER_BUDGET.measuredDetailWithOverlayDrawCalls)
      .toBeLessThanOrEqual(FENASOJA_HEADQUARTERS_RENDER_BUDGET.detailPrimaryDrawCalls);
    expect(FENASOJA_HEADQUARTERS_RENDER_BUDGET.measuredFocusWithOverlayDrawCalls)
      .toBeLessThanOrEqual(FENASOJA_HEADQUARTERS_RENDER_BUDGET.focusPrimaryDrawCalls);
  });

  it('integra fachada oficial, luz eficiente, mastros, paisagismo e monumento da soja', () => {
    const headquartersRenderer = landmarkRenderer.slice(
      landmarkRenderer.indexOf('function FenasojaHeadquarters'),
      landmarkRenderer.indexOf('function GermanPavilion'),
    );

    expect(headquartersRenderer).toContain('FENASOJA_HEADQUARTERS_LAYOUT.envelope.widthRatio');
    expect(headquartersRenderer).toContain('<HeadquartersIdentityPanel');
    expect(headquartersRenderer).toContain('SHARED_HEADQUARTERS_AMBER_MATERIAL');
    expect(headquartersRenderer).toContain('facadeRibs');
    expect(headquartersRenderer).toContain('flagMasts');
    expect(headquartersRenderer).toContain('<SoybeanMonument');
    expect(headquartersRenderer).toContain('<BatchedTransforms items={wallBatch}');
    expect(headquartersRenderer).toContain('primaryDrawCalls: showFocusDetail ? 30 : showDetail ? 25 : 9');
    expect(headquartersRenderer).toContain('FENASOJA 2028');
    expect(headquartersRenderer).toContain('NOSSO OURO');
    expect(headquartersRenderer).not.toMatch(/<(?:pointLight|spotLight)\b/);
  });

  it('continua sendo administração não comercial com interior preservado', () => {
    expect(headquarters.id).toBe('reference:2026:b12');
    expect(headquarters.parentEntityId).toBe('reference:2026:quadra-b');
    expect(headquarters.classification).toBe('ADMINISTRATION');
    expect(headquarters.isSellable).toBe(false);
    expect(headquarters.geometry.extrusionHeight).toBeCloseTo(0.62, 8);
    expect(OFFICIAL_REFERENCE_LOTS.some((lot) => lot.entityId === headquarters.id)).toBe(false);
    expect(strategicLandmarkSupportsInterior(headquarters)).toBe(true);
  });
});
