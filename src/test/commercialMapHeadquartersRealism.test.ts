import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  FENASOJA_COMPLEX as S,
  complexImageToSource,
  complexWorldPolygon,
  complexLocalToWorld,
  reconstructFenasojaEntity,
  withFenasojaComplexReconstruction,
} from "@/features/commercial-map/data/fenasojaComplexReconstruction";
import {
  OFFICIAL_REFERENCE_DATA,
  OFFICIAL_REFERENCE_ENTITIES,
} from "@/features/commercial-map/data/officialReference2026";
import {
  strategicLandmarkFacingRadians,
  strategicLandmarkSupportsInterior,
} from "@/features/commercial-map/utils/landmarks";
import { commercialSitePolygonInteriorsOverlap } from "@/features/commercial-map/utils/commercialSiteEnvironment";
import { lactalisStagePresentationFootprint } from "@/features/commercial-map/utils/lactalisStage";
const entity = (id: string) =>
  OFFICIAL_REFERENCE_ENTITIES.find((e) => e.publicIdentifier === id)!;

describe("reference-registered Fenasoja complex", () => {
  it("registers distinct street intersections with a uniform scale and rotated axes", () => {
    expect(complexImageToSource([170, 790])).toEqual([3988, 3494]);
    expect(complexImageToSource([828, 790])).toEqual([3988, 3716]);
    const o = complexLocalToWorld([0, 0], "headquarters"),
      right = complexLocalToWorld([1, 0], "headquarters"),
      front = complexLocalToWorld([0, 1], "headquarters");
    expect(right[0]).toBeCloseTo(o[0], 10);
    expect(right[1] - o[1]).toBeCloseTo(S.registration.unitsPerMeter, 10);
    expect(front[0] - o[0]).toBeCloseTo(-S.registration.unitsPerMeter, 10);
    expect(front[1]).toBeCloseTo(o[1], 10);
    expect(S.stage.roofWidth).toBeCloseTo(17.82, 2);
    expect(S.stage.roofDepth).toBeCloseTo(19.11, 2);
  });
  it("preserves UUID, parent, access metadata, history metadata and non-commercial identity", () => {
    const persisted = {
      ...entity("B12"),
      id: "persistent-uuid",
      parentEntityId: "persistent-parent",
      metadata: { permissions: { edit: true }, historyKey: "B12" },
    };
    const before = JSON.stringify(persisted),
      projected = reconstructFenasojaEntity(persisted);
    expect(projected.id).toBe(persisted.id);
    expect(projected.parentEntityId).toBe(persisted.parentEntityId);
    expect(projected.metadata).toMatchObject(persisted.metadata);
    expect(projected.isSellable).toBe(false);
    expect(strategicLandmarkSupportsInterior(projected)).toBe(true);
    expect(JSON.stringify(persisted)).toBe(before);
    expect(
      reconstructFenasojaEntity({
        ...persisted,
        publicIdentifier: "unrelated",
      }),
    ).toMatchObject({ geometry: persisted.geometry });
  });
  it("applies the registered envelope once and preserves subsequent versioned editing", () => {
    const projected = reconstructFenasojaEntity({
      ...entity("B12"),
      metadata: {},
    });
    const edited = {
      ...projected,
      geometry: {
        ...projected.geometry,
        coordinates: projected.geometry.coordinates.map((r) =>
          r.map(([x, z]) => [x + 1, z] as [number, number]),
        ),
      },
    };
    expect(reconstructFenasojaEntity(edited)).toBe(edited);
    const data = withFenasojaComplexReconstruction(OFFICIAL_REFERENCE_DATA);
    expect(data.entities).toHaveLength(OFFICIAL_REFERENCE_DATA.entities.length);
    expect(data.lots).toBe(OFFICIAL_REFERENCE_DATA.lots);
  });
  it("faces Brasilia and keeps photo-right toward Argentina for both structures", () => {
    expect(strategicLandmarkFacingRadians(entity("B12"))).toBe(-Math.PI / 2);
    expect(strategicLandmarkFacingRadians(entity("B13"))).toBe(-Math.PI / 2);
    const room = S.headquarters.volumes.volunteers;
    expect(room.center[0] - room.width / 2).toBeCloseTo(
      S.headquarters.volumes.main.width / 2 - 0.025,
      3,
    );
    expect(room.center[1] + room.depth / 2).toBeLessThan(
      S.headquarters.entrance[1],
    );
    expect(
      S.headquarters.monument.position[0] -
        S.headquarters.monument.planterRadius,
    ).toBeGreaterThan(1.8);
  });
  it("keeps roof and hard frontage clear of every named street and the adjacent stage", () => {
    const stage = lactalisStagePresentationFootprint();
    const headquarters = complexWorldPolygon("headquarters", "site");
    for (const id of [
      "RUA-BRASILIA",
      "RUA-URUGUAI-LESTE",
      "RUA-ARGENTINA-LESTE",
    ]) {
      const road = entity(id).geometry.coordinates[0];
      expect(
        commercialSitePolygonInteriorsOverlap(stage, road),
        `stage vs ${id}`,
      ).toBe(false);
      expect(
        commercialSitePolygonInteriorsOverlap(headquarters, road),
        `headquarters vs ${id}`,
      ).toBe(false);
    }
    expect(commercialSitePolygonInteriorsOverlap(stage, headquarters)).toBe(
      false,
    );
  });
  it("separates roof projections, walls and landscape without inventing commercial areas", () => {
    expect(S.headquarters.roofProjection).not.toEqual(S.headquarters.footprint);
    expect(S.headquarters.site).not.toEqual(S.headquarters.footprint);
    expect(S.registration.metersAreEstimates).toBe(true);
    expect(S.headquarters.sign.width).toBeGreaterThan(5);
    expect(
      existsSync(resolve("public", S.headquarters.sign.symbolAsset.slice(1))),
    ).toBe(true);
    expect(entity("B12").classification).toBe("ADMINISTRATION");
    expect(entity("B12").geometry.extrusionHeight).toBe(0.62);
    expect(entity("B13").classification).toBe("EVENT_VENUE");
  });
});
