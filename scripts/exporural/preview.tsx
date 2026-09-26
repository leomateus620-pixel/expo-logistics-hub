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
import { createExporural2028Preview } from '@/features/commercial-map/data/exporuralReference2028';
import { presentCommercialMapData } from '@/features/commercial-map/utils/presentCommercialMapData';
import { useCommercialMapStore } from '@/features/commercial-map/state/useCommercialMapStore';
import '@/index.css';
import { _roots } from '@react-three/fiber';
import { Vector3 } from 'three';

const before = presentCommercialMapData(OFFICIAL_REFERENCE_DATA);
const after = presentCommercialMapData(createExporural2028Preview());
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
  const data = proposed ? after : before;
  return <>
    <div style={{ padding: '8px 14px', background: '#14382d', color: 'white', fontSize: 13, position: 'relative', zIndex: 80 }}>
      PRÉVIA LOCAL · {proposed ? 'Proposta 2028 · 100 lotes · 45.767,79 m² · Cartografia e conflitos B37/B38 pendentes' : 'Referência anterior do repositório · 95 lotes'} · Somente leitura
      <button style={{ marginLeft: 16, border: '1px solid', padding: '3px 12px', borderRadius: 4 }} onClick={() => {
        useCommercialMapStore.getState().setSelectedEntityId(null);
        setProposed(p => !p);
      }}>{proposed ? 'Ver antes' : 'Ver proposta'}</button>
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
