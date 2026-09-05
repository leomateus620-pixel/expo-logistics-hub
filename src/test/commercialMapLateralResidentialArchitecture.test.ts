import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { LATERAL_DISTRICT_BLOCKS, lateralDistrictWorldPointToLocal } from '../features/commercial-map/data/lateralResidentialDistrict';
import { buildLateralResidentialRenderPlan, LATERAL_RESIDENTIAL_SHARED_ACCESS,
  type ResidentialInstance } from '../features/commercial-map/utils/lateralResidentialGeometry';

const plan = buildLateralResidentialRenderPlan();
const matrix = (item: ResidentialInstance) => new THREE.Matrix4().compose(
  new THREE.Vector3(...item.position), new THREE.Quaternion().setFromEuler(new THREE.Euler(...item.rotation)),
  new THREE.Vector3(...item.scale),
);
const bodyParts = (prefix: string) => plan.flatMap((cell) => cell.batches.masonry).filter((item) => item.id.startsWith(prefix)
  && !item.id.includes('-wall-') && !item.id.includes('-front-wall-') && !item.id.endsWith('-plinth'));

// Independent separating-axis check detects crossings even when all rectangle
// vertices lie exactly along another rectangle's horizontal edges.
function overlaps(a: readonly (readonly number[])[], b: readonly (readonly number[])[]) {
  return [a, b].every((polygon) => polygon.every((point, i) => {
    const next = polygon[(i + 1) % polygon.length];
    const axis = [-(next[1] - point[1]), next[0] - point[0]];
    const projection = (points: readonly (readonly number[])[]) => points.map((p) => p[0] * axis[0] + p[1] * axis[1]);
    const pa = projection(a), pb = projection(b);
    return Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb)) > 1e-7;
  }));
}
function footprint(item: ResidentialInstance) {
  const transform = matrix(item);
  return [[-.5, -.5], [.5, -.5], [.5, .5], [-.5, .5]].map(([x, z]) => {
    const p = new THREE.Vector3(x, 0, z).applyMatrix4(transform);
    return [p.x, p.z];
  });
}

