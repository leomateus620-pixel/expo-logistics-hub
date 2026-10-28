import { useEffect, useMemo, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useQuery } from '@tanstack/react-query';
import { Download, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { paymentMethodLabel } from '../../sales/salesTypes';
import { generateContractsPdf, type ContractPdfRecord } from '../contractsPdf';
import { describeSalesError, EMPTY_SALE_FILTERS, type SaleOrdersFilters } from './salesOrdersService';
import { fmtSaleDate } from './salesOrdersPresentation';
import './attach-order-contract.css';
import './contracts-export.css';

type SignatureSelection = 'ALL' | 'SIGNED' | 'PENDING';
type Scope = 'filtered' | 'all';
interface ExportSnapshot { generatedAt: string; projectName: string | null; rows: ContractPdfRecord[] }

const signatureLabels: Record<SignatureSelection, string> = {
  ALL: 'Todos os contratos', SIGNED: 'Somente assinados', PENDING: 'Com assinatura pendente',
};
const statusLabels: Record<Exclude<SaleOrdersFilters['status'], ''>, string> = {
  PENDING: 'Aguardando assinatura', PARTIAL: 'Parcialmente assinada', SIGNED: 'Assinatura confirmada',
  CANCELLED_PARTIAL: 'Com cancelamento', LEGACY: 'Legado',
};
const signatureFilters = ['PENDING', 'PARTIAL', 'SIGNED'];

export function effectiveExportFilters(filters: SaleOrdersFilters, scope: Scope, signature: SignatureSelection): SaleOrdersFilters {
  const result = { ...(scope === 'filtered' ? filters : EMPTY_SALE_FILTERS) };
  if (signature !== 'ALL' && signatureFilters.includes(result.status)) result.status = '';
  return result;
}

export function describeExportScope(filters: SaleOrdersFilters, scope: Scope, signature: SignatureSelection): string {
  const effective = effectiveExportFilters(filters, scope, signature);
  const parts = [scope === 'filtered' ? 'Busca e filtros atuais' : 'Toda a base autorizada', signatureLabels[signature]];
  if (effective.search) parts.push(`Busca: ${effective.search}`);
  if (effective.status) parts.push(`Situação da tela: ${statusLabels[effective.status]}`);
  if (effective.hasDocument) parts.push(effective.hasDocument === 'yes' ? 'Com arquivo anexado' : 'Sem arquivo anexado');
  if (effective.paymentMethod) parts.push(`Pagamento: ${paymentMethodLabel(effective.paymentMethod)}`);
  if (effective.from) parts.push(`De ${fmtSaleDate(effective.from)}`);
  if (effective.to) parts.push(`Até ${fmtSaleDate(effective.to)}`);
  if (scope === 'filtered' && signature !== 'ALL' && signatureFilters.includes(filters.status)) {
    parts.push('Filtro de assinatura da tela substituído pela opção de exportação');
  }
  return parts.join(' · ');
}

async function fetchExportSnapshot(projectId: string, filters: SaleOrdersFilters, signature: SignatureSelection): Promise<ExportSnapshot> {
  // The RPC revalidates the same sales permission and returns the entire snapshot in one transaction.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('export_commercial_sale_orders', {
    p_project_id: projectId, p_search: filters.search.trim() || null, p_status: filters.status || null,
    p_has_document: filters.hasDocument === '' ? null : filters.hasDocument === 'yes',
    p_payment_method: filters.paymentMethod || null, p_from: filters.from || null, p_to: filters.to || null,
    p_signature_selection: signature,
  });
  if (error) throw error;
  if (!data || !Array.isArray(data.rows) || typeof data.generatedAt !== 'string' || !Number.isFinite(Date.parse(data.generatedAt))) {
    throw new Error('A consulta do relatório retornou dados incompletos. Tente novamente.');
  }
  return data as ExportSnapshot;
}

function exportFilename(signature: SignatureSelection, generatedAt: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(generatedAt));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '';
  const suffix = signature === 'SIGNED' ? 'assinados' : signature === 'PENDING' ? 'pendentes' : 'todos';
  return `fenasoja_contratos_${suffix}_${part('year')}-${part('month')}-${part('day')}_${part('hour')}${part('minute')}.pdf`;
}

