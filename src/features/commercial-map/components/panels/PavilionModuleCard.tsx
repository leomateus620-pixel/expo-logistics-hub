import { memo, useLayoutEffect, useMemo, useState } from 'react';
import {
  CalendarClock,
  FileLock2,
  FileText,
  Handshake,
  PencilLine,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  X,
} from 'lucide-react';
import { useSalesStore } from '../../sales/useSalesSelection';
import { Button } from '@/components/ui/button';
import { STATUS_CONFIG } from '../../constants';
import { useLotContractVersions, useLotSaleHistory } from '../../hooks/useCommercialMap';
import { useCommercialMapStore } from '../../state/useCommercialMapStore';
import type {
  CommercialLot,
  MapEntity,
  MapPermissions,
  MapSource,
} from '../../types';
import type { CommercialPavilionModulePlan } from '../../utils/commercialPavilionModules';
import { buildPavilionModuleCommercialIndex } from '../../utils/pavilionModuleCommercial';
import {
  formatAreaSqm,
  getPavilionAreaSummary,
} from '../../data/pavilionModuleOfficialAreas';
import { CompactDetailSheetControls } from './CompactDetailSheet';
import { useCompactDetailSheet } from '../../hooks/useCompactDetailSheet';
import { LotAvailabilityDialog } from '../commercial/LotAvailabilityDialog';
import { LotEditDialog } from '../commercial/LotEditDialog';
import { LotWorkflowDialog, type LotWorkflow } from '../commercial/LotWorkflowDialog';
import { LotPricing2028Panel } from './LotPricing2028Panel';
import { LotSaleHistoryCard } from '../../sales/components/LotSaleHistoryCard';

const AREA_VALIDATION_LABELS: Record<string, string> = {
  VALIDATED: 'Área conferida no croqui oficial',
  CALCULATED: 'Área derivada da malha modular oficial',
  UNVALIDATED: 'Área documental pendente de conferência',
  REJECTED: 'Área rejeitada na conferência',
};

const SEQUENCE_LABELS = {
  'x-increasing': 'Sequência horizontal',
  'x-decreasing': 'Sequência horizontal inversa',
  'z-increasing': 'Sequência vertical',
  'z-decreasing': 'Sequência vertical inversa',
} as const;

interface Props {
  plan: CommercialPavilionModulePlan;
  pavilion: MapEntity;
  entities: MapEntity[];
  lots: CommercialLot[];
  permissions: MapPermissions;
  source: MapSource;
  onSynchronize?: () => void;
  synchronizing?: boolean;
  embedded?: boolean;
}

