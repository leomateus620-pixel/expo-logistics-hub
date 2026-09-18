import { describe, expect, it } from 'vitest';
import { Mesh, MeshBasicMaterial, Raycaster, Vector3, DoubleSide } from 'three';
import { buildRuralGeometry, ruralBuildingRecipe } from '../features/commercial-map/utils/ruralArchitecture';
import { buildParkAccessArchitectureModel } from '../features/commercial-map/utils/parkAccessArchitecture';

describe('photographic rural revision: actual openings and retained envelope',()=>{
  it('has four slender porch supports and triangular closed gables behind the open porch',()=>{
    const r=ruralBuildingRecipe('testDrive',1.85,5.39,.81);
    const posts=r.boxes.filter(p=>p.id.includes('porch-')&&p.id.includes('post-'));
    expect(posts).toHaveLength(4);
    expect(posts.every(p=>p.position[2]===r.front && p.scale[0]<.04)).toBe(true);
    expect(r.gables).toHaveLength(2);
    expect(r.gables[0].z).toBe(r.wallFront);
    expect(r.wallFront).toBeLessThan(r.front-.6);
  });
  it('uses four tall windows followed by three high windows on the photographed side',()=>{
    const r=ruralBuildingRecipe('testDrive',1.85,5.39,.81);
    const windows=r.boxes.filter(p=>/^window-1-\d$/.test(p.id)).sort((a,b)=>b.position[2]-a.position[2]);
    expect(windows).toHaveLength(7);
    expect(windows.slice(0,4).every(p=>p.scale[1]>.20)).toBe(true);
    expect(windows.slice(4).every(p=>p.scale[1]<.14)).toBe(true);
    const g=buildRuralGeometry(r), material=new MeshBasicMaterial({side:DoubleSide});
    const masonry=new Mesh(g.opaque,material);masonry.updateMatrixWorld(true);
    for(const w of windows) {
      const hits=new Raycaster(new Vector3(2,w.position[1],w.position[2]),new Vector3(-1,0,0),0,1.5).intersectObject(masonry);
      expect(hits,w.id).toHaveLength(0);
    }
    Object.values(g).forEach(x=>x.dispose());material.dispose();
  });
  it('keeps the right rear passage open and the dark piers broader than the two brick piers',()=>{
    const r=ruralBuildingRecipe('livestock',2.88,3.71,1.2);
    const dark=r.boxes.find(p=>p.id.startsWith('open-column-'))!;
    const brick=r.boxes.find(p=>p.id.startsWith('brick-pier-'))!;
    expect(dark.scale[0]).toBeGreaterThan(brick.scale[0]*1.6);
    const back=r.boxes.find(p=>p.id==='rear-wall')!;
    expect(back.position[0]+back.scale[0]/2).toBeLessThan(r.width*.12);
    const g=buildRuralGeometry(r),material=new MeshBasicMaterial({side:DoubleSide});
    const masonry=new Mesh(g.opaque,material);masonry.updateMatrixWorld(true);
    const hits=new Raycaster(new Vector3(r.width*.29,.45,r.front+.5),new Vector3(0,0,-1),0,r.depth+1).intersectObject(masonry);
    expect(hits).toHaveLength(0);
    Object.values(g).forEach(x=>x.dispose());material.dispose();
  });
  it.each([false,true])('keeps Test Drive below the previous PR triangle allocation reduced=%s',reducedGraphics=>{
    const model=buildParkAccessArchitectureModel([],{anchor:[-53.07,-.05],rotationRadians:0,width:1.85,depth:5.39},{reducedGraphics});
    const triangles=(model.opaque.length+model.glass.length+model.metal.length)*12+(model.gables!.attributes.position.count/3);
    expect(triangles).toBeLessThanOrEqual(reducedGraphics?1356:2052);
    expect(model.diagnostics.estimatedDrawCalls).toBe(4);
    model.gables!.dispose();
  });
});
