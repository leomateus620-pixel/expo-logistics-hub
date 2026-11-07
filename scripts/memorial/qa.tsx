// Diagnostic fixture only: never imported by production, no session or operational data.
import React, { useLayoutEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
import { BrowserRouter, useSearchParams } from 'react-router-dom';
import { FenasojaEcosystemExperienceView } from '../../src/features/alvorada/FenasojaEcosystemExperience';
import { readEcosystemLocation, writeEcosystemLocation } from '../../src/features/alvorada/ecosystemNavigation';
import '../../src/index.css';

const qa = new URLSearchParams(location.search);
// Match the real portal's fullscreen-dialog scrollbar boundary.
document.documentElement.style.scrollbarGutter='auto';
if (qa.get('webgl')==='off') {
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (...args) {
    if (String(args[0]).startsWith('webgl')) return null;
    return getContext.apply(this,args);
  } as typeof getContext;
}
if (qa.get('motion')==='reduce' || qa.get('motion')==='full') {
  const media=window.matchMedia.bind(window);
  window.matchMedia=query => {
    const result=media(query);
    if (query==='(prefers-reduced-motion: reduce)') return {
      matches:qa.get('motion')==='reduce', media:query, onchange:null,
      addEventListener:()=>undefined, removeEventListener:()=>undefined,
      addListener:()=>undefined, removeListener:()=>undefined, dispatchEvent:()=>true,
    };
    return result;
  };
  if (qa.get('motion')==='reduce') {const style=document.createElement('style');style.textContent='.memorial * {animation:none!important;transition:none!important}';document.head.append(style);}
}
if (qa.get('media')==='slow' || qa.get('media')==='fail') {
  const fetchOriginal=window.fetch.bind(window);
  window.fetch=(input,init) => {
    const value=String(input);
    if (value.includes('/memorial-voluntariado/art/')) {
      const url=new URL(value,location.origin);
      url.searchParams.set('qa-media',qa.get('media')!);
      return fetchOriginal(url,init);
    }
    return fetchOriginal(input,init);
  };
}

export function Diagnostic() {
  const [params,setParams]=useSearchParams();
  const [surface,setSurface]=useState<Element>();
  const state=readEcosystemLocation(params) ?? {view:'organization' as const};
  useLayoutEffect(()=> {setSurface(document.querySelector('[data-testid="ecosystem-experience"]') ?? undefined);},[]);
  return <>
    <FenasojaEcosystemExperienceView navigation={state} onNavigate={target=>setParams(current=>writeEcosystemLocation(current,target))} onComplete={()=>setParams(current=>writeEcosystemLocation(current,{view:'organization'}))} organizationalData={{graph:null,isLoading:false,error:null,refetch:async()=>undefined}} />
    {surface && createPortal(<details data-qa-controls style={{position:'absolute',zIndex:20,right:12,bottom:12,maxWidth:240,padding:8,background:'#080c08',color:'#f4ddab',fontSize:11,border:'1px solid #c5a76a'}}>
      <summary style={{minHeight:44,display:'flex',alignItems:'center',cursor:'pointer'}}>QA · validação</summary>
      <strong>Fixture de validação · sem dados operacionais</strong>
      <p>WebGL: {qa.get('webgl') ?? 'ativo'} · Movimento: {qa.get('motion') ?? 'sistema'} · Rede: {qa.get('media') ?? 'normal'}</p>
      <button type="button" style={{minHeight:44,padding:8,border:'1px solid #a38852'}} onClick={()=> {
        const canvas=document.querySelector<HTMLCanvasElement>('.memorial canvas');
        const context=canvas?.getContext('webgl2'); context?.getExtension('WEBGL_lose_context')?.loseContext();
      }}>Simular perda de contexto</button>
    </details>,surface)}
  </>;
}
createRoot(document.getElementById('root')!).render(<BrowserRouter><Diagnostic /></BrowserRouter>);
