import { describe, expect, it } from "vitest";
import { lactalisAudienceOrientationProposal } from "@/features/commercial-map/utils/lactalisOrientationProposal";
import { FENASOJA_COMPLEX } from "@/features/commercial-map/data/fenasojaComplexReconstruction";
import { OFFICIAL_REFERENCE_ENTITIES } from "@/features/commercial-map/data/officialReference2026";
import persistedLayout from "./fixtures/soyGatePersistedLayout.json";
import type { Coordinate } from "@/features/commercial-map/types";

describe("Lactalis reference orientation", () => {
  it("resolves exact D11/D12 entities and street normal without skewing toward a centroid", () => {
    const p = lactalisAudienceOrientationProposal();
    expect(p.lots.map((l) => l.publicIdentifier)).toEqual(["Q-D-11", "Q-D-12"]);
    expect(p.degrees).toBe(-90);
    expect(p.yaw).toBe(p.expectedYaw);
    expect(p.angleToAudienceMidpoint).not.toBeCloseTo(p.yaw, 3);
    p.lots.forEach((l) => expect(l.center[0]).toBeLessThan(p.center[0]));
    expect(p.planScale).toBe(1);
    expect(p.collisions).toEqual([]);
    expect(p.status).toBe("APPLIED_REFERENCE_REGISTRATION");
  });
  it("replaces older persisted placeholders while retaining entity IDs and input immutability", () => {
    const entities = OFFICIAL_REFERENCE_ENTITIES.map((e) => {
      const row =
        persistedLayout[e.publicIdentifier as keyof typeof persistedLayout];
      return row
        ? {
            ...e,
            metadata: { ...e.metadata, reconstructionRevision: undefined },
            geometry: {
              ...e.geometry,
              coordinates: row.geometry.coordinates as Coordinate[][],
            },
          }
        : e;
    });
    const before = JSON.stringify(entities),
      p = lactalisAudienceOrientationProposal(entities);
    expect(p.center[0]).toBeCloseTo(FENASOJA_COMPLEX.stage.origin[0], 8);
    expect(p.center[1]).toBeCloseTo(FENASOJA_COMPLEX.stage.origin[1], 8);
    expect(p.collisions).toEqual([]);
    expect(JSON.stringify(entities)).toBe(before);
  });
});
