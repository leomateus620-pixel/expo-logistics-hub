import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { useCommercialMapStore } from '@/features/commercial-map/state/useCommercialMapStore';
import { advanceRainBlend, COMMERCIAL_RAIN_BUDGETS, resolveRainQuality } from '@/features/commercial-map/utils/rainRuntime';
import { RainWetSurfaceRegistry } from '@/features/commercial-map/components/canvas/rainWetSurfaces';
import { buildRainGroundAnchors, buildRainRunoffAnchors } from '@/features/commercial-map/utils/rainPlacement';
import { OFFICIAL_REFERENCE_DATA } from '@/features/commercial-map/data/officialReference2026';
import { withFenasojaComplexReconstruction } from '@/features/commercial-map/data/fenasojaComplexReconstruction';
import { pointInPolygon } from '@/features/commercial-map/utils/spatialSurface';

describe('independent rain environment', () => {
  it('preserves every navigation, selection, filtering, hydrology and sunrise value over 20 cycles', () => {
    const store=useCommercialMapStore;
    store.setState({selectedEntityId:'selected-lot',search:'B12',nightModeActive:true,hydrologicalModeActive:true,rainModeActive:false});
    const initial=store.getState();
    for(let i=0;i<20;i++) { initial.toggleRainMode();initial.toggleRainMode(); }
    expect(store.getState()).toEqual(initial);
    initial.setRainModeActive(true);
    expect(store.getState()).toEqual({...initial,rainModeActive:true});
    store.setState({selectedEntityId:null,search:'',nightModeActive:false,hydrologicalModeActive:false,rainModeActive:false});
  });
  it('eases both directions and caps hidden-tab deltas without skipping the transition', () => {
    expect(advanceRainBlend(0,true,10)).toBeLessThan(.2);
    expect(advanceRainBlend(0,true,0)).toBe(0);
    let blend=0;
    for(let i=0;i<120;i++)blend=advanceRainBlend(blend,true,1/60);
    expect(blend).toBe(1);
    for(let i=0;i<120;i++)blend=advanceRainBlend(blend,false,1/60);
    expect(blend).toBe(0);
  });
  it('selects execution cadence by capability while preserving every rain effect', () => {
    expect(resolveRainQuality('ULTRA',2048,8)).toBe('LOW');
    expect(resolveRainQuality('HIGH',4096,8)).toBe('MEDIUM');
    expect(resolveRainQuality('HIGH',16384,2)).toBe('LOW');
    expect(COMMERCIAL_RAIN_BUDGETS.LOW).toEqual(COMMERCIAL_RAIN_BUDGETS.HIGH);
    expect(COMMERCIAL_RAIN_BUDGETS.LOW.splashes).toBeGreaterThan(0);
    expect(COMMERCIAL_RAIN_BUDGETS.HIGH.drops).toBeLessThanOrEqual(4000);
  });
});

describe('stable wet surfaces and exact decorative placement',()=>{
  it('restores surface properties after 20 cycles, preserving shader identity, textures and disposal',()=>{
    const registry=new RainWetSurfaceRegistry();
    const material=new THREE.MeshStandardMaterial({name:'road-asphalt',color:'#667788',roughness:.96,envMapIntensity:.2});
    const color=material.color.clone();const version=material.version;const hook=material.onBeforeCompile;
    registry.add(material);registry.add(material);expect(registry.size).toBe(1);
    for(let i=0;i<20;i++){registry.update(1);expect(material.roughness).toBeCloseTo(.34);registry.update(0);}
    expect(material.color.equals(color)).toBe(true);
    expect(material.roughness).toBe(.96);expect(material.version).toBe(version);expect(material.onBeforeCompile).toBe(hook);
    material.dispose();expect(registry.size).toBe(0);registry.dispose();
  });
  it('respects palette replacement and leaves hydrology, glass and transparent effects untouched',()=>{
    const registry=new RainWetSurfaceRegistry();
    const road=new THREE.MeshStandardMaterial({name:'asphalt',color:'#888888'});
    const water=new THREE.MeshStandardMaterial({name:'hydrological-water'});
    registry.add(road);registry.add(water);expect(registry.size).toBe(1);
    registry.update(1);road.color.set('#334455');registry.update(1);registry.update(0);
    expect(road.color.getHexString()).toBe('334455');registry.dispose();road.dispose();water.dispose();
  });
  it('places finite deterministic ground anchors only inside eligible official circulation and keeps source geometry',()=>{
    const entities=OFFICIAL_REFERENCE_DATA.entities;const original=JSON.stringify(entities);
    const anchors=buildRainGroundAnchors(entities);
    expect(anchors.length).toBeGreaterThan(0);expect(anchors).toEqual(buildRainGroundAnchors(entities));
    for(const [x,y,z] of anchors){expect([x,y,z].every(Number.isFinite)).toBe(true);
      expect(entities.some(e=>['ROAD','PEDESTRIAN_PATH','PARKING'].includes(e.classification)
        &&pointInPolygon([x,z],e.geometry.coordinates[0])&&!e.geometry.coordinates.slice(1).some(h=>pointInPolygon([x,z],h)))).toBe(true);}
    expect(JSON.stringify(entities)).toBe(original);
    const complex=withFenasojaComplexReconstruction(OFFICIAL_REFERENCE_DATA);
    const runoff=buildRainRunoffAnchors(complex.entities);
    expect(runoff.length).toBeGreaterThan(0);expect(runoff.flat().every(Number.isFinite)).toBe(true);
    expect(buildRainRunoffAnchors([])).toEqual([]);
  });
});
