import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { Matrix4 } from 'three';
import golden from './fixtures/arena-preservation-main-8783fea7.json';
import { ARENA_CANONICAL_LAYOUT as A, ARENA_VEGETATION, arenaSourceToLocal,
  arenaVegetationAllowed, reconstructArenaEntity } from '@/features/commercial-map/data/arenaCanonicalLayout';
import { OFFICIAL_REFERENCE_DATA } from '@/features/commercial-map/data/officialReference2026';
import { MIRANTE_COMPLEX } from '@/features/commercial-map/data/miranteComplexReconstruction';
import { ARENA_FRONT_LAYOUT, sourceBoundsToLocal } from '@/features/commercial-map/data/parkEnvironment';
import { ARENA_SECTOR_SURFACE_ZONES, ARENA_TERRAIN_CUTS, resolveArenaSurfaceOwner } from '@/features/commercial-map/data/arenaSectorZoning';
import { arenaStairTreadElevation } from '@/features/commercial-map/data/arenaTerrain';
import { createArenaArchitecture, ARENA_RENDER_BUDGET } from '@/features/commercial-map/utils/arenaArchitecture';
import { commercialPavilionModelBounds } from '@/features/commercial-map/utils/commercialPavilions';
import { strategicLandmarkBounds, strategicLandmarkFacingRadians, strategicLandmarkVisualHeight } from '@/features/commercial-map/utils/landmarks';
import { clipPlanarSurfaceGeometry } from '@/features/commercial-map/utils/planarSurfaceGeometry';
import { PlaneGeometry } from 'three';
const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const F=OFFICIAL_REFERENCE_DATA.entities.find(e=>e.publicIdentifier==='F')!;
const intersects=(a:readonly number[],b:readonly number[])=>a[0]<b[2]&&a[2]>b[0]&&a[1]<b[3]&&a[3]>b[1];

