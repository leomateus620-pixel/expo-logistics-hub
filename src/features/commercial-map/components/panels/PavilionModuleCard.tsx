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
import { Button } from '@/components/ui/button';
import { STATUS_CONFIG } from '../../constants';
import { useLotContractVersions } from '../../hooks/useCommercialMap';
import { useCommercialMapStore } from '../../state/useCommercialMapStore';
import type {
  CommercialLot,
  MapEntity,
  MapPermissions,
  MapSource,
} from '../../types';
import type { CommercialPavilionModulePlan } from '../../utils/commercialPavilionModules';
import { buildPavilionModuleCommercialIndex } from '../../utils/pavilionModuleCommercial';
import { CompactDetailSheetControls } from './CompactDetailSheet';
import { useCompactDetailSheet } from '../../hooks/useCompactDetailSheet';
import { LotAvailabilityDialog } from '../commercial/LotAvailabilityDialog';
import { LotEditDialog } from '../commercial/LotEditDialog';
import { LotWorkflowDialog, type LotWorkflow } from '../commercial/LotWorkflowDialog';

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

  useLayoutEffect(() => {
    setWorkflow(null);
    setEditingLot(false);
    setAvailabilityOpen(false);
  }, [selectedModuleId]);

  if (!cell) return null;

  const individualArea = lot?.officialAreaSqm ?? cell.areaM2 ?? null;
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
          <span>{individualArea == null ? 'Área não informada' : `${individualArea.toLocaleString('pt-BR')} m² de área individual`}</span>
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
            <dd>{individualArea == null ? 'Não informada' : `${individualArea.toLocaleString('pt-BR')} m²`}</dd>
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
            {canSell && (
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
