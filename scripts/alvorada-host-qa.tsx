// Development/CI fixture only. No production route or authentication bypass.
import React, { Suspense, lazy, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { AlvoradaIntro } from '../src/features/alvorada/AlvoradaIntro';
import { FenasojaPortalHero } from '../src/components/portal/FenasojaPortalHero';
import '../src/index.css';
import '../src/styles/commission-portal.css';

const params = new URLSearchParams(location.search);
const host = params.get('host') ?? 'portal-card';
function Diagnostic() {
  const [done, setDone] = useState(false);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (host === 'portal-card') return <MemoryRouter><div className="fenasoja-portal"><main className="fenasoja-portal__shell"><FenasojaPortalHero /></main></div></MemoryRouter>;
  // Same current renderer in the old fixed/body hosting topology; this is NOT
  // presented as a run of the historical implementation.
  const style: React.CSSProperties = host === 'standalone'
    ? { position: 'fixed', inset: 0 }
    : { position: 'relative', width: 'min(1180px, calc(100vw - 24px))', height: 420, margin: '16px auto', overflow: 'hidden' };
  return <main data-qa-host={host} style={style}>{done ? <p>Official Countdown</p> : <><AlvoradaIntro motion={reduced ? 'reduced' : 'cinematic'} onFinished={() => setDone(true)} /><button style={{ position: 'absolute', right: 12, bottom: 12, zIndex: 20 }} onClick={() => setDone(true)}>Pular animação</button></>}</main>;
}
createRoot(document.getElementById('root')!).render(<Diagnostic />);
