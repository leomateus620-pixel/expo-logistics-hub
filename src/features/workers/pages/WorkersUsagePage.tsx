import { useCallback, useEffect, useRef, useState } from 'react';
import { BarChart3, RefreshCw, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useCurrentOrg } from '@/hooks/useCurrentOrg';
import { callWorkerWorkspace } from '../workspace-api';
import type { UsageSummary } from '../workspace-contracts';
import { getWorker } from '../workerCatalog';
import { WorkerSkeletons } from '../components/WorkerPrimitives';
import { workspaceDate } from '../workspace/useWorkerWorkspace';

export default function WorkersUsagePage() {
  const { user } = useAuth(); const { orgId, myRole } = useCurrentOrg(); const scope = `${user?.id ?? ''}:${orgId ?? ''}`; const liveScope = useRef(scope); liveScope.current = scope;
  const [ownerScope, setOwnerScope] = useState(scope); const [days, setDays] = useState('7'); const [data, setData] = useState<UsageSummary | null>(null); const [loading, setLoading] = useState(false); const [error, setError] = useState<string | null>(null); const request = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    if (!orgId || myRole !== 'admin') return;
    request.current?.abort(); const controller = new AbortController(); request.current = controller; const requestedScope = scope;
    setLoading(true); setError(null);
    try { const now = Date.now(); const result = await callWorkerWorkspace({ command: 'usage', orgId, from: new Date(now - Number(days) * 86400000).toISOString(), to: new Date(now).toISOString() }, controller.signal);
      if (!controller.signal.aborted && liveScope.current === requestedScope && 'rows' in result) { setOwnerScope(requestedScope); setData(result); }
    } catch (failure) { if (!controller.signal.aborted && liveScope.current === requestedScope) setError(failure instanceof Error ? failure.message : 'Não foi possível consultar o uso.'); }
    finally { if (!controller.signal.aborted && liveScope.current === requestedScope) setLoading(false); }
  }, [orgId, myRole, scope, days]);
  useEffect(() => { setData(null); setOwnerScope(scope); void load(); return () => request.current?.abort(); }, [scope, load]);
  const visibleData = ownerScope === scope && myRole === 'admin' ? data : null;
  const totals = visibleData?.rows.reduce((total, row) => ({ requests: total.requests + row.requests, tokens: total.tokens + row.inputTokens + row.outputTokens, incomplete: total.incomplete + row.incompleteMeasurements }), { requests: 0, tokens: 0, incomplete: 0 });
  if (myRole !== 'admin') return <div className="worker-panel-empty"><ShieldCheck size={32} /><h1>Acesso administrativo necessário.</h1><p>O uso agregado da equipe é restrito à administração da organização.</p></div>;
  return <div className="worker-usage-page"><div className="worker-section-heading"><div><span className="worker-eyebrow"><BarChart3 size={15} />Uso da equipe</span><h1>Uma visão do trabalho.</h1><p>Dados agregados por usuário e bot, dentro da organização atual.</p></div><div className="worker-usage-filters"><label className="sr-only" htmlFor="worker-usage-period">Período do relatório</label><select id="worker-usage-period" value={days} onChange={event => setDays(event.target.value)}><option value="7">Últimos 7 dias</option><option value="30">Últimos 30 dias</option></select><button type="button" className="worker-button worker-button--quiet" onClick={() => void load()} disabled={loading}><RefreshCw size={15} className={loading ? 'worker-spin' : ''} />Atualizar</button></div></div>
    <div className="worker-workspace-notice"><ShieldCheck size={18} /><span>Telemetria informada no contexto de cada usuário. Estes registros não são uma fatura verificada. Conversas, memória e dados privados das ações não aparecem neste painel.</span></div>
    {error && <p role="alert" className="worker-inline-error">{error}</p>}
    {loading && !visibleData ? <WorkerSkeletons rows={4} /> : <><div className="worker-usage-kpis"><article><span>Consultas registradas</span><strong>{totals?.requests.toLocaleString('pt-BR') ?? '—'}</strong></article><article><span>Tokens informados{totals?.incomplete ? ' · parcial' : ''}</span><strong>{totals?.tokens.toLocaleString('pt-BR') ?? '—'}</strong></article><article><span>Custo</span><strong className="worker-usage-unknown">Não informado</strong><small>Sem origem de cobrança verificada.</small></article><article><span>Limite de custo</span><strong className="worker-usage-unknown">Não configurado</strong><small>Sem cálculo de saldo ou percentual.</small></article></div>
    {visibleData?.rows.length ? <div className="worker-usage-table-wrap" role="region" aria-label="Uso por usuário e bot" tabIndex={0}><table className="worker-usage-table"><caption>Uso agregado de {workspaceDate(visibleData.from)} a {workspaceDate(visibleData.to)} · America/Sao_Paulo</caption><thead><tr><th scope="col">Usuário</th><th scope="col">Bot</th><th scope="col">Consultas</th><th scope="col">Tokens</th><th scope="col">Custo</th><th scope="col">Qualidade</th></tr></thead><tbody>{visibleData.rows.map(row => <tr key={`${row.userId}:${row.workerId}`}><th scope="row"><span title={row.userId}>Conta {row.userId.slice(0, 8)}</span></th><td>{getWorker(row.workerId)?.name ?? 'Equipe'}</td><td>{row.requests.toLocaleString('pt-BR')}</td><td>{(row.inputTokens + row.outputTokens).toLocaleString('pt-BR')}</td><td>Não informado</td><td>{row.incompleteMeasurements ? `${row.incompleteMeasurements} medição(ões) parcial(is)` : 'Informada pelo usuário'}</td></tr>)}</tbody></table></div> : !loading && <div className="worker-panel-empty"><BarChart3 size={30} /><h2>Ainda sem registros neste período.</h2><p>O uso aparece aqui conforme a equipe trabalha no app.</p></div>}
    {visibleData && <p className="worker-small-note">Atualizado em {workspaceDate(visibleData.serverNow)}. Medições incompletas: {totals?.incomplete ?? 0}. Valores ausentes nunca são tratados como custo zero.</p>}</>}
  </div>;
}