describe('lateral residential architectural attachments and shared access', () => {
  it('attaches every facade pane, entry and garage to an emitted wall at its own floor', () => {
    for (const parcel of LATERAL_DISTRICT_BLOCKS.flatMap((block) => block.parcels).filter((item) => item.house)) {
      const fittings = plan.flatMap((cell) => [...cell.batches.glass, ...cell.batches.detail]).filter((item) => item.id.startsWith(`${parcel.id}-`)
        && /-(front-window|side-window|garden-window|entry-door|garage-shutter)/.test(item.id));
      expect(fittings.length, parcel.id).toBeGreaterThan(2);
      expect(fittings.filter((item) => item.id.endsWith('-entry-door')), parcel.id).toHaveLength(1);
      for (const fitting of fittings) {
        const entry = /-(entry-door|garage-shutter)$/.test(fitting.id);
        const shared = LATERAL_RESIDENTIAL_SHARED_ACCESS.find((access) => access.parcelId === parcel.id)?.path[0];
        const side = entry ? fitting.scale[0] < fitting.scale[2] ? 'x' : 'z' : fitting.id.includes('-side-window') ? 'x' : 'z';
        const sign = entry ? shared
          ? shared[side === 'x' ? 0 : 1] > parcel.house!.center[side === 'x' ? 0 : 1] ? 1 : -1
          : parcel.frontage === 'north' ? 1 : -1
          : fitting.id.includes('-side-window') || fitting.id.includes('-front-window') ? -1 : 1;
        if (entry && !shared) expect(side, `${fitting.id} faces its street`).toBe(parcel.frontage === 'avenue' ? 'z' : 'x');
        const attached = bodyParts(`${parcel.id}-`).some((body) => {
          const center = new THREE.Vector3(...fitting.position).applyMatrix4(matrix(body).invert());
          const cross = side === 'x' ? 'z' : 'x';
          const axisIndex = side === 'x' ? 0 : 2, crossIndex = side === 'x' ? 2 : 0;
          const thickness = fitting.scale[axisIndex] / body.scale[axisIndex];
          const crossRadius = fitting.scale[crossIndex] / body.scale[crossIndex] / 2;
          const verticalRadius = fitting.scale[1] / body.scale[1] / 2;
          const faceGap = (sign * center[side] - .5 - thickness / 2) * body.scale[axisIndex];
          return Math.abs(center[cross]) + crossRadius <= .501
            && Math.abs(center.y) + verticalRadius <= .501
            && faceGap >= -.001 && faceGap <= .003;
        });
        expect.soft(attached, `${fitting.id} must touch a wall, including upper storeys`).toBe(true);
      }
    }
  });

  it('keeps entry canopies inside parcels and connects each driveway to its garage', () => {
    const surfaces = plan.flatMap((cell) => cell.surfaces);
    const details = plan.flatMap((cell) => cell.batches.detail);
    for (const parcel of LATERAL_DISTRICT_BLOCKS.flatMap((block) => block.parcels).filter((item) => item.house)) {
      const canopy = details.find((item) => item.id === `${parcel.id}-entry-canopy`);
      if (canopy) for (const corner of footprint(canopy)) {
        const p = lateralDistrictWorldPointToLocal(corner as [number, number]);
        expect.soft(p[0], canopy.id).toBeGreaterThanOrEqual(parcel.bounds[0]);
        expect.soft(p[0], canopy.id).toBeLessThanOrEqual(parcel.bounds[2]);
        expect.soft(p[1], canopy.id).toBeGreaterThanOrEqual(parcel.bounds[1]);
        expect.soft(p[1], canopy.id).toBeLessThanOrEqual(parcel.bounds[3]);
      }
      const driveway = surfaces.find((surface) => surface.id === `${parcel.id}-driveway`);
      if (!driveway) continue;
      for (const wall of plan.flatMap((cell) => cell.batches.masonry).filter((item) => item.id.includes('-wall-'))) {
        expect.soft(overlaps(driveway.polygon, footprint(wall)), `${parcel.id} driveway blocked by ${wall.id}`).toBe(false);
      }
      const garage = details.find((item) => item.id === `${parcel.id}-garage-shutter`)!;
      expect(garage, parcel.id).toBeDefined();
      const garageCenter = lateralDistrictWorldPointToLocal([garage.position[0], garage.position[2]]);
      const polygon = driveway.polygon.map(lateralDistrictWorldPointToLocal);
      const closest = Math.min(...polygon.map((p, i) => {
        const q = polygon[(i + 1) % polygon.length];
        const dx = q[0] - p[0], dz = q[1] - p[1];
        const ratio = Math.max(0, Math.min(1, ((garageCenter[0] - p[0]) * dx + (garageCenter[1] - p[1]) * dz) / (dx * dx + dz * dz)));
        return Math.hypot(garageCenter[0] - p[0] - ratio * dx, garageCenter[1] - p[1] - ratio * dz);
      }));
      expect.soft(closest, `${parcel.id} driveway reaches garage`).toBeLessThan(.15);
    }
  });

  it('fits each solar array to the actual roof slope with a small mounting clearance', () => {
    for (const cell of plan) for (const panel of cell.batches.solar) {
      const prefix = panel.id.replace(/-solar-array$/, '-');
      const roofs = [...cell.batches.hipRoof, ...cell.batches.gableRoof, ...cell.batches.flatRoof].filter((item) => item.id.startsWith(prefix));
      const worldCorners = [-.5, .5].flatMap((x) => [-.5, .5].map((z) => new THREE.Vector3(x, -.5, z).applyMatrix4(matrix(panel))));
      const supported = roofs.some((roof) => {
        const inverse = matrix(roof).invert();
        const flat = cell.batches.flatRoof.includes(roof);
        return worldCorners.every((world) => {
          const point = world.clone().applyMatrix4(inverse);
          const surfaceY = flat ? .5 : Math.min(1 - Math.abs(point.z) * 2,
            cell.batches.hipRoof.includes(roof) ? (.5 - Math.abs(point.x)) / .26 : 1);
          const gap = (point.y - surfaceY) * roof.scale[1];
          return Math.abs(point.x) <= .5 && Math.abs(point.z) <= .5 && gap >= .001 && gap < .025;
        });
      });
      expect.soft(supported, `${panel.id} must follow a roof plane`).toBe(true);
      expect(cell.batches.detail.filter((item) => item.id.startsWith(`${prefix}solar-rail-`))).toHaveLength(2);
    }
  });

  it('replaces landlocked vehicle driveways with open pedestrian links through compounds', () => {
    const surfaces = plan.flatMap((cell) => cell.surfaces);
    const solids = plan.flatMap((cell) => [...cell.batches.masonry, ...cell.batches.poolRect,
      ...cell.batches.poolRounded, ...cell.batches.poolKidney]).filter((item) => !item.id.endsWith('-plinth')
        && (!item.id.includes('-pool-') || item.id.endsWith('-pool-deck')));
    for (const connection of LATERAL_RESIDENTIAL_SHARED_ACCESS) {
      expect(surfaces.some((item) => item.id === `${connection.parcelId}-driveway`)).toBe(false);
      const paths = surfaces.filter((item) => item.id.startsWith(`${connection.parcelId}-shared-access-`));
      expect(paths).toHaveLength(connection.path.length - 1);
      expect(LATERAL_DISTRICT_BLOCKS.flatMap((block) => block.parcels).some((parcel) => parcel.id === connection.ownerId)).toBe(true);
      for (const path of paths) for (const solid of solids) {
        expect.soft(overlaps(path.polygon, footprint(solid)), `${path.id} blocked by ${solid.id}`).toBe(false);
      }
      const endpoint = paths.at(-1)!.polygon.map(lateralDistrictWorldPointToLocal);
      expect(endpoint.some(([s, t]) => t <= 10.2 || s < 98 || s < 250 && s > 248), connection.parcelId).toBe(true);
    }
  });
});
