import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '@/contexts/AuthProvider';
import { CapabilitiesProvider } from '@/contexts/CapabilitiesProvider';
import { TooltipProvider } from '@/components/ui/tooltip';
import CommercialMapPage from '@/features/commercial-map/CommercialMapPage';
import { CommercialMapShell } from '@/features/commercial-map/components/shell/CommercialMapShell';
import { OFFICIAL_REFERENCE_DATA } from '@/features/commercial-map/data/officialReference2026';
import snapshots from './replay-data.json';
import type { CommercialMapData } from '@/features/commercial-map/types';
import { presentCommercialMapData } from '@/features/commercial-map/utils/presentCommercialMapData';
import { useCommercialMapStore } from '@/features/commercial-map/state/useCommercialMapStore';
import '@/index.css';
import { _roots } from '@react-three/fiber';
import { Vector3, Mesh, Raycaster, MeshStandardMaterial, MeshBasicMaterial } from 'three';

function replay(rows: typeof snapshots.after): CommercialMapData {
  const codes = new Set(rows.entities.map(e=>e.publicIdentifier));
  const base = OFFICIAL_REFERENCE_DATA;
  const entities = rows.entities.map(e=>({ ...base.entities.find(x=>x.publicIdentifier===e.publicIdentifier) ?? base.entities[0], ...e,
    layerId: base.entities.find(x=>x.publicIdentifier===e.publicIdentifier)?.layerId
      ?? base.entities.find(x=>x.classification===e.classification)?.layerId ?? base.entities[0].layerId }));
  return presentCommercialMapData({ ...base,
    entities: [...base.entities.filter(e=>!codes.has(e.publicIdentifier) && !/^Q-[RS]-/.test(e.publicIdentifier) && !['RUA-LESTE-EXPORURAL','RUA-UBIRETAMA-LATERAL-R55'].includes(e.publicIdentifier)), ...entities],
    lots: [...base.lots.filter(l=>!/^Q-[RS]-/.test(l.publicIdentifier)),...rows.lots.map(l=>({...base.lots[0],...l}))],
  } as unknown as CommercialMapData);
}
const before = replay(snapshots.before);
const after = replay(snapshots.after);
const params = new URLSearchParams(location.search);
const commission = params.get('scope') === 'commission';
const client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
const identities = new WeakMap<object, number>();
let nextIdentity = 1;
const identity = (value: object) => {
  if (!identities.has(value)) identities.set(value, nextIdentity++);
  return identities.get(value);
};
// Test harness only. Controls/camera/renderer are the EXISTING Canvas objects.
// Never imported by App.tsx or by the public production build.
Object.assign(window, { __exporuralReview: {
  pose(target: [number,number,number], height: number) {
    const state = [..._roots.values()][0]?.store.getState();
    if (!state) throw new Error('Canvas not mounted');
    const controls = state.controls as unknown as { target: Vector3; update(): void };
    useCommercialMapStore.getState().setSelectedEntityId(null);
    useCommercialMapStore.getState().setActivePanel(null);
    useCommercialMapStore.getState().closeParkingInspection();
    useCommercialMapStore.setState({ sunrisePhase: 'complete', sunriseStartedAt: null, nightModeActive: false, rainModeActive: false });
    state.camera.position.set(target[0],height,target[2]+.01);
    state.camera.lookAt(...target); controls.target.set(...target); controls.update(); state.invalidate();
  },
  screen(code: string) {
    const state = [..._roots.values()][0]?.store.getState();
    if (!state) throw new Error('Canvas not mounted');
    const entity=after.entities.find(e=>e.publicIdentifier===code)!;
    const [x,z]=entity.metadata.labelAnchor as [number,number];
    const p=new Vector3(x,.04,z).project(state.camera), rect=state.gl.domElement.getBoundingClientRect();
    return [rect.x+(p.x+1)*rect.width/2,rect.y+(1-p.y)*rect.height/2];
  },
  select(code: string) { useCommercialMapStore.getState().setSelectedEntityId(after.entities.find(e=>e.publicIdentifier===code)!.id); },
  materialsAt(x:number,z:number) {
    const state=[..._roots.values()][0]?.store.getState();
    if(!state)return [];
    const ray=new Raycaster(new Vector3(x,10,z),new Vector3(0,-1,0));
    const hits: Parameters<Mesh["raycast"]>[1]=[]; state.scene.traverse(o=>{if(o instanceof Mesh) Mesh.prototype.raycast.call(o,ray,hits)});
    return hits.sort((a,b)=>a.distance-b.distance).filter(h=>h.point.y<1).slice(0,12).map(h=>{
      const m=(h.object as unknown as {material:MeshStandardMaterial}).material;
      return {y:h.point.y,name:h.object.name,parent:h.object.parent?.name,color:m?.color?.getHexString(),material:m?.type,map:!!m?.map,uv:h.uv?.toArray(),normal:h.face?.normal.toArray()};
    });
  },
  mapState: () => {
    const state = [..._roots.values()][0]?.store.getState();
    return { selectedEntityId:useCommercialMapStore.getState().selectedEntityId,
      camera:state?.camera.position.toArray(), renderer:state?.gl.info.memory,
      identity:state ? { canvas:identity(state.gl.domElement), renderer:identity(state.gl),
        controls:state.controls ? identity(state.controls) : null, camera:state.camera.uuid } : null,
      workspaceMode:useCommercialMapStore.getState().workspaceMode };
  },
}});
function Preview() {
  const [proposed, setProposed] = useState(params.get('revision') !== 'before');
  const [diagnostic,setDiagnostic]=useState('');
  const data = proposed ? after : before;
  return <>
    <div style={{ padding: '8px 14px', background: '#14382d', color: 'white', fontSize: 13, position: 'relative', zIndex: 80 }}>
      RELEITURA VISUAL LOCAL · {proposed ? 'Banco após revisão · 108 espaços, incluindo área sem número' : 'Banco antes · 101 espaços'} · Contexto do parque da referência local · Sem compradores e sem escrita
      <button style={{ marginLeft: 16, border: '1px solid', padding: '3px 12px', borderRadius: 4 }} onClick={() => {
        useCommercialMapStore.getState().setSelectedEntityId(null);
        setProposed(p => !p);
      }}>{proposed ? 'Ver antes' : 'Ver depois'}</button>
      <button onClick={()=>(window as unknown as {__exporuralReview:{pose(t:number[],h:number):void}}).__exporuralReview.pose([48,0,-24],31)}>Leste</button>
      <button onClick={()=>(window as unknown as {__exporuralReview:{pose(t:number[],h:number):void}}).__exporuralReview.pose([55.5,0,-26.8],11)}>Entroncamento</button>
      <button onClick={()=>(window as unknown as {__exporuralReview:{pose(t:number[],h:number):void}}).__exporuralReview.pose([33,0,-16.5],15)}>Churrascaria</button>
      <button onClick={()=>(window as unknown as {__exporuralReview:{pose(t:number[],h:number):void}}).__exporuralReview.pose([47,0,-14.2],15)}>Emanuel</button>
      <button onClick={()=>setDiagnostic(JSON.stringify({dark:(window as any).__exporuralReview.materialsAt(33.5,-16),gray:(window as any).__exporuralReview.materialsAt(32,-19.9)}))}>Diagnosticar piso</button>
      {diagnostic && <pre style={{whiteSpace:'pre-wrap',maxHeight:200,overflow:'auto'}}>{diagnostic}</pre>}
    </div>
    <CommercialMapShell><CommercialMapPage previewData={data} previewWebGLUnavailable={params.get('webgl') === 'unavailable'}
      scope={commission ? { mode: 'commission', commissionId: 'local-preview', segmentId: 'exporural' } : { mode: 'full' }} />
    </CommercialMapShell>
  </>;
}
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}><BrowserRouter><AuthProvider><CapabilitiesProvider><TooltipProvider>
    <Preview />
  </TooltipProvider></CapabilitiesProvider></AuthProvider></BrowserRouter></QueryClientProvider>,
);
