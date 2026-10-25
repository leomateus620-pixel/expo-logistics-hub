import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { CatmullRomCurve3, CylinderGeometry, DynamicDrawUsage, Group, InstancedMesh, Mesh, MeshStandardMaterial, Object3D, Quaternion, SphereGeometry, Vector3 } from 'three';
import { SOY_HARVEST_LAYOUT } from '../data/soyHarvestLayout';
import { createSoyMachineFleet, type SoyMachine } from './models/soyMachines';
import { clampSoy, createSoyWorkPose, sampleSoyCycle, sampleSoyWorkPath, soyEase, soyTransportDistance } from './soyHarvestTimeline';
import { soyFieldFrame, soyHarvestClock, useSoyHarvestStore } from './useSoyHarvestStore';
import { prepareSoyHarvestResources } from './prepareSoyHarvestResources';
import { createSoyMachineDissolve } from './soyMachineDissolve';
import { createSoyHarvestNightFill } from './soyHarvestNightFill';
import { useCommercialMapStore } from '../state/useCommercialMapStore';

const SCALE = SOY_HARVEST_LAYOUT.unitsPerMetre;
export const SOY_GRAIN_PARTICLE_COUNT = 160;
export const SOY_UNLOAD_TRUCK_POSE = Object.freeze({ x: 62.5525, z: -51.4955, heading: Math.PI / 2 });
const NO_RAYCAST = () => undefined;
const UP = new Vector3(0, 1, 0);
const truckCurve = new CatmullRomCurve3([new Vector3(62.5525, 0, -51.4955), new Vector3(63.25, 0, -51.4955), new Vector3(64.1, 0, -50.9), ...SOY_HARVEST_LAYOUT.truckPath.slice(1).map(point => new Vector3(point[0], 0, point[1]))], false, 'centripetal');
const truckPoints = truckCurve.getSpacedPoints(160);
export const SOY_TRUCK_PATH_LENGTH = truckCurve.getLength();
const truckHeadings = Array.from({ length: 161 }, (_, index) => {
  const direction = truckCurve.getTangentAt(index / 160);
  return Math.atan2(direction.x, direction.z);
});
/** Stage boundary invariants are shared by the renderer and tests. */
export function soyIsEmittingGrain(time: number, running: boolean) { return running && time >= 38.5 && time < 43; }

function wheels(machine: SoyMachine, distance: number) {
  for (const wheel of machine.wheels) wheel.rotation.x = distance / (SCALE * (wheel.userData.radius as number));
}
function place(machine: SoyMachine, x: number, z: number, heading: number) {
  machine.group.position.set(x, SOY_HARVEST_LAYOUT.groundY, z); machine.group.rotation.y = heading;
}

/** Open-verge connector, then the existing highway. Tangent-based heading avoids
 * jumping between axis-aligned vehicle poses at the access junction. */
export function sampleSoyTruckPath(progress: number, target: { x: number; z: number; heading: number }) {
  // Precomputed, arc-length-sampled spline: no vectors or path arrays per frame.
  const p = clampSoy(progress) * 160, index = Math.min(159, Math.floor(p));
  const local = p - index, a = truckPoints[index], b = truckPoints[index + 1];
  target.x = a.x + (b.x - a.x) * local; target.z = a.z + (b.z - a.z) * local;
  const turn = Math.atan2(Math.sin(truckHeadings[index + 1] - truckHeadings[index]), Math.cos(truckHeadings[index + 1] - truckHeadings[index]));
  const pathHeading = truckHeadings[index] + turn * local;
  const headingDelta = Math.atan2(Math.sin(pathHeading - Math.PI / 2), Math.cos(pathHeading - Math.PI / 2));
  target.heading = Math.PI / 2 + headingDelta * soyEase(clampSoy(progress) / .04);
  return target;
}

