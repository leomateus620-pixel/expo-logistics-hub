// Local-only QA entry: production components and canonical reference fixtures.
import React, { useState } from 'react';
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
  const selected = store(s => s.selectedModuleId);
  const interior = store(s => s.interiorEntityId);
  const open = (next: string) => { setId(next); store.getState().enterInterior(getPavilion(next).id); };
  if (isPublic) return <QueryClientProvider client={client}><MemoryRouter initialEntries={['/areas/'+slug+'/qa-local']}><Routes><Route path="/areas/:slug/:token" element={<PublicAreaMapPage/>}/></Routes></MemoryRouter></QueryClientProvider>;
  return <QueryClientProvider client={client}>
    <nav style={{height:44,display:'flex',gap:12,alignItems:'center',background:'white'}}>
      <strong>QA local · fixture canônica</strong>
      <button onClick={()=>open('B2')}>Pavilhão 14</button><button onClick={()=>open('B6')}>Pavilhão 3</button>
      <button onClick={()=>store.getState().exitInterior()}>Voltar ao mapa</button>
      <output>{selected || 'Nenhum lote selecionado'}</output>
    </nav>
    <div className="commercial-map-canvas" style={{height:'calc(100dvh - 44px)',position:'relative'}}>
      <CommercialMapCanvas entities={data.entities} lots={data.lots} calibration={null} matchingEntityIds={new Set()} filtersActive={false} sceneInteriorEntityId={interior} />
      {selected && <aside style={{position:'absolute',top:8,left:8,width:280}}><PavilionModuleCard plan={plans[id]} pavilion={getPavilion(id)} entities={data.entities} lots={data.lots} permissions={permissions} source="official-reference" /></aside>}
    </div>
  </QueryClientProvider>;
}
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={client}><AuthProvider><App/></AuthProvider></QueryClientProvider>);
