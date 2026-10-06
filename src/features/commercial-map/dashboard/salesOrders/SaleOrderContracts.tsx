import { useState } from 'react';
import { FileText } from 'lucide-react';
import { getContractSignedUrl } from '../../services/commercialMapService';
import { describeSalesError, type SaleContract } from './salesOrdersService';
import { fmtSaleDate } from './salesOrdersPresentation';

export function SaleOrderContract({ contract, labelOf, canReplace, onReplace }: {
  contract: SaleContract; labelOf: (lotId: string) => string; canReplace: boolean; onReplace: () => void;
}) {
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = contract.versions.find((v) => !v.supersededAt) ?? contract.versions[0];
  const open = async (path: string) => {
    setOpening(true); setError(null);
    // URL temporária gerada a cada abertura: nunca reutiliza um link expirado.
    const win = window.open('', '_blank', 'noopener');
    try {
      const url = await getContractSignedUrl(path);
      if (win) win.location.href = url; else window.location.assign(url);
    } catch (e) { win?.close(); setError(describeSalesError(e)); } finally { setOpening(false); }
  };
  return <li className="cso-doc">
    <FileText className="cso-doc-icon" aria-hidden="true" />
    <div className="cso-doc-body">
      <h4>{active?.originalName || (contract.contractNumber ? `Contrato ${contract.contractNumber}` : 'Contrato sem número')}</h4>
      <p className="cso-doc-meta">
        <span>{contract.contractNumber ? `Contrato ${contract.contractNumber}` : 'Sem número'}</span>
        <span>{contract.scope === 'ORDER_ITEMS' ? 'Documento da venda' : 'Documento do lote'}</span>
        {active && <><strong>Versão {active.version}</strong><span>{fmtSaleDate(active.uploadedAt)}</span></>}
      </p>
      <div className="cso-doc-coverage"><span>Abrangência · {contract.lotIds.length} {contract.lotIds.length === 1 ? 'espaço' : 'espaços'}</span>
        {contract.lotIds.length > 0 ? <ul>{contract.lotIds.map((lotId) => <li key={lotId}>{labelOf(lotId)}</li>)}</ul> : <p>—</p>}
      </div>
      {!active && <p>Sem arquivo anexado</p>}
      {contract.versions.length > 1 && <details><summary>Histórico do documento ({contract.versions.length} versões)</summary>
        <ul>{contract.versions.map((v) => <li key={v.id}><button type="button" className="cso-link" disabled={opening} onClick={() => open(v.storagePath)}>v{v.version} · {v.originalName}</button><span>{fmtSaleDate(v.uploadedAt)}{v.id === active?.id ? ' · Atual' : ''}</span></li>)}</ul>
      </details>}
      {error && <p className="cso-note is-error" role="alert">{error}</p>}
    </div>
    <div className="cso-doc-actions">
      {active && <button type="button" className="cso-secondary" disabled={opening} onClick={() => open(active.storagePath)}>{opening ? 'Abrindo…' : 'Abrir contrato'}</button>}
      {canReplace && <button type="button" className="cso-link" onClick={onReplace}>Nova versão</button>}
    </div>
  </li>;
}
