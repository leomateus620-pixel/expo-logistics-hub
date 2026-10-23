// Component-only presentation fixture. No user/session/AI requests.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { WorkersLauncherButton } from '@/components/WorkersLauncherButton';
import { FenasojaPortalHistory } from '@/components/portal/FenasojaPortalHistory';
import { CommercialMapHeaderTools } from '@/features/commercial-map/components/shell/CommercialMapHeaderTools';
import { WorkersLauncherSlot } from '@/components/WorkersLauncherSlot';
import { createPortal } from 'react-dom';
import { useSyncExternalStore } from 'react';
import { subscribeWorkersLauncherPlacement, workersLauncherSlot } from '@/components/workersLauncherPlacement';
import '@/index.css';
import '@/styles/commission-portal.css';
import '@/styles/cronograma-command-layer.css';
function Fixture() {
  const [open, setOpen] = useState(false);
  const surface = new URLSearchParams(location.search).get('surface') ?? 'portal';
  const slot = useSyncExternalStore(subscribeWorkersLauncherPlacement, () => workersLauncherSlot(surface === 'map' ? 'map' : surface === 'agenda' ? 'agenda' : 'portal'));
  return <main style={{ minHeight: '100dvh', padding: 16, background: '#06182e' }}>
    <p style={{ color: '#adbed0', fontSize: 11, marginBottom: 12 }}>Prévia de componentes · sem sessão e sem consultas ao bot</p>
    {surface === 'portal' ? <div className="fenasoja-portal__header"><button className="fenasoja-portal__alvorada-launcher" aria-label="Abrir Ecossistema Fenasoja"><FenasojaPortalHistory released /></button><WorkersLauncherSlot surface="portal" /></div>
    : surface === 'map' ? <div style={{ position: 'relative', minHeight: 190, background: '#e4eff2', borderRadius: 16 }}><CommercialMapHeaderTools dashboardAvailable onOpenDashboard={() => {}} /></div>
    : <header className="cronograma-module-bar" data-layout="command" style={{ position: 'relative' }}><div className="cronograma-command-layer"><div className="cronograma-command-layer__left"><a href="#">Portal</a><label style={{ display:'flex', alignItems:'center', minWidth:0 }}><span aria-hidden>⌕</span><input aria-label="Buscar evento, pessoa, comissão" placeholder="Buscar evento, pessoa, comissão" style={{ minWidth:0, width:'min(290px, 48vw)',background:'transparent',padding:10,color:'white' }} /></label><WorkersLauncherSlot surface="agenda" /></div></div></header>}
    {slot && createPortal(<WorkersLauncherButton docked open={open} onOpen={() => setOpen(true)} />,slot)}
    {open && <div role="dialog" aria-label="Prévia do botão" style={{ background:'white',padding:20,marginTop:24 }}><p>Na aplicação, este botão usa a confirmação de senha existente.</p><button onClick={() => setOpen(false)}>Fechar prévia</button></div>}
  </main>;
}
const root = createRoot(document.getElementById('root')!);root.render(<Fixture />);
if(import.meta.hot)import.meta.hot.dispose(()=>root.unmount());
