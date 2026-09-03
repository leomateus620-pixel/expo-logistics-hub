import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BR472_EAST_GAP_IN_HUB_WIDTHS,
  BR472_EXTERIOR_SEGMENTS,
  INTERCHANGE_ENVELOPES,
  PARK_LOCAL_BOUNDS,
  REGIONAL_HIGHWAY_PROFILE,
  br472MainlineXAt,
  collectRegionalHighwayLayers,
  regionalHighwayEnvelopeWidth,
} from '@/features/commercial-map/data/regional-highways';
import {
  BR344_CROSS_SECTION,
  BR344_LOCAL_POLYLINE,
  BR344_NE_CLOVERLEAF_HANDOFF,
  BR344_PUBLISHED_NE_HANDOFF_SOURCE,
  BR344_SOURCE_Y,
} from '@/features/commercial-map/highways/br344';
import {
  NE_CLOVERLEAF_CENTER_LOCAL,
  NE_CLOVERLEAF_LAYOUT,
  NE_CLOVERLEAF_PUBLISHED_CENTER_SOURCE,
  NE_CLOVERLEAF_STUBS,
} from '@/features/commercial-map/data/neCloverleafBr344Br472';
import {
  SE_CLOVERLEAF_CENTER_LOCAL,
  SE_CLOVERLEAF_JOIN_LOCAL,
  SE_CLOVERLEAF_LAYOUT,
  SE_CLOVERLEAF_PUBLISHED_JOIN_SOURCE,
} from '@/features/commercial-map/data/seCloverleaf';
import { REAR_CALIBRATED_AXES } from '@/features/commercial-map/utils/rearSpatialCalibration';
import { buildBr344MainlineGeometries, disposeBr344MainlineGeometries } from '@/features/commercial-map/highways/br344/br344Geometry';

const read = (path: string) => readFileSync(resolve(path), 'utf8');

