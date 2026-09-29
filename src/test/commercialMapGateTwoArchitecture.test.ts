import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import {
  buildParkAccessArchitectureModel,
  PARK_ACCESS_ARCHITECTURE_VERTICAL_PROFILE,
  PARK_ACCESS_GATE2_IDENTITY,
  parkAccessGate2IdentityPlacement,
  type ParkAccessGatePlacement,
} from '@/features/commercial-map/utils/parkAccessArchitecture';
import { PARK_ACCESS_INFRASTRUCTURE_INPUT } from '@/features/commercial-map/utils/parkAccessSpatialPlanAdapter';
import { PARK_ACCESS_SPATIAL_PLAN } from '@/features/commercial-map/data/parkAccessSpatialPlan';

const gate = PARK_ACCESS_INFRASTRUCTURE_INPUT.gates.find(item => item.key === 'gate2')!;
const model = (reducedGraphics = false) => buildParkAccessArchitectureModel([gate], null, { reducedGraphics });

function withMeshes(assert: (meshes: THREE.Mesh[]) => void) {
  const architecture = model();
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshBasicMaterial();
  const meshes = [...architecture.opaque, ...architecture.glass, ...architecture.metal].map(part => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = part.featureId;
    mesh.position.fromArray(part.position);
    mesh.quaternion.fromArray(part.quaternion);
    mesh.scale.fromArray(part.scale);
    mesh.updateMatrixWorld();
    return mesh;
  });
  try { assert(meshes); } finally { geometry.dispose(); material.dispose(); }
}

describe('Portão 2: photographed façade and two usable covered passages', () => {
  it('retains every A1/A3 part, transform, colour and batch from the pre-A2 baseline', () => {
    const protectedGates: ParkAccessGatePlacement[] = [
      { key: 'gate1', anchor: [1, 2], rotationRadians: .38, width: 2.4, depth: .82, elevation: .07 },
      { key: 'gate3', anchor: [4, -3], rotationRadians: -.2, width: 3.65, depth: 1.05, elevation: .04 },
    ];
    // Captured from 9ddda43f's unmodified builder, before the A2 reconstruction.
    const hashes = [
      '6d751f1e497d3095c17d4d63e671d83486e3eb924243a36e2b59406719a6516f',
      'feea9de8c5f5a16a353e425b600b6e8ae06c446b1c25d439637ac762a047a387',
    ];
    [false, true].forEach((reducedGraphics, index) => {
      const protectedModel = buildParkAccessArchitectureModel(protectedGates, null, { reducedGraphics });
      expect(createHash('sha256').update(JSON.stringify(protectedModel)).digest('hex')).toBe(hashes[index]);
    });
  });

  it('faces the avenue while retaining its cadastral anchor and inferred dimensions', () => {
    expect(gate.anchor).toEqual(PARK_ACCESS_SPATIAL_PLAN.anchors.gate2.point);
    expect(gate.rotationRadians).toBe(0);
    expect(gate.width).toBe(PARK_ACCESS_SPATIAL_PLAN.gates.gate2.width);
    expect(gate.depth).toBe(PARK_ACCESS_SPATIAL_PLAN.gates.gate2.depth);
    expect(PARK_ACCESS_ARCHITECTURE_VERTICAL_PROFILE.confidence).toBe('DIMENSIONALLY_INFERRED');
    expect(PARK_ACCESS_SPATIAL_PLAN.woodlandPath.centerline[0]).toEqual(gate.anchor);
  });

  it('keeps an 80cm-wide, 2.3m-high clear corridor through each side of the gate', () => {
    withMeshes(meshes => {
      const units = PARK_ACCESS_ARCHITECTURE_VERTICAL_PROFILE.mapUnitsPerMeter;
      const ray = new THREE.Raycaster();
      // Sample the walking body's lateral edges, centre and vertical envelope.
      // Rays cross the full depth, so a rear wall/barrier also fails this test.
      for (const side of [-1, 1]) for (const offset of [-0.4, 0, 0.4]) {
        for (const heightMeters of [0.3, 1.1, 1.8, 2.3]) {
          ray.set(new THREE.Vector3(
            gate.anchor[0] + side * gate.width * 0.36 + offset * units,
            0.057 + heightMeters * units,
            gate.anchor[1] + gate.depth,
          ), new THREE.Vector3(0, 0, -1));
          ray.far = gate.depth * 2;
          expect(ray.intersectObjects(meshes).map(hit => hit.object.name),
            `passage ${side}, offset ${offset}, height ${heightMeters}`).toEqual([]);
        }
      }
    });
  });

  it('has recessed glazing with visible jamb depth, not glass painted on a solid façade', () => {
    withMeshes(meshes => {
      const height = PARK_ACCESS_ARCHITECTURE_VERTICAL_PROFILE.gate2HeightMeters
        * PARK_ACCESS_ARCHITECTURE_VERTICAL_PROFILE.mapUnitsPerMeter;
      const ray = new THREE.Raycaster(new THREE.Vector3(
        gate.anchor[0] + gate.width * 0.09, height * 0.43, gate.anchor[1] + gate.depth,
      ), new THREE.Vector3(0, 0, -1), 0, gate.depth * 2);
      const intersections = ray.intersectObjects(meshes);
      expect(intersections[0]?.object.name).toBe('gate2:office-window');
      const interior = intersections.find(hit => hit.object.name === 'gate2:window-reveal');
      expect(interior).toBeDefined();
      expect(interior!.distance - intersections[0].distance).toBeGreaterThan(0.1);
      const frame = meshes.find(mesh => mesh.name === 'gate2:window-mullion-0.05')!;
      expect(frame.position.z + frame.scale.z / 2 - intersections[0].point.z).toBeGreaterThan(0.04);
    });
  });

  it('preserves the silhouette, passages and all positions in reduced graphics', () => {
    const full = model();
    const reduced = model(true);
    expect(reduced).toEqual(full);
    const fins = full.opaque.filter(part => part.featureId.startsWith('gate2:inclined-fin-'));
    expect(fins).toHaveLength(4);
    expect(fins.every(part => Math.abs(part.quaternion[0]) > 0.1)).toBe(true);
    expect(full.opaque.find(part => part.featureId === 'gate2:front-fascia')?.scale[0]).toBe(gate.width);
  });

  it('uses the official symbol and a single sign backing outside the walking volume', () => {
    const panel = parkAccessGate2IdentityPlacement(gate);
    expect(PARK_ACCESS_GATE2_IDENTITY).toEqual({
      symbolAsset: '/alvorada/fenasoja-symbol-official.png', wordmark: 'FENASOJA',
    });
    expect(model().opaque.filter(part => part.featureId === panel.featureId)).toEqual([panel]);
    expect(panel.position[1] - panel.scale[1] / 2).toBeGreaterThan(0.5);
    expect(panel.position[0] + panel.scale[0] / 2).toBeLessThan(gate.anchor[0] + gate.width / 2);
  });
});