describe('Arena canônica: implantação, arquitetura e preservação da main 8783fea7',()=>{
 it('preserva todas as entidades exceto F, os lotes e integralmente o Mirante #151',()=>{
  expect(OFFICIAL_REFERENCE_DATA.entities).toHaveLength(golden.entityCount);
  expect(hash(OFFICIAL_REFERENCE_DATA.entities.filter(e=>e.publicIdentifier!=='F'))).toBe(golden.entitiesWithoutArenaHash);
  expect(hash(OFFICIAL_REFERENCE_DATA.lots)).toBe(golden.lots);
  expect(MIRANTE_COMPLEX).toEqual(golden.mirante);
  expect(ARENA_FRONT_LAYOUT.stairs).toEqual(golden.stairs);
 });
 it('faz mesh, envelope selecionável e zoneamento consumirem exatamente o mesmo footprint',()=>{
  const bounds=strategicLandmarkBounds(F), model=commercialPavilionModelBounds(bounds,strategicLandmarkFacingRadians(F));
  expect(model.width).toBeCloseTo(A.arenaWidth,7);expect(model.depth).toBeCloseTo(A.arenaDepth,7);
  const g=createArenaArchitecture(model.width,model.depth);
  try {
   const box=g.roof.boundingBox!.clone(); box.applyMatrix4(new Matrix4().makeRotationY(A.arenaRotation));
   expect(box.max.x-box.min.x).toBeCloseTo(bounds.width,5);
   expect(box.max.z-box.min.z).toBeCloseTo(bounds.depth,5);
   expect(F.geometry.coordinates[0].slice(0,-1)).toEqual(A.arenaFootprint.localPolygon);
   expect(ARENA_SECTOR_SURFACE_ZONES.find(z=>z.id==='arena-footprint')?.sourcePolygon).toEqual(A.arenaFootprint.sourcePolygon);
   expect(strategicLandmarkVisualHeight(F)).toBeCloseTo(A.arenaWidth*A.architecture.riseToSpan+A.architecture.springHeight,6);
  } finally {g.dispose();}
 });
 it('aumenta o telhado ativo, desloca para a esquerda da referência e alinha seu centro aos acessos',()=>{
  expect(A.arenaDepth/A.arenaWidth).toBeCloseTo(415/313,5);
  expect(A.arenaDepth).toBeGreaterThan((5385-4900)*120/5500*.54*1.5);
  expect(A.arenaCenter.source[1]).toBeLessThan((2690+3130)/2);
  expect(A.arenaCenter.source[1]).toBe((A.stairs.sourceBounds[1]+A.stairs.sourceBounds[3])/2);
  expect(A.frontPlaza.sourceBounds[0]).toBe(A.stairs.sourceBounds[2]);
  expect(A.frontPlaza.sourceBounds[2]).toBe(A.arenaFootprint.sourceBounds[0]);
 });
 it('substitui o L na origem sem sobrepor praça, escadas, Arena ou Mirante',()=>{
  expect(A.frontPlaza.sourcePolygon).toHaveLength(4);
  expect(intersects(A.frontPlaza.sourceBounds,A.stairs.sourceBounds)).toBe(false);
  expect(intersects(A.frontPlaza.sourceBounds,A.arenaFootprint.sourceBounds)).toBe(false);
  expect(intersects(A.arenaFootprint.sourceBounds,MIRANTE_COMPLEX.mirante.sourceBounds)).toBe(false);
  expect(resolveArenaSurfaceOwner(...arenaSourceToLocal([4770,3030]))).toBeNull();
  expect(ARENA_SECTOR_SURFACE_ZONES.some(z=>z.id==='football-field')).toBe(false);
  expect(arenaStairTreadElevation(0)).toBe(F.geometry.elevation);
  expect(arenaStairTreadElevation(18)).toBeCloseTo(MIRANTE_COMPLEX.levels.deck,10);
 });
 it('recorta triângulos reais do terreno, inclusive bordas, e protege caminhos com a mesma fita',()=>{
  const b=sourceBoundsToLocal(A.arenaFootprint.sourceBounds);
  const plane=new PlaneGeometry(b.width+2,b.depth+2,4,4);plane.rotateX(-Math.PI/2);plane.translate(b.centerX,0,b.centerZ);
  clipPlanarSurfaceGeometry(plane,ARENA_TERRAIN_CUTS);
  try {
   const p=plane.attributes.position;
   for(let i=0;i<p.count;i++) {
    expect(p.getX(i)>b.minX+1e-5&&p.getX(i)<b.maxX-1e-5&&p.getZ(i)>b.minZ+1e-5&&p.getZ(i)<b.maxZ-1e-5).toBe(false);
   }
   expect(A.pedestrianMasks).toHaveLength(4);
   for(const mask of A.pedestrianMasks) expect(ARENA_TERRAIN_CUTS.some(c=>c.polygon===mask.localPolygon)).toBe(true);
  } finally{plane.dispose();}
 });
 it('não planta copas sobre concreto/escadas/quadras/estrutura e mantém composição irregular',()=>{
  expect(ARENA_VEGETATION.length).toBeGreaterThan(20);
  for(const tree of ARENA_VEGETATION)expect(arenaVegetationAllowed(arenaSourceToLocal(tree.sourcePosition),tree.scale*.3)).toBe(true);
  expect(arenaVegetationAllowed(A.arenaCenter.local,.4)).toBe(false);
  expect(new Set(ARENA_VEGETATION.map(t=>t.sourcePosition[0])).size).toBe(ARENA_VEGETATION.length);
  expect(new Set(ARENA_VEGETATION.map(t=>t.scale)).size).toBeGreaterThan(15);
 });
 it('produz cobertura fechada em espessura, mas portais abertos e apoios reais dentro do orçamento',()=>{
  const g=createArenaArchitecture(A.arenaWidth,A.arenaDepth);
  try {
   expect(g.ribs).toHaveLength(A.architecture.structuralBays+1);
   const p=g.roof.attributes.position, n=g.roof.attributes.normal;
   for(let i=0;i<p.count;i++)expect([p.getX(i),p.getY(i),p.getZ(i),n.getX(i),n.getY(i),n.getZ(i)].every(Number.isFinite)).toBe(true);
   // At the crown the exterior must face up, not become an invisible inside-out shell.
   expect(n.getY(A.architecture.archSegments)).toBeGreaterThan(.5);
   const triangles=[g.roof,g.fascia,g.structure,g.floor,g.signBacking,g.signFace].reduce((sum,x)=>sum+(x.index?.count??x.attributes.position.count)/3,0)+(g.rib.index?.count??g.rib.attributes.position.count)/3*g.ribs.length;
   expect(triangles).toBeLessThan(ARENA_RENDER_BUDGET.maxTriangles);
   expect(Object.keys(g).filter(k=>!['ribs','rise','dispose'].includes(k))).toHaveLength(9);
   const disposed=vi.fn();g.roof.addEventListener('dispose',disposed);g.dispose();expect(disposed).toHaveBeenCalledTimes(1);
  } finally { /* disposal asserted above */ }
 });
 it('elimina caminhos legados e mantém atualização idempotente da mesma entidade persistida F',()=>{
  const old={...F,id:'database:F',metadata:{}};
  const once=reconstructArenaEntity(old);expect(once.id).toBe(old.id);expect(reconstructArenaEntity(once)).toBe(once);
  const source=readFileSync('src/features/commercial-map/components/canvas/StrategicLandmarks.tsx','utf8');
  expect(source).not.toContain('const shellDepth = depth * 0.54');expect(source).not.toContain('function SicrediArena(');
  const model=readFileSync('src/features/commercial-map/components/canvas/SicrediArena.tsx','utf8');
  expect(model).not.toMatch(/rearArch|materials\.glass|materials\.dark|SignagePanel|useFrame/);
  expect(A.architecture.sign).toBe('ARENA SICREDI ICATU');
 });
});
