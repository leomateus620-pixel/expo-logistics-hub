import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Download, FileText, Info, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import {
  CommercialReportError, downloadCommercialReport, prepareCommercialReport, readCommercialReport,
  saveCommercialReport, type CommercialReportJob,
} from '../commercial-reports-api';
import type { WorkerResponseBlock } from '../../../../supabase/functions/_shared/workers/response-contract';
import '../styles/commercial-reports.css';

export type CommercialReportBlock = Extract<WorkerResponseBlock, { type?: 'commercial_report' }>;
export interface CommercialResponseActions {
  conversationId?: string | null;
  onRefreshCommercial?: (snapshotId: string) => void;
  commercialActionsDisabled?: boolean;
}
const pending = (job: CommercialReportJob | null) => !!job && ['requested', 'querying', 'rendering'].includes(job.status);
const statusLabel: Record<CommercialReportJob['status'], string> = {
  requested: 'Na fila de geração', querying: 'Conferindo a fotografia', rendering: 'Preparando o PDF',
  ready: 'PDF pronto', error: 'Falha na geração', expired: 'Emissão expirada',
};
export function commercialDateLabel(date: string): string {
  return new Date(date).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });
}
const coverageLabels: Record<string, string> = {
  missing_geometry: 'Espaços sem geometria', missing_area: 'Espaços sem metragem', missing_identity: 'Identificações comerciais ausentes',
  ambiguous_association: 'Associações que precisam de revisão', fees_not_reconciled: 'Taxas sem conciliação',
  legacy_unverified: 'Itens históricos sem assinatura comprovada', restricted_contracts: 'Referências contratuais restritas',
};
export const commercialCoverageLabel = (code: string) => coverageLabels[code.toLowerCase()] ?? 'Registros que precisam de revisão';

