import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createSoyMachineFleet } from '@/features/commercial-map/harvest/models/soyMachines';

afterEach(()=>vi.unstubAllGlobals());
describe('soy machine bindings and resource ownership',()=>{
  it('keeps articulation outlets and an open load volume in a shared physical scale',()=>{
    vi.stubGlobal('document',undefined);
    const fleet=createSoyMachineFleet();
    expect(fleet.combine.group.scale.toArray()).toEqual([.15,.15,.15]);
    const stowed=new THREE.Vector3(),open=new THREE.Vector3();
    fleet.combine.group.updateMatrixWorld(true);fleet.combine.augerOutlet.getWorldPosition(stowed);
    fleet.combine.augerPivot.rotation.y=Math.PI/2;fleet.combine.group.updateMatrixWorld(true);fleet.combine.augerOutlet.getWorldPosition(open);
    expect(open.x).toBeLessThan(stowed.x-.9);expect(open.y).toBeCloseTo(.501);
    const bed=fleet.truck.group.userData.bedInterior;
    expect(fleet.truck.bedCenter.position.x).toBeGreaterThan(bed.minX);
    expect(fleet.truck.bedCenter.position.x).toBeLessThan(bed.maxX);
    expect(fleet.truck.bedCenter.position.z).toBeGreaterThan(bed.minZ);
    expect(fleet.truck.bedCenter.position.z).toBeLessThan(bed.maxZ);
    expect(fleet.sprayer.nozzles).toHaveLength(28);
    expect(fleet.tractor.wheels).toHaveLength(6);
    fleet.dispose();
  });
  it('disposes each fleet resource exactly once on repeated runs without global resource caches',()=>{
    vi.stubGlobal('document',undefined);
    const counts:number[]=[];
    for(let cycle=0;cycle<3;cycle++) {
      const fleet=createSoyMachineFleet(),geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();
      for(const machine of [fleet.tractor,fleet.sprayer,fleet.combine,fleet.truck]) machine.group.traverse(object=>{
        if(object instanceof THREE.Mesh){geometries.add(object.geometry);(Array.isArray(object.material)?object.material:[object.material]).forEach(m=>materials.add(m));}
      });
      counts.push(geometries.size);let disposedGeometries=0,disposedMaterials=0;
      geometries.forEach(g=>g.addEventListener('dispose',()=>disposedGeometries++));
      materials.forEach(m=>m.addEventListener('dispose',()=>disposedMaterials++));
      fleet.dispose();expect(disposedGeometries).toBe(geometries.size);expect(disposedMaterials).toBe(materials.size);
    }
    expect(new Set(counts).size).toBe(1);
  });
});
