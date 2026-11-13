import { FileText } from 'lucide-react';
import { LotContractFileButton } from '../../components/commercial/LotContractFileButton';
import type { SaleContract } from './salesOrdersService';
import { fmtSaleDate } from './salesOrdersPresentation';

export function SaleOrderContract({ contract, labelOf, canReplace, onReplace }: {
  contract: SaleContract; labelOf: (lotId: string) => string; canReplace: boolean; onReplace: () => void;
}) {
  const active = contract.versions.find((v) => !v.supersededAt) ?? contract.versions[0];
  const formerCoverage = (contract.historicalLotIds ?? []).filter((id) => !contract.lotIds.includes(id));
  return <li className="cso-doc">
    <FileText className="cso-doc-icon" aria-hidden="true" />
    <div className="cso-doc-body">
      <h4>{active?.originalName || (contract.contractNumber ? `Contrato ${contract.contractNumber}` : 'Contrato sem número')}</h4>
      <p className="cso-doc-meta">
        <span>{contract.contractNumber ? `Contrato ${contract.contractNumber}` : 'Sem número'}</span>
        <span>{contract.scope === 'ORDER_ITEMS' ? 'Documento da venda' : 'Documento do lote'}</span>
        {active && <><strong>Versão {active.version}</strong><span>{fmtSaleDate(active.uploadedAt)}</span></>}
      </p>
      <div className="cso-doc-coverage"><span>Abrangência atual · {contract.lotIds.length} {contract.lotIds.length === 1 ? 'espaço' : 'espaços'}</span>
        {contract.lotIds.length > 0 ? <ul>{contract.lotIds.map((lotId) => <li key={lotId}>{labelOf(lotId)}</li>)}</ul> : <p>—</p>}
      </div>
      {formerCoverage.length > 0 && <div className="cso-doc-coverage"><span>Abrangência anterior</span>
        <ul>{formerCoverage.map((lotId) => <li key={lotId}>{labelOf(lotId)}</li>)}</ul>
      </div>}
      {!active && <p>Sem arquivo anexado</p>}
      {contract.versions.length > 1 && <details><summary>Histórico do documento ({contract.versions.length} versões)</summary>
        <ul>{contract.versions.map((v) => <li key={v.id}><LotContractFileButton className="cso-link" version={v}>v{v.version} · {v.originalName}</LotContractFileButton><span>{fmtSaleDate(v.uploadedAt)}{v.id === active?.id ? ' · Atual' : ''}</span>
          {v.coveredLotIds?.length ? <small>{v.coveredLotIds.map(labelOf).join(' / ')}</small> : null}</li>)}</ul>
      </details>}
    </div>
    <div className="cso-doc-actions">
      {active && <LotContractFileButton className="cso-secondary" version={active} />}
      {canReplace && <button type="button" className="cso-link" onClick={onReplace}>Nova versão</button>}
    </div>
  </li>;
}