export function ContractsExportDialog({ open, onOpenChange, projectId, filters, busy, setBusy }: {
  open: boolean; onOpenChange: (open: boolean) => void; projectId: string; filters: SaleOrdersFilters;
  busy: boolean; setBusy: (busy: boolean) => void;
}) {
  const [signature, setSignature] = useState<SignatureSelection>('ALL');
  const [scope, setScope] = useState<Scope>('filtered');
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);
  const openRef = useRef(open);
  openRef.current = open;
  const effectiveFilters = useMemo(() => effectiveExportFilters(filters, scope, signature), [filters, scope, signature]);
  const scopeDescription = describeExportScope(filters, scope, signature);
  const preview = useQuery({
    queryKey: ['commercial-contract-export-preview', projectId, effectiveFilters, signature],
    queryFn: () => fetchExportSnapshot(projectId, effectiveFilters, signature),
    enabled: open && Boolean(projectId), staleTime: 0, refetchOnMount: 'always', retry: false,
  });
  useEffect(() => { if (open) setError(null); }, [open, signature, scope]);
  const generate = async () => {
    if (submitting.current) return;
    submitting.current = true; setBusy(true); setError(null);
    try {
      // Refresh immediately before generation; rows, totals and date come from this same snapshot.
      const snapshot = await fetchExportSnapshot(projectId, effectiveFilters, signature);
      if (snapshot.rows.length === 0) {
        const message = 'Nenhum contrato encontrado neste recorte. Ajuste as opções e tente novamente.';
        setError(message);
        if (!openRef.current) toast.error(message);
        await preview.refetch();
        return;
      }
      const pdf = await generateContractsPdf({ records: snapshot.rows, scopeDescription: `${scopeDescription} · Cada linha representa um pedido ou registro legado`, eventName: snapshot.projectName ?? undefined, generatedAt: new Date(snapshot.generatedAt) });
      pdf.save(exportFilename(signature, snapshot.generatedAt));
      onOpenChange(false);
    } catch (e) {
      const detail = describeSalesError(e);
      const message = detail.includes('permissão') || detail.includes('conexão') ? detail : 'Não foi possível gerar o PDF. Tente novamente.';
      setError(message);
      if (!openRef.current) toast.error(message);
    }
    finally { submitting.current = false; setBusy(false); }
  };

  return <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Overlay className="cso-attach-overlay" />
      <div className="cso-attach-viewport">
        <Dialog.Content className="cso-attach-dialog cso-export-dialog" onKeyDown={(event) => event.stopPropagation()}>
          <header className="cso-attach-header">
            <div><span className="cso-attach-eyebrow">Vendas e contratos</span><Dialog.Title className="cso-attach-title">Baixar lista em PDF</Dialog.Title>
              <Dialog.Description className="cso-attach-description">Cada linha representa um pedido ou registro legado. A lista não reúne os arquivos dos contratos.</Dialog.Description></div>
            <Dialog.Close asChild><button className="cso-attach-close" type="button" aria-label="Fechar exportação"><X aria-hidden="true" /></button></Dialog.Close>
          </header>
          <div className="cso-attach-body">
            <fieldset className="cso-attach-section" disabled={busy}><legend>Situação da assinatura</legend>
              <div className="cso-export-options">{(Object.keys(signatureLabels) as SignatureSelection[]).map((value) => <label key={value} className={signature === value ? 'is-selected' : ''}><input type="radio" name="export-signature" checked={signature === value} onChange={() => setSignature(value)} /><span>{signatureLabels[value]}</span></label>)}</div>
            </fieldset>
            <fieldset className="cso-attach-section" disabled={busy}><legend>Abrangência</legend>
              <div className="cso-export-options"><label className={scope === 'filtered' ? 'is-selected' : ''}><input type="radio" name="export-scope" checked={scope === 'filtered'} onChange={() => setScope('filtered')} /><span>Aplicar a busca e os filtros atuais</span></label>
                <label className={scope === 'all' ? 'is-selected' : ''}><input type="radio" name="export-scope" checked={scope === 'all'} onChange={() => setScope('all')} /><span>Exportar toda a base autorizada</span></label></div>
            </fieldset>
            <div className="cso-export-summary" aria-live="polite"><strong>Recorte aplicado</strong><p>{scopeDescription}</p>
              {preview.isFetching ? <p><Loader2 className="is-spinning" aria-hidden="true" /> Consultando quantidade…</p>
                : preview.error ? <p role="alert">Não foi possível consultar a quantidade. <button type="button" onClick={() => void preview.refetch()}>Tentar novamente</button></p>
                : preview.data && <p><strong>{preview.data.rows.length}</strong> {preview.data.rows.length === 1 ? 'registro para exportação' : 'registros para exportação'}{preview.data.rows.length === 0 ? '. Nenhum contrato encontrado neste recorte.' : '.'}</p>}
            </div>
            {error && <p className="cso-export-error" role="alert">{error}</p>}
          </div>
          <footer className="cso-attach-footer"><p><span>Os dados serão atualizados ao gerar o PDF.</span></p>
            <button className="cso-export-submit" type="button" disabled={busy || preview.isFetching || !!preview.error || !preview.data?.rows.length} onClick={() => void generate()}>{busy ? <><Loader2 className="is-spinning" aria-hidden="true" />Gerando PDF…</> : <><Download aria-hidden="true" />Baixar lista em PDF</>}</button>
          </footer>
        </Dialog.Content>
      </div>
    </Dialog.Portal>
  </Dialog.Root>;
}
