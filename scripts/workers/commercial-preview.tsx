/** The production rich renderer in an isolated, loopback-only visual harness. */
import { createRoot } from 'react-dom/client';
import WorkerRichContent from '@/features/workers/components/WorkerRichContent';
import { commercialResponseFixture } from './preview-commercial';
import '@/styles/tokens.css';
import '@/index.css';
import '@/features/workers/styles/worker-tokens.css';
import '@/features/workers/styles/workers.css';

if (!['127.0.0.1', 'localhost'].includes(location.hostname)) throw new Error('Synthetic local QA only.');
const response = commercialResponseFixture({ orgId: '10000000-0000-4000-8000-000000000001', message: 'Relatório comercial de teste' }, [])!;
const params = new URLSearchParams(location.search);
createRoot(document.getElementById('root')!).render(params.has('mobile') ? <main style={{ padding: 12, background: '#eff2f6' }}><p style={{ font: '12px system-ui', margin: '0 0 8px' }}>Viewport móvel de 390 px · dados e geometria fictícios</p><iframe title="Prévia em largura móvel" src="/scripts/workers/commercial-preview.html?frame" style={{ display: 'block', width: 390, height: 1840, maxWidth: '100%', border: 0, background: '#fff' }} /></main>
  : <main className="workers-scope" style={{ maxWidth: 820, padding: params.has('frame') ? 12 : 24, margin: '0 auto', background: 'var(--worker-paper)' }}>
    <header style={{ marginBottom: 22, borderBottom: '1px solid var(--worker-border)', paddingBottom: 14 }}><strong style={{ fontSize: 17, color: 'var(--worker-primary)' }}>BOT FENASOJA</strong><p style={{ fontSize: 11, lineHeight: '18px', marginTop: 4, color: 'var(--worker-muted)' }}>PRÉVIA LOCAL · DADOS DE TESTE · nomes, valores e geometria fictícios</p></header>
    <WorkerRichContent content={response.content} onRefreshCommercial={() => location.reload()} />
  </main>);
