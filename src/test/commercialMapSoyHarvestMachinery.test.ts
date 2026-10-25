import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Box3, BufferGeometry, Frustum, Material, Matrix4, Mesh, PerspectiveCamera, Texture, Vector3 } from 'three';
import { createSoyMachineFleet } from '@/features/commercial-map/harvest/models/soyMachines';
import { sampleSoyTruckPath, SOY_GRAIN_PARTICLE_COUNT, SOY_TRUCK_PATH_LENGTH, SOY_UNLOAD_TRUCK_POSE, soyIsEmittingGrain } from '@/features/commercial-map/harvest/SoyHarvestScene';
import { sampleSoyCycle, sampleSoyWorkPath } from '@/features/commercial-map/harvest/soyHarvestTimeline';
import { SOY_HARVEST_LAYOUT } from '@/features/commercial-map/data/soyHarvestLayout';
import { createSoyMachineDissolve } from '@/features/commercial-map/harvest/soyMachineDissolve';
import { publishSoyHarvestCamera, soyHarvestCameraFrame } from '@/features/commercial-map/harvest/SoyHarvestCamera';

beforeEach(() => { vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ fillStyle: '', font: '', fillRect: vi.fn(), fillText: vi.fn() } as unknown as CanvasRenderingContext2D); });
afterEach(() => vi.restoreAllMocks());

