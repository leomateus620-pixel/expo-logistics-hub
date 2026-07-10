import { describe, expect, it } from 'vitest';
import {
  calibratedAreaSqm,
  calibrationScale,
  canTransitionLotStatus,
  calculateAskingPrice,
  isSelfIntersecting,
  mergeAdjacentPolygons,
  polygonAreaMapUnits,
  polygonsShareBoundary,
  splitPolygonByLine,
  validateGeometry,
} from '@/features/commercial-map/utils/geometry';
import { resolveMapPermissions } from '@/features/commercial-map/utils/permissions';
import { OFFICIAL_REFERENCE_DATA } from '@/features/commercial-map/data/officialReference2024';
import { validateContractFile } from '@/features/commercial-map/utils/contracts';
import type { PolygonGeometry } from '@/features/commercial-map/types';

function rectangle(x1 = 0, y1 = 0, x2 = 10, y2 = 5): PolygonGeometry {
  return {
    id: null,
    type: 'Polygon',
    coordinates: [[[x1, y1], [x2, y1], [x2, y2], [x1, y2], [x1, y1]]],
    elevation: 0,
    extrusionHeight: 1,
    rotation: 0,
    geometryVersion: 1,
    calibrationVersion: null,
  };
}

describe('geometria e calibração do mapa comercial', () => {
  it('calcula área cartográfica sem apresentá-la como área oficial', () => {
    const geometry = rectangle();
    expect(polygonAreaMapUnits(geometry)).toBe(50);
    expect(calibratedAreaSqm(50, null)).toBeNull();
    expect(validateGeometry(geometry).warnings).toContain('Geometria não calibrada: a área calculada não é uma medida oficial.');
  });

  it('converte área somente com calibração validada', () => {
    const scale = calibrationScale([0, 0], [20, 0], 10);
    expect(scale).toBe(2);
    expect(calibratedAreaSqm(100, {
      id: 'cal-1', projectId: 'project-1', referenceImagePath: null, opacity: .3, isLocked: true,
      imageOffsetX: 0, imageOffsetY: 0, imageScaleX: 1, imageScaleY: 1, imageRotationDegrees: 0,
      pointA: [0, 0], pointB: [20, 0], knownDistanceMeters: 10, mapUnitsPerMeter: scale,
      status: 'VALIDATED', version: 1,
    })).toBe(25);
  });

  it('rejeita auto-interseção e polígonos vazios', () => {
    const bowTie = rectangle();
    bowTie.coordinates = [[[0, 0], [10, 5], [0, 5], [10, 0], [0, 0]]];
    expect(isSelfIntersecting(bowTie.coordinates[0])).toBe(true);
    expect(validateGeometry(bowTie).valid).toBe(false);
  });

  it('divide um polígono com preservação da área total', () => {
    const result = splitPolygonByLine(rectangle(), [5, -5], [5, 10]);
    expect(result).not.toBeNull();
    expect(result!.map(polygonAreaMapUnits)).toEqual([25, 25]);
  });

  it('detecta adjacência exigida para mesclagem', () => {
    expect(polygonsShareBoundary(rectangle(0, 0, 5, 5), rectangle(5, 0, 10, 5))).toBe(true);
    expect(polygonsShareBoundary(rectangle(0, 0, 5, 5), rectangle(6, 0, 10, 5))).toBe(false);
    const merged = mergeAdjacentPolygons(rectangle(0, 0, 5, 5), rectangle(5, 0, 10, 5));
    expect(merged).not.toBeNull();
    expect(polygonAreaMapUnits(merged!)).toBe(50);
    expect(mergeAdjacentPolygons(rectangle(0, 0, 5, 5), rectangle(6, 0, 10, 5))).toBeNull();
  });
});

describe('regras comerciais e segurança', () => {
  it('calcula preço por m² apenas com área oficial validada', () => {
    expect(calculateAskingPrice({ pricingMode: 'PRICE_PER_SQUARE_METER', pricePerSqm: 1000, officialAreaSqm: 40, areaValidationStatus: 'VALIDATED' })).toEqual({ value: 40000, warning: null });
    expect(calculateAskingPrice({ pricingMode: 'PRICE_PER_SQUARE_METER', pricePerSqm: 1000, officialAreaSqm: 40, areaValidationStatus: 'UNVALIDATED' }).value).toBeNull();
  });

  it('impede transição silenciosa de lote vendido', () => {
    expect(canTransitionLotStatus('AVAILABLE', 'RESERVED')).toBe(true);
    expect(canTransitionLotStatus('SOLD', 'AVAILABLE')).toBe(false);
  });

  it('mantém operador como visualizador sem elevar permissões comerciais', () => {
    const operator = resolveMapPermissions('operador', []);
    expect(operator.canView).toBe(true);
    expect(operator.canManageSales).toBe(false);
    const seller = resolveMapPermissions('leitura', ['map.view', 'map.manage_sales']);
    expect(seller.canManageSales).toBe(true);
    expect(seller.canEditGeometry).toBe(false);
  });

  it('aceita somente contrato privado suportado e dentro do limite', () => {
    expect(validateContractFile(new File(['pdf'], 'contrato.pdf', { type: 'application/pdf' }))).toBeNull();
    expect(validateContractFile(new File(['x'], 'contrato.exe', { type: 'application/octet-stream' }))).toContain('PDF ou DOCX');
  });

  it('não transforma a digitalização oficial em lote comercial fictício', () => {
    expect(OFFICIAL_REFERENCE_DATA.lots).toHaveLength(0);
    expect(OFFICIAL_REFERENCE_DATA.entities.every((entity) => !entity.isSellable)).toBe(true);
    expect(OFFICIAL_REFERENCE_DATA.entities.every((entity) => entity.verificationStatus === 'NEEDS_REVIEW')).toBe(true);
    expect(OFFICIAL_REFERENCE_DATA.entities.filter((entity) => !validateGeometry(entity.geometry).valid)).toEqual([]);
  });
});
