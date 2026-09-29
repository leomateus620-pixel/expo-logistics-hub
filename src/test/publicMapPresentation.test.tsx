import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PublicMapLegend } from '@/features/commercial-map/public/PublicMapLegend';
import { PUBLIC_MAP_AREAS } from '@/features/commercial-map/public/publicAreaRegistry';
import { PublicLotDetails } from '@/features/commercial-map/public/PublicLotDetails';
import { usePublicCanvasLots } from '@/features/commercial-map/public/usePublicMapArea';
import { publicContextLabels } from '@/features/commercial-map/public/publicContextLabels';
import { createPublicExternalScenePolicy } from '@/features/commercial-map/public/publicScenePolicy';
import { usePublicMapRenderState } from '@/features/commercial-map/public/usePublicMapRenderState';
import { publishCommercialMapRenderHealth, COMMERCIAL_MAP_PREPARING_EVENT } from '@/features/commercial-map/utils/renderingHealth';
import type { PublicLot, PublicMapInventory } from '@/features/commercial-map/public/publicMapTypes';
import type { MapEntity } from '@/features/commercial-map/types';

afterEach(()=>{cleanup();vi.useRealTimers();document.body.innerHTML='';});
const lot={id:'lot',entityId:'entity',availability:'SALE_OPEN',buyerName:'PRIVATE INTERESTED',lotNumber:'1',block:'R',displayName:'Lote 1',publicIdentifier:'R-1',infrastructure:[],officialAreaSqm:100,
  pricing:{resolutionStatus:'OK',renovacaoTotal:1000,renovacaoPricePerSqm:10,segundaTotal:1100,segundaPricePerSqm:11}} as PublicLot;
describe('public-only three-condition presentation',()=>{
  it.each(PUBLIC_MAP_AREAS)('$slug shows only three conditions and the persisted segment identity',area=>{
    render(<PublicMapLegend area={area}/>);
    expect(screen.getByLabelText('Legenda de disponibilidade').querySelectorAll('i')).toHaveLength(3);
    for(const name of ['Disponível','Vendido','Bloqueado'])expect(screen.getByText(name)).toBeInTheDocument();
    expect(screen.queryByText('Venda em aberto')).toBeNull();
  });
  it('presents pending sales in blue without buyer, order/contract or pending logo even if a stale endpoint returns one',()=>{
    const hook=renderHook(()=>usePublicCanvasLots([lot],{lot:'https://example.invalid/pending.webp'}));
    expect(hook.result.current[0]).toMatchObject({status:'SOLD',currentBuyer:null,saleLogoUrl:null,activeContractNumber:null});
    render(<PublicLotDetails lot={lot} onClose={()=>undefined}/>);
    expect(screen.getByText('Vendido')).toHaveAttribute('data-availability','SOLD');
    expect(screen.queryByText('PRIVATE INTERESTED')).toBeNull();
    expect(lot.availability).toBe('SALE_OPEN');
  });
});
describe('authorized context labels',()=>{
  const entity=(id:string,name:string,classification:MapEntity['classification'],x=0)=>({id,name,classification,metadata:{},geometry:{coordinates:[[[x,0],[x+5,0],[x+5,5],[x,5],[x,0]]],elevation:0,extrusionHeight:0}} as MapEntity);
  it('uses only supplied names and polygons, excluding foreign blocks and distant roads',()=>{
    const own=entity('own','Quadra R','QUADRA'),road=entity('street','Rua cadastrada','ROAD');
    const inventory={scope:{kind:'SEGMENT'},lots:[lot],entities:[own,entity('entity','Lote 1','SELLABLE_LOT')]} as PublicMapInventory;
    const policy=createPublicExternalScenePolicy(inventory)!;
    const result=publicContextLabels([own,road,entity('foreign','Quadra restrita','QUADRA'),entity('far','Rua distante','ROAD',200)],policy);
    expect(result.map(label=>label.name)).toEqual(['Quadra R','Rua cadastrada']);
    expect(result.every(label=>label.anchor.every(Number.isFinite))).toBe(true);
    expect(publicContextLabels([],policy)).toEqual([]);
  });
});
describe('public presentation readiness',()=>{
  it('requires fresh prepared draws, distinguishes restoration from failure and retires an obsolete ready state',()=>{
    vi.useFakeTimers();
    const host=document.createElement('div');host.className='public-map-canvas';
    const canvas=document.createElement('canvas');host.append(canvas);document.body.append(host);
    const hook=renderHook(()=>usePublicMapRenderState(true));
    const health={status:'ready' as const,path:'direct' as const,presentedFrames:4,contextLosses:0,lastErrorCode:null};
    act(()=>publishCommercialMapRenderHealth(canvas,health));expect(hook.result.current).toBe('preparing');
    act(()=>{canvas.dataset.commercialMapReady='true';vi.advanceTimersByTime(500);});expect(hook.result.current).toBe('ready');
    act(()=>{canvas.dataset.commercialMapReady='false';publishCommercialMapRenderHealth(canvas,{...health,status:'context-lost',path:'suspended'});});
    expect(hook.result.current).toBe('recovering');
    act(()=>{canvas.dataset.commercialMapPreparationError='SCENE_PREPARATION_FAILED';canvas.dispatchEvent(new CustomEvent(COMMERCIAL_MAP_PREPARING_EVENT,{bubbles:true}));});
    expect(hook.result.current).toBe('failed');
    act(()=>{delete canvas.dataset.commercialMapPreparationError;canvas.dataset.commercialMapReady='true';publishCommercialMapRenderHealth(canvas,{...health,presentedFrames:8});});
    expect(hook.result.current).toBe('ready');hook.unmount();expect(vi.getTimerCount()).toBe(0);
  });
});
