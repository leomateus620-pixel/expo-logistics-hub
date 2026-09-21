import { describe, expect, it } from 'vitest';
import { BoxGeometry, InstancedMesh, MeshBasicMaterial, Matrix4, Raycaster, Vector3 } from 'three';
import { COMMERCIAL_PAVILION_MODULE_PLANS as plans, createCommercialPavilionModuleProjectionFrame, projectCommercialPavilionModuleRect } from '@/features/commercial-map/utils/commercialPavilionModules';
import { OFFICIAL_REFERENCE_DATA } from '@/features/commercial-map/data/officialReference2026';
import { buildPavilionModuleCommercialIndex } from '@/features/commercial-map/utils/pavilionModuleCommercial';

const sequence = (first: number, last: number) => Array.from({ length: Math.abs(last - first) + 1 }, (_, i) => first + i * Math.sign(last - first));
const ordered = (id: 'B2' | 'B6', first: number, last: number, axis: 'centerX' | 'centerZ', direction: number) => plans[id].cells
  .filter(c => c.number >= Math.min(first, last) && c.number <= Math.max(first, last))
  .sort((a, b) => direction * (a[axis] - b[axis])).map(c => c.number);

describe('Pavilhões 14 e 3: contratos das plantas oficiais anexadas (set/2026)', () => {
  it.each([['B2', 186, 616], ['B6', 214, 663]] as const)('%s: números, chaves e soma oficial sem lacunas', (id, count, area) => {
    const cells = plans[id].cells;
    expect([...new Set(cells.map(c => c.number))].sort((a,b) => a-b)).toEqual(sequence(1,count));
    expect(cells).toHaveLength(count);
    expect(new Set(cells.map(c => c.id)).size).toBe(count);
    expect(cells.reduce((sum,c) => sum + (c.areaM2 ?? 0),0)).toBe(area);
  });
  it.each([[186,152],[123,151],[122,94],[65,93],[64,36],[1,35]])('B2: esquerda-direita %i a %i', (first,last) => {
    expect(ordered('B2',first,last,'centerX',1)).toEqual(sequence(first,last));
  });
  // In B6 the canonical camera sees larger source X at the left and larger Z at the top.
  it.each([[144,175],[143,112],[80,111],[79,48],[214,176],[35,20],[19,1]])('B6: topo-base %i a %i', (first,last) => {
    expect(ordered('B6',first,last,'centerZ',-1)).toEqual(sequence(first,last));
  });
  it.each([[47,41],[40,37]])('B6: faixa superior esquerda-direita %i a %i', (first,last) => {
    expect(ordered('B6',first,last,'centerX',-1)).toEqual(sequence(first,last));
  });
  it('B6: extremos e pares das ilhas nas posições exigidas', () => {
    const get = (n: number) => plans.B6.cells.find(c => c.number === n)!;
    for (const [left,right] of [[144,143],[175,112],[80,79],[111,48]]) {
      expect(get(left).centerX).toBeGreaterThan(get(right).centerX);
      expect(get(left).centerZ).toBeCloseTo(get(right).centerZ,12);
    }
    expect(get(144).centerZ).toBeGreaterThan(get(175).centerZ);
    expect(get(80).centerZ).toBeGreaterThan(get(111).centerZ);
  });
  it.each([[32,44.48],[8,15],[19,11]])('37–47: 1 x 3 m, escala uniforme em quadro %i x %i', (width,depth) => {
    const frame = createCommercialPavilionModuleProjectionFrame(plans.B6,{width,depth});
    const meter = Math.min(width / 32, depth / 44.48);
    for (const cell of plans.B6.cells.filter(c => c.number >= 37 && c.number <= 47)) {
      const p = projectCommercialPavilionModuleRect(cell,frame);
      expect(p.width).toBeCloseTo(meter,10);
      expect(p.depth).toBeCloseTo(3 * meter,10);
      expect(p.width * p.depth / meter ** 2).toBeCloseTo(3,10);
    }
  });
  it('preserva o L do 36, sua área e dimensões normalizadas anteriores', () => {
    const cell = plans.B6.cells.find(c => c.number === 36)!;
    expect(cell.id).toBe('B6:module:036');
    expect(cell.areaM2).toBe(24);
    expect(cell.width).toBeCloseTo(.15,12);
    expect(cell.depth).toBeCloseTo(5 * (.32 - .0015 * 16) / 17,12);
    expect(cell.shape?.footprint).toHaveLength(6);
    expect(cell.shape?.renderParts).toHaveLength(2);
    expect(cell.metricAspectRatio).toBeUndefined();
  });
  it.each(['B2','B6'] as const)('%s: sem sobreposição ou invasão de corredores', id => {
    const plan = plans[id];
    const frame = createCommercialPavilionModuleProjectionFrame(plan,{width:32,depth:44.48});
    const cells = plan.cells.flatMap(c => (c.shape?.renderParts ?? [c]).map(p => projectCommercialPavilionModuleRect(p,frame)));
    const corridors = plan.corridors.map(c => projectCommercialPavilionModuleRect(c,frame));
    const overlap = (a: typeof cells[number],b: typeof cells[number]) => Math.min(a.centerX+a.width/2,b.centerX+b.width/2)-Math.max(a.centerX-a.width/2,b.centerX-b.width/2)>1e-9 && Math.min(a.centerZ+a.depth/2,b.centerZ+b.depth/2)-Math.max(a.centerZ-a.depth/2,b.centerZ-b.depth/2)>1e-9;
    for (let i=0;i<cells.length;i++) {
      expect(cells.slice(i+1).some(b=>overlap(cells[i],b))).toBe(false);
      expect(corridors.some(b=>overlap(cells[i],b))).toBe(false);
    }
  });
  it.each(['B2','B6'] as const)('%s: raycast de cada célula resolve a entidade e lote próprios', id => {
    const plan = plans[id];
    const pavilion = OFFICIAL_REFERENCE_DATA.entities.find(e=>e.publicIdentifier===id)!;
    const index = buildPavilionModuleCommercialIndex(pavilion,OFFICIAL_REFERENCE_DATA.entities,OFFICIAL_REFERENCE_DATA.lots);
    const frame = createCommercialPavilionModuleProjectionFrame(plan,{width:32,depth:44.48});
    const regular = plan.cells.filter(c=>!c.shape);
    const mesh = new InstancedMesh(new BoxGeometry(1,1,1),new MeshBasicMaterial(),regular.length);
    const matrix = new Matrix4();
    regular.forEach((c,i)=>{const p=projectCommercialPavilionModuleRect(c,frame); matrix.makeScale(p.width,.02,p.depth).setPosition(p.centerX,0,p.centerZ);mesh.setMatrixAt(i,matrix);});
    mesh.computeBoundingSphere();mesh.updateMatrixWorld();
    regular.forEach(c=>{
      const p=projectCommercialPavilionModuleRect(c,frame);
      const hit=new Raycaster(new Vector3(p.centerX,5,p.centerZ),new Vector3(0,-1,0)).intersectObject(mesh)[0];
      expect(hit).toBeDefined();
      const picked=regular[hit.instanceId!];
      expect(picked.id).toBe(c.id);
      const record=index.get(picked.id)!;
      expect(record.entity.publicIdentifier).toBe(`${id}-M${String(c.number).padStart(3,'0')}`);
      expect(record.lot.entityId).toBe(record.entity.id);
      expect(record.moduleNumber).toBe(c.number);
    });
    mesh.geometry.dispose();(mesh.material as MeshBasicMaterial).dispose();mesh.dispose();
  });
  it('limita a orientação explícita do atlas ao B2; demais perfis mantêm o padrão', () => {
    expect(plans.B2.interiorPresentation?.moduleLabelRotationRadians).toBe(Math.PI);
    for (const [id,plan] of Object.entries(plans)) if (id!=='B2') expect(plan.interiorPresentation?.moduleLabelRotationRadians).toBeUndefined();
  });
  it('mantém IDs, preços e status próprios mesmo com números iguais e registros fora de ordem', () => {
    const source = OFFICIAL_REFERENCE_DATA;
    const entities = source.entities.map(e => ({ ...e, id: `persisted-${e.id}`, parentEntityId: e.parentEntityId ? `persisted-${e.parentEntityId}` : null })).reverse();
    const lots = source.lots.map((l,i) => ({ ...l, id:`commercial-${i}`,entityId:`persisted-${l.entityId}`,askingPrice:1000+i,status:i%2 ? 'SOLD' as const : 'AVAILABLE' as const })).reverse();
    const before = JSON.stringify({entities,lots});
    for (const id of ['B2','B6'] as const) {
      const pavilion = entities.find(e=>e.publicIdentifier===id)!;
      const record = buildPavilionModuleCommercialIndex(pavilion,entities,lots).get(`${id}:module:144`)!;
      const expected = lots.find(l=>l.publicIdentifier===`${id}-M144`)!;
      expect(record.lot).toBe(expected);
      expect(record.entity.id).toBe(expected.entityId);
      expect(record.lot.askingPrice).toBe(expected.askingPrice);
      expect(record.lot.status).toBe(expected.status);
    }
    expect(JSON.stringify({entities,lots})).toBe(before);
  });
  it('os polígonos da referência dos lotes 37–47 também mantêm proporção 1:3', () => {
    for (const entity of OFFICIAL_REFERENCE_DATA.entities.filter(e=>/^B6-M0(3[7-9]|4[0-7])$/.test(e.publicIdentifier))) {
      const ring = entity.geometry.coordinates[0];
      const edge = (i: number) => Math.hypot(ring[i+1][0]-ring[i][0],ring[i+1][1]-ring[i][1]);
      expect(edge(1)/edge(0)).toBeCloseTo(3,10);
    }
  });
});
