// Local-only QA entry: production components and canonical reference fixtures.
import React, { useState } from 'react';
import { summarizeCommercialMapRuntimeDiagnostics } from '../src/features/commercial-map/utils/runtimeDiagnostics';
import { AuthProvider } from '../src/contexts/AuthProvider';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import PublicAreaMapPage from '../src/features/commercial-map/public/PublicAreaMapPage';
import type { PublicLot, PublicMapInventory } from '../src/features/commercial-map/public/publicMapTypes';
import { CommercialMapCanvas } from '../src/features/commercial-map/components/canvas/CommercialMapCanvas';
import { PavilionModuleCard } from '../src/features/commercial-map/components/panels/PavilionModuleCard';
import { OFFICIAL_REFERENCE_DATA as data } from '../src/features/commercial-map/data/officialReference2026';
import { COMMERCIAL_PAVILION_MODULE_PLANS as plans } from '../src/features/commercial-map/utils/commercialPavilionModules';
import { useCommercialMapStore as store } from '../src/features/commercial-map/state/useCommercialMapStore';
import { preloadCommercialMapCanvas } from '../src/features/commercial-map/utils/preloadCanvas';
import '../src/index.css';
import '../src/features/commercial-map/commercial-map.css';
const permissions = { canView: true, canEdit: false, canEditGeometry: false, canManageLots: false, canManageSales: false, canManageContracts: false, canManageLayers: false, canViewMapAnalytics: false, isMapAdmin: false };
const client = new QueryClient();
const pavilionChoices = [['B1',1],['B6',3],['B8',5],['B10',7],['B4',8],['B3',12],['B5',13],['B2',14]] as const;
const readCanvas = () => ({ ...document.querySelector('canvas')?.dataset });
const nextFrame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
async function waitCamera() {
  const requestId = store.getState().interiorViewCommand?.requestId;
  const start = performance.now();
  do {
    await nextFrame();
    const transition = JSON.parse(document.querySelector('canvas')?.dataset.commercialMapCameraTransition || '{}');
    if (transition.status === 'completed' && transition.source?.endsWith(':' + requestId)) { await nextFrame(); return transition; }
  } while (performance.now() - start < 15000);
  throw new Error('Camera did not settle');
}
async function interruptCommand() {
  document.querySelector<HTMLButtonElement>('button[aria-label="Visualizar pavilhão na horizontal"]')!.click();
  for (let frame = 0; frame < 20; frame++) {
    await new Promise(resolve => setTimeout(resolve, 16));
    const canvas = document.querySelector('canvas')!;
    const transition = JSON.parse(canvas.dataset.commercialMapCameraTransition || '{}');
    if (transition.status !== 'running') continue;
    const before = readCanvas();
    canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: -12, clientX: canvas.getBoundingClientRect().x + 180, clientY: canvas.getBoundingClientRect().y + 160, bubbles: true, cancelable: true }));
    await nextFrame();
    window.dispatchEvent(new Event('blur'));
    await nextFrame();
    document.documentElement.dataset.qaCancellation = JSON.stringify({ before, after: readCanvas(), navigating: store.getState().cameraNavigating, activeControls: window.__commercialMapRuntimeDiagnostics?.activeControls, rendererCreates: window.__commercialMapRuntimeDiagnostics?.rendererCreates });
    return;
  }
  document.documentElement.dataset.qaCancellation = JSON.stringify({ error: 'Could not observe active transition' });
}
async function stressCommands() {
  const report: unknown[] = [];
  document.documentElement.dataset.qaStress = 'running';
  const diagnostics = window.__commercialMapRuntimeDiagnostics;
  diagnostics?.resetSamples();
  try {
    // Warm all three label presentations before recording resource growth.
    for (const name of ['Visualizar pavilhão na vertical','Visualizar pavilhão na horizontal','Aproximar lotes']) {
      document.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)!.click(); await waitCamera();
    }
    const before = diagnostics?.capture();
    for (let cycle = 0; cycle < 20; cycle++) for (const name of ['Visualizar pavilhão na vertical','Visualizar pavilhão na horizontal','Aproximar lotes']) {
      const started = performance.now();
      document.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)!.click();
      const transition = await waitCamera();
      const canvas = readCanvas();
      const camera = JSON.parse(canvas.commercialMapCameraDiagnostics || '{}');
      const health = JSON.parse(canvas.commercialMapRenderHealth || '{}');
      if (health.contextLosses || health.lastErrorCode || !camera.controlsEnabled || !camera.position?.every(Number.isFinite)) throw new Error('Invalid camera or renderer health');
      report.push({ cycle, name, responseMs: transition.startedAt - started, transition, camera, health, resources: diagnostics?.capture() });
      document.documentElement.dataset.qaStressProgress = String(report.length);
      document.documentElement.dataset.qaStressReport = JSON.stringify({ before, samples: report, visibility: document.visibilityState });
    }
    document.documentElement.dataset.qaStressReport = JSON.stringify({ before, after: diagnostics?.capture(), samples: report, summary: summarizeCommercialMapRuntimeDiagnostics(), visibility: document.visibilityState, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches });
    document.documentElement.dataset.qaStress = 'completed';
  } catch (error) { document.documentElement.dataset.qaStress = 'failed'; document.documentElement.dataset.qaStressError = String(error); }
}
const errors: string[] = [];
window.addEventListener('error',e=>{errors.push(e.message);document.documentElement.dataset.qaErrors=JSON.stringify(errors);});
window.addEventListener('unhandledrejection',e=>{errors.push(String(e.reason));document.documentElement.dataset.qaErrors=JSON.stringify(errors);});
const start = new URLSearchParams(location.search).get('pavilion') || 'B6';
const getPavilion = (id: string) => data.entities.find(e => e.publicIdentifier === id)!;
const isPublic = new URLSearchParams(location.search).get('consumer') === 'public';
const slug = start === 'B2' ? 'pavilhao-14' : 'pavilhao-3';
const pavilion = getPavilion(start);
const scopedEntities = data.entities.filter(e=>e.id===pavilion.id || e.parentEntityId===pavilion.id);
const entityIds = new Set(scopedEntities.map(e=>e.id));
const fixtureArea = (number: string | null) => plans[start].cells.find(c=>c.number===Number(number))?.areaM2 ?? null;
const publicLots: PublicLot[] = data.lots.filter(l=>entityIds.has(l.entityId)).map(l=>({
  id:l.id, entityId:l.entityId, publicIdentifier:l.publicIdentifier, block:l.block,
  lotNumber:l.lotNumber, levelLabel:l.levelLabel, displayName:l.publicIdentifier,
  availability:'AVAILABLE', officialAreaSqm:fixtureArea(l.lotNumber), isCorner:false,
  isCovered:true, infrastructure:[],hasElectricity:false,hasWater:false,hasInternet:false,
  pricing:{resolutionStatus:'OK',renovacaoPricePerSqm:100,renovacaoTotal:(fixtureArea(l.lotNumber)??0)*100,renovacaoRuleLabel:'Preço fictício QA',segundaPricePerSqm:200,segundaTotal:(fixtureArea(l.lotNumber)??0)*200,segundaRuleLabel:'Preço fictício QA'},
}));
const inventory: PublicMapInventory = {revision:'qa',scope:{slug,name:`${slug} · fixture QA`,kind:'PAVILION',lotCount:publicLots.length,officialAreaSqm:start==='B2'?616:663,pavilionIdentifier:start,segmentSlug:null},project:data.project,layers:data.layers,entities:scopedEntities,lots:publicLots};
client.setQueryData(['public-map','inventory',slug,'qa-local'],inventory);
// This fixture cannot contact or mutate the production backend.
const nativeFetch = window.fetch.bind(window);
window.fetch = async (input,init) => {
  const url = String(input instanceof Request ? input.url : input);
  if (!url.includes('.supabase.co')) return nativeFetch(input,init);
  const response = url.includes('public_map_scope_revision') ? {revision:'qa',lotCount:publicLots.length}
    : url.includes('public_map_inventory') ? inventory : null;
  return new Response(JSON.stringify(response),{status:200,headers:{'Content-Type':'application/json'}});
};
store.getState().enterInterior(getPavilion(start).id);
store.setState({ sunrisePhase: 'complete' });
void preloadCommercialMapCanvas();
function App() {
  const [id, setId] = useState(start);
  const [sceneEntities, setSceneEntities] = useState(data.entities);
  const selected = store(s => s.selectedModuleId);
  const interior = store(s => s.interiorEntityId);
  const open = (next: string) => { setId(next); store.getState().enterInterior(getPavilion(next).id); };
  if (isPublic) return <QueryClientProvider client={client}><MemoryRouter initialEntries={['/areas/'+slug+'/qa-local']}><Routes><Route path="/areas/:slug/:token" element={<PublicAreaMapPage/>}/></Routes></MemoryRouter></QueryClientProvider>;
  return <QueryClientProvider client={client}>
    <nav style={{height:44,display:'flex',gap:8,alignItems:'center',background:'white',fontSize:12}}>
      <label>Pavilhão <select aria-label="Pavilhão QA" value={id} onChange={e=>open(e.target.value)}>{pavilionChoices.map(([key,number])=><option key={key} value={key}>{number}</option>)}</select></label>
      <button onClick={()=>store.getState().exitInterior()}>Voltar ao mapa</button>
      <output style={{fontSize:10}}>{selected || 'Nenhum lote selecionado'}</output>
      <details style={{position:'absolute',bottom:0,right:0,zIndex:40,background:'white',padding:3,fontSize:10}}><summary>Ferramentas QA</summary>
      <button onClick={()=>setSceneEntities(items=>items.map(e=>({...e,geometry:{...e.geometry}})))}>Atualizar dados QA</button><br/>
      <button onClick={()=>{window.__commercialMapRuntimeDiagnostics?.resetSamples();}}>Iniciar medição QA</button><br/>
      <button onClick={()=>{window.__commercialMapRuntimeDiagnostics?.capture();document.documentElement.dataset.qaPerformance=JSON.stringify(summarizeCommercialMapRuntimeDiagnostics());}}>Registrar medição QA</button><br/>
      <button onClick={()=>void stressCommands()}>Estresse 20 ciclos QA</button><br/>
      <button onClick={()=>void interruptCommand()}>Interromper transição QA</button>
      </details>
    </nav>
    <style>{`.qa-interior-details .commercial-pavilion-module-card{position:relative;inset:auto;width:100%;max-height:none}.qa-interior-details{position:absolute;top:8px;left:8px;width:280px;max-height:85%;overflow:auto;background:white;z-index:20}@media(max-width:720px){.qa-interior-details{top:auto;bottom:0;left:0;width:100%;height:220px}}`}</style>
    <div data-interior-qa-shell className="commercial-map-canvas" style={{height:'calc(100dvh - 44px)',position:'relative'}}>
      <CommercialMapCanvas entities={sceneEntities} lots={data.lots} calibration={null} matchingEntityIds={new Set()} filtersActive={false} sceneInteriorEntityId={interior} />
      {selected && <aside data-commercial-map-camera-obstruction className="qa-interior-details"><button onClick={()=>store.getState().setSelectedModuleId(null)}>Fechar detalhes QA</button><PavilionModuleCard plan={plans[id]} pavilion={getPavilion(id)} entities={data.entities} lots={data.lots} permissions={permissions} source="official-reference" /></aside>}
    </div>
  </QueryClientProvider>;
}
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={client}><AuthProvider><App/></AuthProvider></QueryClientProvider>);