describe('fold das rodovias regionais — BR-472 + BR-344 + trevos', () => {
  it('encaixa BR-344 e os trevos nos envelopes regionais, não nos handoffs isolados', () => {
    const ne = INTERCHANGE_ENVELOPES.neCloverleaf.center;
    const se = INTERCHANGE_ENVELOPES.seCloverleaf.center;

    expect(BR344_PUBLISHED_NE_HANDOFF_SOURCE).toEqual([6120, BR344_SOURCE_Y]);
    expect(NE_CLOVERLEAF_PUBLISHED_CENTER_SOURCE).toEqual([5936, -2100]);
    expect(SE_CLOVERLEAF_PUBLISHED_JOIN_SOURCE).toEqual([6146, 4400]);
    expect(REAR_CALIBRATED_AXES.br472SouthRampToSouth.at(-1)).toEqual([6146, 4400]);

    expect(NE_CLOVERLEAF_CENTER_LOCAL[0]).toBeCloseTo(ne[0], 6);
    expect(NE_CLOVERLEAF_CENTER_LOCAL[1]).toBeCloseTo(ne[1], 6);
    expect(BR344_NE_CLOVERLEAF_HANDOFF.localPoint[0]).toBeCloseTo(ne[0], 4);
    expect(BR344_NE_CLOVERLEAF_HANDOFF.localPoint[1]).toBeCloseTo(ne[1], 4);
    expect(BR344_LOCAL_POLYLINE[0][1]).toBeCloseTo(ne[1], 4);
    expect(ne[0]).toBeCloseTo(br472MainlineXAt(ne[1]), 6);

    expect(SE_CLOVERLEAF_CENTER_LOCAL[0]).toBeCloseTo(se[0], 6);
    expect(SE_CLOVERLEAF_CENTER_LOCAL[1]).toBeCloseTo(se[1], 6);
    expect(SE_CLOVERLEAF_JOIN_LOCAL[1]).toBeLessThan(se[1]);
    expect(SE_CLOVERLEAF_JOIN_LOCAL[0]).toBeCloseTo(se[0], 6);

    const gap = (br472MainlineXAt(0) - PARK_LOCAL_BOUNDS.maxX) / PARK_LOCAL_BOUNDS.width;
    expect(gap).toBeCloseTo(BR472_EAST_GAP_IN_HUB_WIDTHS, 12);
    expect(gap).toBeGreaterThanOrEqual(0.25);
    expect(gap).toBeLessThan(0.4);
    expect(regionalHighwayEnvelopeWidth()).toBeCloseTo(
      REGIONAL_HIGHWAY_PROFILE.carriagewayWidth + REGIONAL_HIGHWAY_PROFILE.shoulderWidth * 2,
      12,
    );
    expect(NE_CLOVERLEAF_LAYOUT.carriagewayWidth).toBe(REGIONAL_HIGHWAY_PROFILE.dualCarriagewayWidth);
    expect(NE_CLOVERLEAF_LAYOUT.shoulderWidth).toBe(REGIONAL_HIGHWAY_PROFILE.shoulderWidth);
    expect(NE_CLOVERLEAF_LAYOUT.medianWidth).toBe(REGIONAL_HIGHWAY_PROFILE.medianWidth);
    expect(SE_CLOVERLEAF_LAYOUT.highwayWidth).toBe(REGIONAL_HIGHWAY_PROFILE.carriagewayWidth);
    expect(SE_CLOVERLEAF_LAYOUT.highwayShoulder).toBe(REGIONAL_HIGHWAY_PROFILE.shoulderWidth);
    expect(BR344_CROSS_SECTION.carriagewayWidth).toBe(REGIONAL_HIGHWAY_PROFILE.dualCarriagewayWidth);
    expect(BR344_CROSS_SECTION.medianWidth).toBe(REGIONAL_HIGHWAY_PROFILE.medianWidth);
    expect(BR344_CROSS_SECTION.shoulderWidth).toBe(REGIONAL_HIGHWAY_PROFILE.shoulderWidth);
    expect(BR344_CROSS_SECTION.yellowEdgeWidth).toBe(REGIONAL_HIGHWAY_PROFILE.edgeLineWidth);
  });

  it('não redesenha a fita principal através dos trevos', () => {
    const ne = INTERCHANGE_ENVELOPES.neCloverleaf.center;
    const se = INTERCHANGE_ENVELOPES.seCloverleaf.center;
    const stub = NE_CLOVERLEAF_LAYOUT.stubLength;

    BR472_EXTERIOR_SEGMENTS.forEach((segment) => {
      segment.centerline.forEach((point) => {
        expect(
          Math.hypot(point[0] - ne[0], point[1] - ne[1]),
          `${segment.id} through NE ${point.join(',')}`,
        ).toBeGreaterThan(stub - 0.05);
        expect(
          Math.hypot(point[0] - se[0], point[1] - se[1]),
          `${segment.id} through SE ${point.join(',')}`,
        ).toBeGreaterThan(8);
      });
    });

    const network = buildBr344MainlineGeometries({ reducedGraphics: true });
    try {
      const positions = network.carriageway!.getAttribute('position');
      for (let index = 0; index < positions.count; index += 1) {
        const x = positions.getX(index);
        expect(x < NE_CLOVERLEAF_STUBS.br344West.axis[0] + 0.05
          || x > NE_CLOVERLEAF_STUBS.br344East.axis[0] - 0.05).toBe(true);
      }
    } finally {
      disposeBr344MainlineGeometries(network);
    }
  });

  it('monta as três fatias na camada regional e não no grupo do estacionamento posterior', () => {
    const regional = read('src/features/commercial-map/components/canvas/RegionalHighwayNetwork.tsx');
    const rear = read('src/features/commercial-map/components/canvas/RearParkRoadNetwork.tsx');
    const canvas = read('src/features/commercial-map/components/canvas/CommercialMapCanvas.tsx');

    expect(regional).toContain('<Br344Mainline');
    expect(regional).toContain('<NeCloverleafInterchange');
    expect(regional).toContain('<SeCloverleaf');
    expect(rear).not.toContain('SeCloverleaf');
    expect(canvas).toContain('<RegionalHighwayNetwork');
    expect(canvas).not.toContain('Br344Mainline');
    expect(canvas).not.toContain('NeCloverleafInterchange');
    expect(canvas).not.toContain('SeCloverleaf');
    expect(collectRegionalHighwayLayers().map((layer) => layer.id)).toEqual(
      expect.arrayContaining([
        'br472-exterior-mainline',
        'br344-mainline',
        'ne-cloverleaf',
        'se-cloverleaf',
      ]),
    );
  });
});