/** The persisted snapshot identifies the query. Job state always comes from the authorized endpoint. */
export function WorkerCommercialReport({ block, orgId, conversationId, onRefreshCommercial, commercialActionsDisabled }: {
  block: CommercialReportBlock; orgId: string;
} & CommercialResponseActions) {
  const [job, setJob] = useState<CommercialReportJob | null>(null);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState<'checking' | 'preparing' | 'downloading' | null>('checking');
  const [failure, setFailure] = useState<CommercialReportError | null>(null);
  const controller = useRef<AbortController | null>(null);
  const active = useRef(true);
  const operationRunning = useRef(false);
  const request = useCallback(() => ({ orgId, snapshotId: block.snapshotId, ...(conversationId ? { conversationId } : {}) }), [orgId, block.snapshotId, conversationId]);
  const fail = useCallback((cause: unknown) => {
    if (cause instanceof DOMException && cause.name === 'AbortError') return;
    setFailure(cause instanceof CommercialReportError ? cause : new CommercialReportError('unavailable'));
  }, []);
  const check = useCallback(async (signal: AbortSignal) => {
    try {
      const current = await readCommercialReport(request(), signal);
      if (signal.aborted || !active.current) return;
      setJob(current); setFailure(null); setChecked(true);
    } catch (cause) { if (!signal.aborted && active.current) fail(cause); }
    finally { if (!signal.aborted && active.current) setBusy(null); }
  }, [request, fail]);

  useEffect(() => {
    active.current = true;
    setChecked(false); setJob(null); setFailure(null); setBusy('checking');
    const current = new AbortController(); controller.current = current;
    void check(current.signal);
    return () => { active.current = false; current.abort(); controller.current?.abort(); };
  }, [check]);

  useEffect(() => {
    if (!pending(job) || failure) return;
    let timer: ReturnType<typeof setTimeout>;
    let polling: AbortController | null = null;
    const poll = async () => {
      if (document.hidden || operationRunning.current) { timer = setTimeout(poll, 4_000); return; }
      polling = new AbortController();
      await check(polling.signal);
      if (!polling.signal.aborted) timer = setTimeout(poll, 4_000);
    };
    timer = setTimeout(poll, 4_000);
    return () => { clearTimeout(timer); polling?.abort(); };
  }, [job?.id, job?.status, failure, check]);

  const run = async (operation: 'prepare' | 'download' | 'check') => {
    if (operationRunning.current) return;
    operationRunning.current = true;
    controller.current?.abort();
    const current = new AbortController(); controller.current = current;
    setFailure(null); setBusy(operation === 'prepare' ? 'preparing' : operation === 'download' ? 'downloading' : 'checking');
    try {
      if (operation === 'check') { await check(current.signal); return; }
      if (operation === 'prepare') {
        const result = await prepareCommercialReport(request(), current.signal);
        if (!current.signal.aborted && active.current) { setJob(result); setChecked(true); }
      } else if (job?.status === 'ready') {
        const file = await downloadCommercialReport({ ...request(), reportId: job.id }, current.signal);
        if (!current.signal.aborted && active.current) saveCommercialReport(file, block.title);
      }
    } catch (cause) { if (!current.signal.aborted && active.current) fail(cause); }
    finally { operationRunning.current = false; if (!current.signal.aborted && active.current) setBusy(null); }
  };
  const state = failure?.code === 'expired' ? 'expired' : job?.status ?? 'available';
  const label = busy === 'checking' ? 'Verificando disponibilidade' : busy === 'preparing' ? 'Solicitando o PDF'
    : busy === 'downloading' ? 'Obtendo o arquivo' : failure?.code === 'expired' ? 'Emissão expirada' : failure ? 'Consulta indisponível' : job ? statusLabel[job.status] : 'Consulta pronta para exportar';
  const running = !!busy || pending(job);
  const disabled = !!busy || !!commercialActionsDisabled;

  return <section className="worker-commercial-report" aria-label={block.title} data-report-status={state}>
    <header className="worker-commercial-report__header">
      <span className="worker-commercial-report__icon" aria-hidden="true"><FileText size={22} /></span>
      <div><span className="worker-commercial-report__eyebrow">Relatório comercial</span><h3>{block.title}</h3></div>
      <details className="worker-commercial-report__info"><summary aria-label="Sobre esta consulta"><Info size={17} /></summary><p>A consulta e o PDF usam a mesma fotografia dos dados. Atualizar cria uma nova consulta; esta emissão mantém seus dados e sua data.</p></details>
    </header>
    <ul className="worker-commercial-chips" aria-label="Escopo e filtros da consulta">{[...block.scopeLabels, ...block.filterLabels].map((label, index) => <li key={index}>{label}</li>)}</ul>
    <div className="worker-commercial-report__facts"><span>Dados consultados em <time dateTime={block.generatedAt}>{commercialDateLabel(block.generatedAt)}</time></span><span>Horário de Brasília</span></div>
    <div className="worker-commercial-report__coverage"><ShieldCheck size={15} aria-hidden="true" /><span>{block.coverage.complete ? 'Cobertura completa do recorte' : 'Cobertura parcial · consulte os critérios'}{block.rowCount > block.previewCount ? ` · Exibindo ${block.previewCount.toLocaleString('pt-BR')} de ${block.rowCount.toLocaleString('pt-BR')} registros` : ` · ${block.rowCount.toLocaleString('pt-BR')} registros`}</span></div>
    <details className="worker-commercial-report__criteria"><summary>Critérios e cobertura <ChevronDown size={14} /></summary><div>
      <p>O arquivo inclui todas as linhas do recorte consultado, com paginação. Assinatura, documento de contrato e recebimento são dimensões independentes.</p>
      <dl><div><dt>Identificação empresarial</dt><dd>{block.capabilities.companyNames ? 'Autorizada' : 'Informação restrita'}</dd></div><div><dt>Valores</dt><dd>{block.capabilities.monetaryValues ? 'Autorizados' : 'Informação restrita'}</dd></div><div><dt>Referências contratuais</dt><dd>{block.capabilities.contractReferences ? 'Autorizadas' : 'Informação restrita'}</dd></div></dl>
      {block.coverage.excludedRows > 0 && <p>{block.coverage.excludedRows.toLocaleString('pt-BR')} registros fora da cobertura.</p>}
      {block.coverage.issues.length > 0 && <ul>{block.coverage.issues.map((issue, index) => <li key={index}>{commercialCoverageLabel(issue.code)}: {issue.count.toLocaleString('pt-BR')}</li>)}</ul>}
    </div></details>
    <div className="worker-commercial-report__status" role="status" aria-live="polite">{running ? <Loader2 size={15} className="worker-commercial-spin" aria-hidden="true" /> : !failure && job?.status === 'ready' ? <Check size={15} aria-hidden="true" /> : <FileText size={15} aria-hidden="true" />}<span>{label}{!failure && job?.status === 'ready' && job.pageCount ? ` · ${job.pageCount} ${job.pageCount === 1 ? 'página' : 'páginas'}` : ''}</span></div>
    {failure && <p className="worker-commercial-report__failure" role="alert">{failure.message}</p>}
    {job?.status === 'error' && !failure && <p className="worker-commercial-report__failure">A geração não foi concluída. Tente novamente com a mesma fotografia.</p>}
    {job?.status === 'expired' && !failure && <p className="worker-commercial-report__failure">A validade desta emissão terminou. Atualize os dados para gerar um novo relatório.</p>}
    {!failure && job?.expiresAt && job.status === 'ready' && <p className="worker-commercial-report__validity">Disponível até {commercialDateLabel(job.expiresAt)}.</p>}
    {!failure && !job && <p className="worker-commercial-report__validity">Fotografia disponível até {commercialDateLabel(block.expiresAt ?? new Date(Date.parse(block.generatedAt) + 30 * 86_400_000).toISOString())} · retenção de 30 dias.</p>}
    <div className="worker-commercial-report__actions">
      {failure ? <button type="button" className="worker-button worker-button--quiet" disabled={disabled} onClick={() => void run('check')}><RefreshCw size={15} />Verificar novamente</button>
        : job?.status === 'ready' ? <button type="button" className="worker-button worker-button--primary" disabled={disabled} onClick={() => void run('download')}><Download size={16} />{busy === 'downloading' ? 'Baixando PDF…' : 'Baixar PDF'}</button>
          : !pending(job) && job?.status !== 'expired' && <button type="button" className="worker-button worker-button--primary" disabled={disabled || !checked} onClick={() => void run('prepare')}><FileText size={16} />{job?.status === 'error' ? 'Tentar gerar novamente' : 'Gerar PDF'}</button>}
      {onRefreshCommercial && <button type="button" className="worker-button worker-button--quiet" disabled={disabled} onClick={() => onRefreshCommercial(block.snapshotId)}><RefreshCw size={15} />Atualizar dados</button>}
    </div>
  </section>;
}