/** Operational detail card for the neutral module selected inside a pavilion. */
export const PavilionModuleCard = memo(function PavilionModuleCard({
  plan,
  pavilion,
  entities,
  lots,
  permissions,
  source,
  onSynchronize,
  synchronizing = false,
  embedded = false,
}: Props) {
  const selectedModuleId = useCommercialMapStore((state) => state.selectedModuleId);
  const salesModeActive = useSalesStore((state) => state.salesModeActive);
  const setSelectedModuleId = useCommercialMapStore((state) => state.setSelectedModuleId);
  const sheet = useCompactDetailSheet(selectedModuleId);
  const [workflow, setWorkflow] = useState<LotWorkflow>(null);
  const [editingLot, setEditingLot] = useState(false);
  const [availabilityOpen, setAvailabilityOpen] = useState(false);
  const cell = plan.cells.find((candidate) => candidate.id === selectedModuleId) ?? null;
  const zone = cell ? plan.zones.find((candidate) => candidate.id === cell.zoneId) ?? null : null;
  const commercialIndex = useMemo(
    () => buildPavilionModuleCommercialIndex(pavilion, entities, lots),
    [entities, lots, pavilion],
  );
  const record = cell ? commercialIndex.get(cell.id) ?? null : null;
  const lot = record?.lot ?? null;
  const status = lot ? STATUS_CONFIG[lot.status] : null;
  const persisted = source === 'database' && Boolean(lot && !lot.id.startsWith('reference:'));
  const canSetAvailability = Boolean(
    persisted
    && lot
    && ['AVAILABLE', 'BLOCKED', 'UNAVAILABLE'].includes(lot.status)
    && (permissions.canManageLots || permissions.canManageSales),
  );
  const canReserve = Boolean(persisted && lot && permissions.canManageSales && ['AVAILABLE', 'IN_NEGOTIATION'].includes(lot.status));
  const canNegotiate = Boolean(persisted && lot && permissions.canManageSales && ['AVAILABLE', 'RESERVED'].includes(lot.status));
  const canSell = Boolean(persisted && lot && permissions.canManageSales && ['AVAILABLE', 'RESERVED', 'IN_NEGOTIATION'].includes(lot.status));
  const contracts = useLotContractVersions(
    persisted ? lot?.id ?? null : null,
    persisted && permissions.canManageContracts,
  );
  const saleHistory = useLotSaleHistory(persisted ? lot?.id ?? null : null, lot?.status === 'SOLD');

  useLayoutEffect(() => {
    setWorkflow(null);
    setEditingLot(false);
    setAvailabilityOpen(false);
  }, [selectedModuleId]);

  if (!cell) return null;

  // Em modo conectado a ficha reflete a área persistida — o valor de referência
  // não pode mascarar um cadastro ainda sem metragem.
  const individualArea = persisted
    ? lot?.officialAreaSqm ?? null
    : lot?.officialAreaSqm ?? cell.areaM2 ?? null;
  const areaLabel = individualArea == null ? null : formatAreaSqm(individualArea);
  const areaOriginLabel = persisted
    ? AREA_VALIDATION_LABELS[lot?.areaValidationStatus ?? 'UNVALIDATED']
    : cell.areaM2 == null
      ? 'Sem metragem documental'
      : 'Metragem documental (leitura)';
  const areaCaveat = cell.areaCaveat ?? null;
  const pavilionAreaSummary = getPavilionAreaSummary(pavilion.publicIdentifier);
  const sequenceLabel = cell.sequenceOrientation
    ? SEQUENCE_LABELS[cell.sequenceOrientation]
    : 'Sequência do setor';

  return (
    <>
      <aside
        ref={sheet.panelRef}
        className={`commercial-pavilion-module-card${embedded ? ' is-embedded' : ''}`}
        data-sheet-state={sheet.sheetState}
        style={{ '--pavilion-plan-accent': plan.colorCue } as React.CSSProperties}
        aria-label={`Módulo ${cell.label} do Pavilhão ${plan.stats.pavilionNumber}`}
        data-commercial-pavilion-module={cell.id}
      >
        <header>
          <div>
            <strong>Módulo {cell.label}</strong>
            <small>{pavilion.publicIdentifier} · Pavilhão {plan.stats.pavilionNumber}</small>
          </div>
          <button
            type="button"
            onClick={() => setSelectedModuleId(null)}
            aria-label="Fechar detalhes do módulo"
          >
            <X aria-hidden="true" />
          </button>
        </header>

        <div className="commercial-pavilion-module-summary">
          {status ? (
            <div className="commercial-pavilion-module-status"
              style={{ color: status.border, background: status.surface, borderColor: status.color }}>
              <b aria-hidden="true">{status.symbol}</b>
              <strong>{status.label}</strong>
            </div>
          ) : <span>Sem cadastro comercial</span>}
          <span>{areaLabel == null ? 'Área individual não informada' : `${areaLabel} de área individual`}</span>
        </div>
        <CompactDetailSheetControls sheet={sheet} subject="módulo" embedded={embedded} />
        <div className="commercial-pavilion-module-details" hidden={embedded && sheet.sheetState !== 'expanded'}>
        <dl>
          <div>
            <dt>Localização</dt>
            <dd>{zone?.label ?? 'Setor não informado'}</dd>
          </div>
          <div>
            <dt>Disposição</dt>
            <dd>{sequenceLabel}</dd>
          </div>
          <div>
            <dt>Área individual</dt>
            <dd>
              {areaLabel ?? 'Não informada'}
              <small className="commercial-pavilion-module-area-origin">{areaOriginLabel}</small>
              {cell.areaMethod ? (
                <small className="commercial-pavilion-module-area-origin">{cell.areaMethod}</small>
              ) : null}
              {areaCaveat ? (
                <small className="commercial-pavilion-module-area-caveat">
                  Atenção: {areaCaveat}
                </small>
              ) : null}
              {pavilionAreaSummary?.documentalCaveat ? (
                <small className="commercial-pavilion-module-area-origin">
                  Ressalva do pavilhão: {pavilionAreaSummary.documentalCaveat}
                </small>
              ) : null}
            </dd>
          </div>
          <div>
            <dt>Valores oficiais 2028</dt>
            <dd>
              <LotPricing2028Panel lotId={persisted ? lot?.id ?? null : null} officialAreaSqm={individualArea} compact />
              {!persisted ? <small className="commercial-pavilion-module-area-origin">Disponível após sincronizar o cadastro.</small> : null}
            </dd>
          </div>
          <div>
            <dt>Vínculo comercial</dt>
            <dd>{lot?.currentBuyer || 'Sem vínculo'}</dd>
          </div>
          <div>
            <dt>Contrato</dt>
            <dd>{lot?.activeContractNumber || 'Não anexado'}</dd>
          </div>
          <div>
            <dt>Cadastro</dt>
            <dd>{persisted ? 'Persistido e auditável' : 'Referência em leitura'}</dd>
          </div>
        </dl>

        <LotSaleHistoryCard sale={saleHistory.data} loading={saleHistory.isLoading} />

        {persisted && permissions.canManageContracts && (
          <section
            className="commercial-pavilion-module-contracts"
            aria-label="Documentos privados do módulo"
          >
            <strong>Documentos privados</strong>
            {contracts.isLoading && <p>Carregando contratos autorizados…</p>}
            {contracts.isError && <p>Não foi possível gerar o acesso temporário aos contratos.</p>}
            {contracts.data?.length === 0 && <p>Nenhum contrato anexado.</p>}
            {contracts.data?.map((contractVersion) => (
              <a
                href={contractVersion.signedUrl}
                target="_blank"
                rel="noreferrer"
                key={contractVersion.id}
              >
                <FileText aria-hidden="true" />
                <span>
                  <b>{contractVersion.originalName}</b>
                  <small>
                    Versão {contractVersion.version}
                    {contractVersion.supersededAt ? ' · substituído' : ' · ativo'}
                  </small>
                </span>
                <FileLock2 aria-hidden="true" />
              </a>
            ))}
          </section>
        )}

        {cell.source?.discrepancy && (
          <p className="commercial-pavilion-module-note">
            A sequência preserva este número, mas a faixa impressa no anexo requer confirmação oficial futura.
          </p>
        )}

        {persisted && lot ? (
          <div className="commercial-pavilion-module-actions" aria-label="Operações comerciais do módulo">
            {permissions.canManageLots && (
              <Button size="sm" variant="outline" onClick={() => setEditingLot(true)}><PencilLine />Editar</Button>
            )}
            {canSetAvailability && (
              <Button size="sm" variant="outline" onClick={() => setAvailabilityOpen(true)}><ShieldCheck />Situação</Button>
            )}
            {canReserve && (
              <Button size="sm" variant="outline" onClick={() => setWorkflow('reserve')}><CalendarClock />Reservar</Button>
            )}
            {canNegotiate && (
              <Button size="sm" variant="outline" onClick={() => setWorkflow('negotiate')}><Handshake />Negociar</Button>
            )}
            {/* Em modo Vendas o clique no módulo já alterna o carrinho:
                nenhum botão duplicado de venda aparece aqui. */}
            {canSell && !salesModeActive && (
              <Button size="sm" onClick={() => setWorkflow('sell')}><ShoppingBag />Vender</Button>
            )}
            {permissions.canManageContracts && (
              <Button size="sm" variant="outline" onClick={() => setWorkflow('contract')}><FileLock2 />Contrato</Button>
            )}
          </div>
        ) : permissions.isMapAdmin && onSynchronize ? (
          <div className="commercial-pavilion-module-sync">
            <p>Sincronize a revisão para editar situação, cadastro, venda e contrato deste módulo.</p>
            <Button size="sm" onClick={onSynchronize} disabled={synchronizing}>
              <RefreshCw className={synchronizing ? 'animate-spin' : ''} />
              Sincronizar módulos
            </Button>
          </div>
        ) : (
          <p className="commercial-pavilion-module-readonly">Consulta neutra: nenhum expositor foi pré-vinculado.</p>
        )}

        <footer>
          {persisted ? 'Operações protegidas por permissão e histórico' : 'Identificação oficial · consulta de referência'}
        </footer>
        </div>
      </aside>

      {lot && (
        <>
          <LotWorkflowDialog key={`workflow:${lot.id}`} lot={lot} workflow={workflow} onClose={() => setWorkflow(null)} />
          <LotEditDialog key={`edit:${lot.id}`} lot={lot} open={editingLot} onClose={() => setEditingLot(false)} />
          <LotAvailabilityDialog key={`availability:${lot.id}`} lot={lot} open={availabilityOpen} onClose={() => setAvailabilityOpen(false)} />
        </>
      )}
    </>
  );
});