describe('owned machinery geometry and world discharge', () => {
  it('puts the actual articulated outlet above the open truck interior at every emitting frame', () => {
    const fleet = createSoyMachineFleet(), world = new Vector3(), local = new Vector3();
    const final = SOY_HARVEST_LAYOUT.finalPose, truck = SOY_UNLOAD_TRUCK_POSE;
    fleet.combine.group.position.set(final.x, SOY_HARVEST_LAYOUT.groundY, final.z); fleet.combine.group.rotation.y = final.heading;
    fleet.truck.group.position.set(truck.x, SOY_HARVEST_LAYOUT.groundY, truck.z); fleet.truck.group.rotation.y = truck.heading;
    for (let time = 38.5; time < 43; time += .15) {
      const sample = sampleSoyCycle(time); fleet.combine.augerPivot.rotation.y = sample.auger * Math.PI / 2;
      fleet.combine.group.updateMatrixWorld(true); fleet.truck.group.updateMatrixWorld(true);
      fleet.combine.augerOutlet.getWorldPosition(world); local.copy(world); fleet.truck.group.worldToLocal(local);
      const interior = fleet.truck.group.userData.bedInterior;
      // Includes the .03-world-unit stream spread, safely inside walls and behind cab.
      expect(local.x - .2).toBeGreaterThan(interior.minX); expect(local.x + .2).toBeLessThan(interior.maxX);
      expect(local.z - .2).toBeGreaterThan(interior.minZ); expect(local.z + .2).toBeLessThan(interior.maxZ);
      expect(local.y).toBeGreaterThan(interior.topY);
      const grainTop = 1.16 + .05 + sample.truckFill * 1.28;
      expect(grainTop + .075 * 1.33).toBeLessThan(interior.topY);
      expect(soyIsEmittingGrain(time, true)).toBe(true); expect(soyIsEmittingGrain(time, false)).toBe(false);
    }
    expect(SOY_GRAIN_PARTICLE_COUNT).toBeLessThanOrEqual(512);
    fleet.dispose();
  });
  it('aligns model cutter and planter contact points with the same path used by masks', () => {
    const fleet = createSoyMachineFleet(), point = new Vector3();
    for (const progress of [.02, .2, .42, .63, .8, .98]) {
      const pose = sampleSoyWorkPath(progress);
      for (const [machine, contactZ] of [[fleet.combine, 4.99], [fleet.tractor, -4.5]] as const) {
        machine.group.position.set(pose.x - Math.sin(pose.heading) * contactZ * .15, .024, pose.z - Math.cos(pose.heading) * contactZ * .15);
        machine.group.rotation.y = pose.heading; machine.group.updateMatrixWorld(true);
        point.set(0, 0, contactZ); machine.group.localToWorld(point);
        expect(point.x).toBeCloseTo(pose.x, 7); expect(point.z).toBeCloseTo(pose.z, 7);
      }
    }
    fleet.dispose();
  });
  it('starts the truck with its parked heading and follows a continuous exit to the highway', () => {
    const pose = { x: 0, z: 0, heading: 0 }; sampleSoyTruckPath(0, pose);
    expect(pose).toMatchObject(SOY_UNLOAD_TRUCK_POSE);
    let previous = { ...pose };
    for (let i = 1; i <= 1000; i += 1) {
      sampleSoyTruckPath(i / 1000, pose);
      expect(Math.hypot(pose.x - previous.x, pose.z - previous.z)).toBeLessThan(.06);
      const delta = Math.atan2(Math.sin(pose.heading - previous.heading), Math.cos(pose.heading - previous.heading));
      expect(Math.abs(delta)).toBeLessThan(.25);
      previous = { ...pose };
    }
    const end = SOY_HARVEST_LAYOUT.truckPath.at(-1)!;
    expect(pose.x).toBeCloseTo(end[0]); expect(pose.z).toBeCloseTo(end[1]);
  });
  it('starts the transport ellipse only after the full truck envelope has left desktop/mobile framing', () => {
    const fleet = createSoyMachineFleet(), pose = sampleSoyTruckPath(7.25 / SOY_TRUCK_PATH_LENGTH, { x: 0, z: 0, heading: 0 });
    fleet.truck.group.position.set(pose.x, .024, pose.z); fleet.truck.group.rotation.y = pose.heading; fleet.truck.group.updateMatrixWorld(true);
    soyHarvestCameraFrame.initial.captured = true;
    for (const [width, height] of [[1920, 1080], [1366, 768], [390, 844], [390, 766]]) for (const reduced of [false, true]) {
      publishSoyHarvestCamera(47.8, reduced, width < height);
      const frame = soyHarvestCameraFrame, camera = new PerspectiveCamera(frame.fov, width / height, .02, 500);
      camera.position.set(frame.position.x, frame.position.y, frame.position.z); camera.lookAt(frame.target.x, frame.target.y, frame.target.z); camera.updateMatrixWorld();
      const envelope = [];
      for (const x of [-1.57, 1.57]) for (const y of [0, 3.1]) for (const z of [-4.4, 4]) envelope.push(fleet.truck.group.localToWorld(new Vector3(x, y, z)));
      const frustum = new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      expect(frustum.intersectsBox(new Box3().setFromPoints(envelope)), `${width}x${height}, reduced=${reduced}`).toBe(false);
    }
    fleet.dispose();
  });
  it('keeps the complete header, deployed auger and truck inside the portrait safe frame', () => {
    const fleet = createSoyMachineFleet(), final = SOY_HARVEST_LAYOUT.finalPose;
    const camera = new PerspectiveCamera(44, 390 / 766, .02, 500), point = new Vector3();
    soyHarvestCameraFrame.initial.captured = true;
    fleet.truck.group.position.set(SOY_UNLOAD_TRUCK_POSE.x, .024, SOY_UNLOAD_TRUCK_POSE.z);
    fleet.truck.group.rotation.y = SOY_UNLOAD_TRUCK_POSE.heading;
    // The actual canvas excludes the 78px app header. Check every quarter-second
    // through arrival/deployment/retraction, plus the completed composition.
    for (const time of [...Array.from({ length: 29 }, (_, index) => 37 + index / 4), 48]) {
      const cycle = sampleSoyCycle(time), work = sampleSoyWorkPath(cycle.harvested);
      fleet.combine.group.position.set(work.x - Math.sin(work.heading) * .7485 + cycle.combineArrival, .024, work.z - Math.cos(work.heading) * .7485);
      fleet.combine.group.rotation.y = final.heading;
      fleet.combine.augerPivot.rotation.y = cycle.auger * Math.PI / 2;
      publishSoyHarvestCamera(time, false, true);
      const frame = soyHarvestCameraFrame;
      camera.position.set(frame.position.x, frame.position.y, frame.position.z);
      camera.lookAt(frame.target.x, frame.target.y, frame.target.z); camera.updateMatrixWorld();
      for (const machine of time === 48 ? [fleet.combine] : [fleet.combine, fleet.truck]) {
        machine.group.updateMatrixWorld(true);
        machine.group.traverse(object => {
          if (!(object instanceof Mesh)) return;
          object.geometry.computeBoundingBox();
          const bounds = object.geometry.boundingBox!;
          for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
            point.set(x, y, z).applyMatrix4(object.matrixWorld).project(camera);
            const context = `${machine.group.name}/${object.name} at ${time}s`;
            expect(Math.abs(point.x), context).toBeLessThanOrEqual(.9);
            expect(Math.abs(point.y), context).toBeLessThanOrEqual(.9);
            expect(point.z, context).toBeGreaterThan(-1); expect(point.z, context).toBeLessThan(1);
          }
        });
      }
    }
    fleet.dispose();
  });
  it('owns finite resources independently and disposes every geometry/material exactly once', () => {
    const counts: number[] = [];
    const previousGeometries = new Set<BufferGeometry>();
    for (let repeat = 0; repeat < 3; repeat += 1) {
      const fleet = createSoyMachineFleet(), geometries = new Set<BufferGeometry>(), materials = new Set<Material>(), textures = new Set<Texture>();
      for (const machine of [fleet.tractor, fleet.sprayer, fleet.combine, fleet.truck]) machine.group.traverse(object => {
        if (!(object instanceof Mesh)) return;
        geometries.add(object.geometry);
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          materials.add(material); for (const value of Object.values(material)) if (value instanceof Texture) textures.add(value);
        }
      });
      const all = [...geometries, ...materials, ...textures], disposed = new Map<object, number>();
      for (const resource of all) resource.addEventListener('dispose', () => disposed.set(resource, (disposed.get(resource) ?? 0) + 1));
      for (const geometry of geometries) expect(previousGeometries.has(geometry)).toBe(false);
      counts.push(geometries.size + materials.size + textures.size);
      fleet.dispose(); expect(disposed.size).toBe(all.length);
      for (const value of disposed.values()) expect(value).toBe(1);
      for (const geometry of geometries) previousGeometries.add(geometry);
    }
    expect(counts[1]).toBe(counts[0]); expect(counts[2]).toBe(counts[0]);
  });
  it('dissolves through owned opaque material variants without extra meshes and restores/disposes them', () => {
    const fleet = createSoyMachineFleet(), meshes: Mesh[] = [];
    fleet.combine.group.traverse(object => { if (object instanceof Mesh) meshes.push(object); });
    const originals = meshes.map(mesh => mesh.material), controls = createSoyMachineDissolve(fleet.combine.group);
    const clones = new Set<Material>(), disposed = vi.fn();
    meshes.forEach((mesh, index) => {
      expect(mesh.material).not.toBe(originals[index]);
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) { expect(material.transparent).toBe(false); clones.add(material); }
    });
    for (const material of clones) material.addEventListener('dispose', disposed);
    const count = fleet.combine.group.children.length;
    controls.visibility.value = .4;
    const shader = { uniforms: {}, fragmentShader: '#include <dithering_fragment>' };
    const material = [...clones][0]; material.onBeforeCompile(shader as never, {} as never);
    expect(shader.fragmentShader).toContain('discard'); expect(shader.uniforms).toMatchObject({ soyMachineVisibility: { value: .4 } });
    expect(fleet.combine.group.children.length).toBe(count);
    controls.dispose(); controls.dispose(); expect(disposed).toHaveBeenCalledTimes(clones.size);
    meshes.forEach((mesh, index) => expect(mesh.material).toBe(originals[index])); fleet.dispose();
  });
});
