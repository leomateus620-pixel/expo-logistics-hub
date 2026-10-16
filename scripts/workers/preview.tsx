import { createRoot } from 'react-dom/client';
import { BrowserRouter, useLocation } from 'react-router-dom';
import WorkersRoot from '@/features/workers/WorkersRoot';
import WorkersAdminGuard from '@/features/workers/WorkersAdminGuard';
import WorkersLauncher from '@/components/WorkersLauncher';
import '@/styles/tokens.css';
import '@/index.css';

if (!['127.0.0.1', 'localhost'].includes(location.hostname)) throw new Error('Local workers QA only.');
if (new URLSearchParams(location.search).get('theme') === 'dark') document.documentElement.classList.add('dark');
export function Preview() {
  const location = useLocation();
  return <>{location.pathname.startsWith('/admin/workers/') ? <WorkersAdminGuard><WorkersRoot /></WorkersAdminGuard>
    : location.pathname.startsWith('/equipe-ia') ? <WorkersRoot />
      : <><main style={{ padding: 48 }}><h1>Contexto de revisão local</h1><p>Esta página verifica a abertura do copiloto. Nenhum dado de negócio é carregado.</p></main><WorkersLauncher /></>}
    <span style={{ position: 'fixed', left: 8, bottom: 3, zIndex: 99, fontSize: 10, color: '#536075', background: '#fff', padding: '2px 6px', borderRadius: 4, pointerEvents: 'none' }}>Prévia local · dados de teste</span></>;
}
createRoot(document.getElementById('root')!).render(<BrowserRouter><Preview /></BrowserRouter>);