export function SoyHarvestScene() {
  const invalidate = useThree(state => state.invalidate);
  const gl = useThree(state => state.gl);
  const camera = useThree(state => state.camera);
  const scene = useThree(state => state.scene);
  const nightMode = useCommercialMapStore(state => state.nightModeActive);
  const resources = useMemo(() => {
    const fleet = createSoyMachineFleet(), root = new Group(); root.name = 'soy-harvest-runtime';
    const tractorDissolve = createSoyMachineDissolve(fleet.tractor.group);
    const sprayerDissolve = createSoyMachineDissolve(fleet.sprayer.group);
    const combineDissolve = createSoyMachineDissolve(fleet.combine.group);
    root.add(fleet.tractor.group, fleet.sprayer.group, fleet.combine.group, fleet.truck.group);
    const grainGeometry = new SphereGeometry(.007, 5, 3), grainMaterial = new MeshStandardMaterial({ color: '#c8ab61', roughness: .95 });
    const grains = new InstancedMesh(grainGeometry, grainMaterial, SOY_GRAIN_PARTICLE_COUNT);
    grains.instanceMatrix.setUsage(DynamicDrawUsage); grains.frustumCulled = false; grains.raycast = NO_RAYCAST; root.add(grains);
    const streamGeometry = new CylinderGeometry(.022, .032, 1, 7), streamMaterial = new MeshStandardMaterial({ color: '#b99a51', roughness: 1 });
    const stream = new Mesh(streamGeometry, streamMaterial); stream.raycast = NO_RAYCAST; root.add(stream);
    const mistGeometry = new CylinderGeometry(.006, .054, .16, 5, 1, true), mistMaterial = new MeshStandardMaterial({ color: '#e4ece1', transparent: true, opacity: .16, depthWrite: false });
    const mist = new InstancedMesh(mistGeometry, mistMaterial, fleet.sprayer.nozzles.length);
    mist.instanceMatrix.setUsage(DynamicDrawUsage); mist.frustumCulled = false; mist.raycast = NO_RAYCAST; root.add(mist);
    const seeds = new InstancedMesh(grainGeometry, grainMaterial, 32); seeds.frustumCulled = false; seeds.raycast = NO_RAYCAST; root.add(seeds);
    const nightFill = createSoyHarvestNightFill(root);
    nightFill.setActive(useCommercialMapStore.getState().nightModeActive);
    return { fleet, root, nightFill, tractorDissolve, sprayerDissolve, combineDissolve, grains, stream, mist, seeds, grainGeometry, grainMaterial, streamGeometry, streamMaterial, mistGeometry, mistMaterial,
      dummy: new Object3D(), outlet: new Vector3(), bed: new Vector3(), delta: new Vector3(), nozzle: new Vector3(), rotation: new Quaternion(),
      sample: sampleSoyCycle(0), planting: createSoyWorkPose(), harvesting: createSoyWorkPose(), truckPose: { x: 0, z: 0, heading: 0 } };
  }, []);
  useEffect(() => {
    let mounted = true;
    const session = useSoyHarvestStore.getState().session;
    // Compile only owned content with the existing scene's lights/environment.
    // No second renderer and no participation in global readiness or warmup.
    resources.root.visible = true;
    for (const machine of [resources.fleet.tractor, resources.fleet.sprayer, resources.fleet.combine, resources.fleet.truck]) machine.group.visible = true;
    const preparation = prepareSoyHarvestResources(gl, resources.root, camera, scene);
    resources.root.visible = false;
    preparation.promise.then(() => {
      if (!mounted || session !== useSoyHarvestStore.getState().session) return;
      resources.root.visible = true; useSoyHarvestStore.getState().ready(session); invalidate();
    }).catch(() => {
      if (mounted && session === useSoyHarvestStore.getState().session) useSoyHarvestStore.getState().fail('Não foi possível preparar os materiais da lavoura. Tente novamente.');
    });
    return () => {
      mounted = false;
      preparation.cancel();
      resources.nightFill.dispose();
      resources.tractorDissolve.dispose(); resources.sprayerDissolve.dispose(); resources.combineDissolve.dispose();
      // Instanced attributes belong to the objects, not their shared geometry.
      // R3F cannot release them because this owned primitive uses dispose=null.
      resources.grains.dispose(); resources.mist.dispose(); resources.seeds.dispose();
      resources.fleet.dispose(); resources.grainGeometry.dispose(); resources.grainMaterial.dispose();
      resources.streamGeometry.dispose(); resources.streamMaterial.dispose(); resources.mistGeometry.dispose(); resources.mistMaterial.dispose();
    };
  }, [resources, invalidate, gl, camera, scene]);
  useEffect(() => { resources.nightFill.setActive(nightMode); invalidate(); }, [resources, nightMode, invalidate]);

  useFrame(() => {
    const state = useSoyHarvestStore.getState(), t = soyHarvestClock.elapsed;
    const { fleet, sample, planting, harvesting, dummy, outlet, bed, delta } = resources;
    if (state.status === 'loading') return;
    // Existing particles remain frozen; the clock/emitter and invalidations stop.
    // A reduced-motion stage seek is still rendered because its time differs.
    if (state.status === 'paused' && resources.root.userData.lastTime === t) return;
    resources.root.userData.lastTime = t;
    sampleSoyCycle(t, sample);
    sampleSoyWorkPath(sample.planted, planting); sampleSoyWorkPath(sample.harvested, harvesting);
    for (let lane = 0; lane < 3; lane += 1) {
      soyFieldFrame.sown[lane] = planting.lanes[lane]; soyFieldFrame.harvested[lane] = harvesting.lanes[lane];
    }
    soyFieldFrame.growth = sample.growth; soyFieldFrame.maturity = sample.maturation;
    const active = state.fieldState === 'cycle', running = state.status === 'running';
    resources.tractorDissolve.visibility.value = sample.plantVisibility;
    fleet.tractor.group.visible = active && t < 6 && sample.plantVisibility > 0;
    {
      // Pose is the deposition point. The towing tractor is ahead by the actual model's offset.
      place(fleet.tractor, planting.x + Math.sin(planting.heading) * .675, planting.z + Math.cos(planting.heading) * .675, planting.heading);
      fleet.tractor.planterPivot.rotation.y = planting.working ? 0 : Math.sin((planting.distance % (18 + Math.PI * .9)) / .9) * .25;
      wheels(fleet.tractor, planting.distance);
    }
    resources.sprayerDissolve.visibility.value = sample.managementVisibility;
    fleet.sprayer.group.visible = active && t >= 16 && t < 21 && sample.managementVisibility > 0;
    const sprayerDistance = sample.management * 18;
    const sprayerX = 43 + sprayerDistance;
    place(fleet.sprayer, sprayerX, -54.5, Math.PI / 2); wheels(fleet.sprayer, sprayerDistance);
    const combineVisibility = state.fieldState === 'harvested' ? 1 : t < 36.4 ? sample.harvestVisibility : sample.combineArrivalVisibility;
    resources.combineDissolve.visibility.value = combineVisibility;
    fleet.combine.group.visible = state.fieldState === 'harvested' || (active && t >= 27 && combineVisibility > 0);
    const bodyX = harvesting.x - Math.sin(harvesting.heading) * .7485;
    const bodyZ = harvesting.z - Math.cos(harvesting.heading) * .7485;
    place(fleet.combine, bodyX + sample.combineArrival, bodyZ, harvesting.heading);
    fleet.combine.reel.rotation.x = -harvesting.distance * 3.5;
    wheels(fleet.combine, harvesting.distance + sample.combineArrival);
    fleet.combine.augerPivot.rotation.y = sample.auger * Math.PI / 2;
    const machineLoadHeight = .025 + sample.machineFill * .35;
    fleet.combine.load.scale.y = machineLoadHeight;
    fleet.combine.load.position.y = 4.19 + machineLoadHeight / 2;
    // Parked truck: the bed centre is under the deployed outlet, determined from
    // authored local transforms. During emission the actual world outlet is read below.
    const truckX = SOY_UNLOAD_TRUCK_POSE.x, truckZ = SOY_UNLOAD_TRUCK_POSE.z;
    fleet.truck.group.visible = (active && t >= 26.6 && t < 48);
    if (t < 44) place(fleet.truck, truckX, truckZ, Math.PI / 2);
    else {
      const truckDistance = soyTransportDistance(t, SOY_TRUCK_PATH_LENGTH);
      sampleSoyTruckPath(truckDistance / SOY_TRUCK_PATH_LENGTH, resources.truckPose);
      place(fleet.truck, resources.truckPose.x, resources.truckPose.z, resources.truckPose.heading);
      wheels(fleet.truck, truckDistance);
    }
    const loadHeight = .05 + sample.truckFill * 1.28;
    fleet.truck.load.scale.y = loadHeight; fleet.truck.load.position.y = 1.16 + loadHeight / 2;
    fleet.combine.group.updateMatrixWorld(true); fleet.truck.group.updateMatrixWorld(true);
    const emitting = soyIsEmittingGrain(t, running);
    resources.grains.visible = emitting || (state.status === 'paused' && sample.unloading); resources.stream.visible = resources.grains.visible;
    // A paused stage seek still needs one frozen sample of the stream geometry.
    // Normal pause returns early above, so no particles advance or are emitted.
    if (resources.grains.visible) {
      fleet.combine.augerOutlet.getWorldPosition(outlet); fleet.truck.bedCenter.getWorldPosition(bed);
      bed.y = SOY_HARVEST_LAYOUT.groundY + (1.16 + loadHeight) * SCALE;
      delta.subVectors(bed, outlet);
      resources.stream.position.copy(outlet).addScaledVector(delta, .5);
      resources.stream.scale.y = delta.length(); resources.stream.quaternion.setFromUnitVectors(UP, resources.nozzle.copy(delta).normalize());
      for (let i = 0; i < SOY_GRAIN_PARTICLE_COUNT; i += 1) {
        const fall = (t * 2.7 + i * .61803398875) % 1, gravity = fall * fall;
        const spread = .012 + fall * .018;
        dummy.position.copy(outlet).addScaledVector(delta, gravity);
        dummy.position.x += Math.sin(i * 2.39996) * spread; dummy.position.z += Math.cos(i * 2.39996) * spread;
        dummy.scale.setScalar(.7 + (i % 5) * .14); dummy.rotation.set(i, t + i, 0); dummy.updateMatrix(); resources.grains.setMatrixAt(i, dummy.matrix);
      }
      resources.grains.instanceMatrix.needsUpdate = true;
    }
    resources.mist.visible = (running || state.status === 'paused') && t >= 16 && t < 21 && sample.managementVisibility > .2;
    resources.mistMaterial.opacity = .16 * sample.managementVisibility;
    if (resources.mist.visible) {
      fleet.sprayer.group.updateMatrixWorld(true);
      for (let i = 0; i < fleet.sprayer.nozzles.length; i += 1) {
        fleet.sprayer.nozzles[i].getWorldPosition(resources.nozzle);
        dummy.position.copy(resources.nozzle); dummy.position.y -= .08;
        dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(.8 + Math.sin(t * 7 + i) * .1); dummy.updateMatrix(); resources.mist.setMatrixAt(i, dummy.matrix);
      }
      resources.mist.instanceMatrix.needsUpdate = true;
    }
    resources.seeds.visible = (running || state.status === 'paused') && t < 6 && planting.working && sample.plantVisibility > .2;
    if (resources.seeds.visible) {
      for (let i = 0; i < 32; i += 1) {
        const lateral = (i % 16 - 7.5) * .108;
        dummy.position.set(planting.x + Math.cos(planting.heading) * lateral, SOY_HARVEST_LAYOUT.groundY + .012 + ((i / 32 + t * 5) % 1) * .03, planting.z - Math.sin(planting.heading) * lateral);
        dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(.5); dummy.updateMatrix(); resources.seeds.setMatrixAt(i, dummy.matrix);
      }
      resources.seeds.instanceMatrix.needsUpdate = true;
    }
  }, -2);
  return <primitive object={resources.root} dispose={null} />;
}
