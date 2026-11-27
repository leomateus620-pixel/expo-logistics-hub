import { useEffect, useLayoutEffect, useRef, useState, type SyntheticEvent } from 'react';
import { ArrowLeft, BookOpen, ChevronDown, DoorOpen, FileLock2, Paperclip, Pencil, ShoppingCart, Utensils, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { STATUS_CONFIG } from '../../constants';
import { getHistoryIdForEntity } from '../../history/bindings';
import { HistoryExperience } from '../../history/HistoryExperience';
import { useCompactDetailSheet } from '../../hooks/useCompactDetailSheet';
import { useLotContractHistory } from '../../hooks/useCommercialMap';
import type { SaleContractVersion } from '../../dashboard/salesOrders/salesOrdersService';
import { isSellableLot, toSalesEntry } from '../../sales/salesEntry';
import { formatCents, toCents } from '../../sales/salesMoney';
import { fetchFoodPointSaleSnapshot } from '../../sales/salesService';
import { SALES_STAGE_LABELS } from '../../sales/salesTypes';
import { useSalesStore } from '../../sales/useSalesSelection';
import { SaleOpenSection } from '../../sales/components/SaleOpenSection';
import type { LotContractHistoryDocument } from '../../services/commercialMapService';
import { useSaleInspectionStore } from '../../state/useSaleInspectionStore';
import { toCommercialPhase, type CommercialLot, type CommercialMapData, type MapEntity, type MapPermissions } from '../../types';
import { FENASOJA_RESTAURANT_PRESENTATION_NAME } from '../../utils/fenasojaRestaurant';
import { formatBrl, stageTotal } from '../../utils/lotPricing2028';
import { LotContractFileButton } from '../commercial/LotContractFileButton';
import { LotWorkflowDialog } from '../commercial/LotWorkflowDialog';
import { CompactDetailSheetControls } from './CompactDetailSheet';
import { LotActivityList } from './LotActivityList';
import './gastronomy-structure-panel.css';
import { PACKAGE_RECONCILIATION_LABEL, STALLONNE_INCLUDED_LABEL } from '../../utils/commercialPackage';

type PointPermissions = Pick<MapPermissions, 'canManageSales' | 'canManageContracts'>;

function stopMapGesture(event: SyntheticEvent) {
  event.stopPropagation();
}

export function GastronomyStructurePanel({ structure, points, selectedPointId, canSell, permissions, mapData, onEnterInterior, onOpenPackage, onClose }: {
  structure: MapEntity;
  points: readonly { entity: MapEntity; lot: CommercialLot }[];
  selectedPointId?: string;
  canSell: boolean;
  permissions: PointPermissions;
  mapData: Pick<CommercialMapData, 'lots' | 'entities'>;
  onEnterInterior?: () => void;
  onOpenPackage?: (entityId: string) => void;
  onClose: () => void;
}) {
  const inspection = useSaleInspectionStore((state) => state.context);
  const inspectedSalePoint = useSaleInspectionStore((state) => state.focusedFoodLotId);
  const stage = useSalesStore((state) => state.stage);
  const salesMode = useSalesStore((state) => state.salesModeActive);
  const cart = useSalesStore((state) => state.selection);
  const eligible = useSalesStore((state) => state.eligibleLotIds);
  const addLot = useSalesStore((state) => state.addLot);
  const [draft, setDraft] = useState<ReadonlySet<string>>(() => new Set());
  const requestedPoint = selectedPointId ?? inspectedSalePoint;
  const [inspectedPoint, setInspectedPoint] = useState(requestedPoint);
  const requestedPointRow = useRef<HTMLLIElement>(null);
  const historyId = getHistoryIdForEntity(structure);
  const [historyOpen, setHistoryOpen] = useState(false);
  const historyTrigger = useRef<HTMLButtonElement>(null);
  const opener = useRef(document.activeElement instanceof HTMLElement ? document.activeElement : null);
  const sheet = useCompactDetailSheet(structure.id, true);
  const { setSheetState } = sheet;
  const selling = salesMode && canSell && !inspection;
  const standalonePoints = points.filter(({ lot }) => lot.commercialPackageRole !== 'COMPONENT');
  const canSelectPoints = selling && standalonePoints.length > 0;
  const name = structure.publicIdentifier === 'C2' ? FENASOJA_RESTAURANT_PRESENTATION_NAME : structure.name;
  const pricedPoints = points.map((point) => ({
    ...point,
    price: point.lot.commercialPackageRole !== 'COMPONENT' && point.lot.officialPricing2028
      ? stageTotal(point.lot.officialPricing2028, stage) : null,
    inCart: cart.some(({ lotId }) => lotId === point.lot.id),
  }));
  const selected = pricedPoints.filter(({ lot, price, inCart }) => draft.has(lot.id)
    && !inCart && price != null && price > 0 && lot.status === 'AVAILABLE' && isSellableLot(lot, eligible));
  const subtotal = selected.reduce((sum, { price }) => sum + toCents(price ?? 0), 0);
  const available = standalonePoints.filter(({ lot }) => lot.status === 'AVAILABLE').length;
  const saleOpen = standalonePoints.filter(({ lot }) => lot.status === 'SALE_OPEN').length;
  const sold = standalonePoints.filter(({ lot }) => lot.status === 'SOLD').length;
  const other = standalonePoints.length - available - saleOpen - sold;
  const counts = [
    { status: 'AVAILABLE', count: available, label: available === 1 ? 'disponível' : 'disponíveis' },
    { status: 'SALE_OPEN', count: saleOpen, label: 'em aberto' },
    { status: 'SOLD', count: sold, label: sold === 1 ? 'vendido' : 'vendidos' },
    { status: 'BLOCKED', count: other, label: other === 1 ? 'bloqueado' : 'bloqueados' },
  ] as const;

  useLayoutEffect(() => {
    setInspectedPoint(requestedPoint);
    if (!requestedPoint) return;
    setHistoryOpen(false);
    setSheetState((current) => current === 'collapsed' ? 'half' : current);
  }, [requestedPoint, setSheetState]);

  useEffect(() => {
    if (inspectedPoint === requestedPoint && requestedPoint) {
      requestedPointRow.current?.scrollIntoView?.({ block: 'nearest' });
    }
  }, [inspectedPoint, requestedPoint]);

  function addSelected() {
    selected.forEach(({ lot, entity }) => addLot(toSalesEntry(lot, null, entity, structure)));
    setDraft(new Set());
  }

  function close() {
    if (inspection) useSaleInspectionStore.getState().focusFoodPoint(null);
    onClose();
    requestAnimationFrame(() => {
      if (opener.current?.isConnected) opener.current.focus({ preventScroll: true });
    });
  }

  function closeHistory() {
    setHistoryOpen(false);
    requestAnimationFrame(() => historyTrigger.current?.focus({ preventScroll: true }));
  }

  return (
    <aside ref={sheet.panelRef}
      className={`commercial-map-panel commercial-map-details-panel gastronomy-panel${selling ? ' is-selling' : ''}`}
      data-sheet-state={sheet.sheetState}
      data-history-open={historyOpen}
      aria-label={`Pontos de alimentação em ${name}`}
      onPointerDown={stopMapGesture} onPointerMove={stopMapGesture} onPointerUp={stopMapGesture}
      onTouchStart={stopMapGesture} onTouchMove={stopMapGesture} onTouchEnd={stopMapGesture} onWheel={stopMapGesture}>
      {historyOpen && historyId && <>
        <div className="fenasoja-history-sheet-controls"><CompactDetailSheetControls sheet={sheet} subject="estrutura" /></div>
        <HistoryExperience historyId={historyId} onClose={closeHistory} />
      </>}
      <div className="commercial-map-commercial-view" hidden={historyOpen}>
        <div className="commercial-map-panel-header">
          <div><span className="gastronomy-panel__identity"><Utensils aria-hidden="true" /> Gastronomia · {structure.publicIdentifier}</span>
            <h2>{name}</h2></div>
          <button type="button" aria-label={inspection ? 'Voltar à venda' : 'Fechar painel'} onClick={close}>
            {inspection ? <ArrowLeft className="h-4 w-4" /> : <X className="h-4 w-4" />}
          </button>
        </div>
        {historyId && <Button ref={historyTrigger} type="button" variant="outline" className="commercial-map-history-trigger"
          onClick={() => setHistoryOpen(true)}><BookOpen aria-hidden="true" />Conhecer a história</Button>}
        <CompactDetailSheetControls sheet={sheet} subject="estrutura">
          {onEnterInterior && !inspection && <Button type="button" variant="outline" onClick={onEnterInterior}
            data-commercial-map-interior-trigger={structure.id}><DoorOpen />Ver interior</Button>}
        </CompactDetailSheetControls>
        <div className="commercial-map-panel-scroll gastronomy-panel__body">
          <h3>{points.length} {points.length === 1 ? 'ponto de alimentação' : 'pontos de alimentação'}</h3>
          {standalonePoints.length > 0 && <><div className="gastronomy-panel__distribution" aria-hidden="true">
            {counts.filter(({ count }) => count > 0).map(({ status, count }) => (
              <span key={status} data-status={status} style={{ flexGrow: count }} />
            ))}
          </div>
          <div className="gastronomy-panel__counts" aria-label="Situação dos pontos">
            {counts.filter(({ status, count }) => status !== 'BLOCKED' || count > 0).map(({ status, count, label }) => (
              <span key={status} data-status={status}>{count} {label}</span>
            ))}
          </div></>}
          <ul className="gastronomy-panel__list">
            {pricedPoints.map(({ lot, price, inCart }) => {
              const status = STATUS_CONFIG[toCommercialPhase(lot.status)];
              const included = lot.commercialPackageRole === 'COMPONENT';
              const principal = included ? mapData.lots.find((candidate) => candidate.id === lot.commercialPackagePrincipalLotId
                && candidate.commercialPackageRole === 'PRINCIPAL' && !candidate.archivedAt) : null;
              const selectable = canSelectPoints && !included && !inCart && lot.status === 'AVAILABLE' && isSellableLot(lot, eligible)
                && price != null && price > 0;
              const expanded = inspectedPoint === lot.id;
              return <li key={lot.id} ref={lot.id === requestedPoint ? requestedPointRow : undefined}
                data-inspected={expanded || inspection?.lotIds.includes(lot.id) || undefined}>
                <div className="gastronomy-panel__row">
                  {canSelectPoints && !included && <label className="gastronomy-panel__checkbox"><input type="checkbox" aria-label={`Selecionar ${lot.displayName}`}
                    checked={inCart || (selectable && draft.has(lot.id))} disabled={!selectable}
                    onChange={(event) => {
                      const checked = event.currentTarget.checked;
                      setDraft((current) => {
                        const next = new Set(current);
                        if (checked) next.add(lot.id); else next.delete(lot.id);
                        return next;
                      });
                    }} /></label>}
                  <button type="button" className="gastronomy-panel__point-button" aria-expanded={expanded}
                    aria-controls={`food-point-${lot.id}`} onClick={() => setInspectedPoint(expanded ? null : lot.id)}>
                    <span className="gastronomy-panel__point">
                      <strong>{lot.displayName}</strong>
                      {lot.foodType && <small>{lot.foodType}</small>}
                      {included && <span className="gastronomy-panel__status gastronomy-panel__package-badge">{STALLONNE_INCLUDED_LABEL}</span>}
                      <span className="gastronomy-panel__status" style={{ background: status.surface, color: status.border }}>
                        {included ? `Parque · ${lot.commercialPackageReconciliationPending ? PACKAGE_RECONCILIATION_LABEL : status.label}`
                          : inCart ? 'No carrinho' : status.label}
                      </span>
                    </span>
                    {!included && <span className="gastronomy-panel__price">
                      <strong>{formatBrl(price) ?? 'Preço pendente'}</strong>
                      {price != null && <small>Tabela · {SALES_STAGE_LABELS[stage]}</small>}
                    </span>}
                    <ChevronDown aria-hidden="true" />
                  </button>
                </div>
                <div id={`food-point-${lot.id}`} hidden={!expanded} className="gastronomy-panel__point-detail">
                  {expanded && (included ? <>
                    <dl><div><dt>Identificador</dt><dd>{lot.publicIdentifier}</dd></div></dl>
                    {principal && onOpenPackage && <Button type="button" size="sm" variant="outline" className="gastronomy-panel__package-action"
                      onClick={() => onOpenPackage(principal.entityId)}>Ver ficha comercial do parque</Button>}
                  </> : <>
                    <dl>
                      <div><dt>Identificador</dt><dd>{lot.publicIdentifier}</dd></div>
                      <div><dt>Unidade comercial</dt><dd>1 ponto de alimentação</dd></div>
                      {lot.currentBuyer && <div><dt>Expositor</dt><dd>{lot.currentBuyer}</dd></div>}
                    </dl>
                    {(lot.status === 'SALE_OPEN' || lot.status === 'SOLD') && !lot.id.startsWith('reference:') && <FoodPointSaleFacts lot={lot} canManageSales={permissions.canManageSales} />}
                    {canSell && lot.status === 'SALE_OPEN' && <SaleOpenSection lotId={lot.id} canManageSales mapData={mapData} />}
                    {(permissions.canManageContracts || permissions.canManageSales) && !lot.id.startsWith('reference:') && !lot.archivedAt
                      ? <GastronomyPointContracts lot={lot} structureName={name} permissions={permissions} />
                      : (lot.status === 'SALE_OPEN' || lot.status === 'SOLD') && <p className="gastronomy-panel__contract-status">Documentos restritos</p>}
                  </>)}
                </div>
              </li>;
            })}
          </ul>
        </div>
        {canSelectPoints && <footer className="gastronomy-panel__actions">
          <span aria-live="polite"><small>{selected.length > 0 ? `${selected.length} ${selected.length === 1 ? 'ponto selecionado' : 'pontos selecionados'}` : 'Subtotal de tabela'}</small>
            <strong>{formatCents(subtotal)}</strong></span>
          <Button type="button" disabled={!selected.length} onClick={addSelected}><ShoppingCart />Adicionar à venda</Button>
        </footer>}
      </div>
    </aside>
  );
}

function FoodPointSaleFacts({ lot, canManageSales }: { lot: CommercialLot; canManageSales: boolean }) {
  const { user } = useAuth();
  const snapshot = useQuery({
    queryKey: ['commercial-map', 'food-point-sale', lot.id, user?.id, canManageSales],
    queryFn: () => fetchFoodPointSaleSnapshot(lot.id),
    enabled: Boolean(user),
    retry: false,
  });
  if (!snapshot.data) return null;
  const { signatureState, negotiatedValue, orderFees } = snapshot.data;
  return <>
    {lot.status === 'SOLD' && <p className="gastronomy-panel__contract-status">
      {signatureState === 'SIGNED' ? 'Vendido · assinatura confirmada'
        : signatureState === 'LEGACY_UNVERIFIED' ? 'Vendido · assinatura sem verificação' : 'Vendido'}
    </p>}
    {canManageSales && (negotiatedValue != null || orderFees != null) && <dl>
      {negotiatedValue != null && <div><dt>Valor negociado deste ponto</dt><dd>{formatBrl(negotiatedValue)}</dd></div>}
      {orderFees != null && <div><dt>Taxas do pedido</dt><dd>{formatBrl(orderFees)}</dd></div>}
    </dl>}
  </>;
}

const contractDateTime = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo',
});

type ContractAction = { mode: 'upload' | 'metadata'; document?: LotContractHistoryDocument };
type ContractTarget = ContractAction & { saleId: string; orderId: string | null };

function contractSaleReference(document: LotContractHistoryDocument) {
  if (document.orderId) return `PV-${document.orderId.slice(0, 8).toUpperCase()}`;
  if (document.saleId) return `LG-${document.saleId.slice(0, 8).toUpperCase()}`;
  return 'Venda de origem não identificada';
}

function versionAuthor(version: SaleContractVersion) {
  return version.uploadedByName || (version.uploadedBy ? 'Nome do responsável indisponível' : 'Autoria não registrada');
}

function GastronomyPointContracts({ lot, structureName, permissions }: {
  lot: CommercialLot;
  structureName: string;
  permissions: PointPermissions;
}) {
  const contractHistory = useLotContractHistory(lot.id);
  const [action, setAction] = useState<ContractTarget | null>(null);
  const actionTrigger = useRef<HTMLButtonElement | null>(null);
  const data = contractHistory.data;
  const accessible = permissions.canManageContracts && Boolean(data?.documentsAccessible);
  const canUpload = accessible && Boolean(data?.canUpload && data.saleId);
  const documents = accessible ? data?.contracts ?? [] : [];
  const current = documents.filter((contract) => contract.isCurrent);
  const history = documents.filter((contract) => !contract.isCurrent || contract.versions.some((version) => version.version !== contract.activeVersion));
  const showActivity = Boolean(data?.canViewHistory);

  function openAction(next: ContractAction, trigger: HTMLButtonElement) {
    if (!canUpload || !data?.saleId) return;
    actionTrigger.current = trigger;
    setAction({ ...next, saleId: data.saleId, orderId: data.orderId });
  }

  function closeAction() {
    setAction(null);
    requestAnimationFrame(() => {
      if (actionTrigger.current?.isConnected) actionTrigger.current.focus({ preventScroll: true });
    });
  }

  if (contractHistory.isLoading) return <p className="gastronomy-panel__contract-status" role="status">
    {permissions.canManageContracts ? 'Carregando documentos autorizados…' : 'Carregando histórico…'}
  </p>;
  if (contractHistory.isError) return <div className="gastronomy-panel__contract-status" role="alert">
    <p>{permissions.canManageContracts ? 'Não foi possível carregar os contratos deste ponto.' : 'Não foi possível carregar o histórico deste ponto.'}</p>
    <Button type="button" variant="outline" size="sm" onClick={() => { void contractHistory.refetch(); }} disabled={contractHistory.isFetching}>Tentar novamente</Button>
  </div>;

  return <>
    {!accessible && (lot.status === 'SALE_OPEN' || lot.status === 'SOLD') &&
      <p className="gastronomy-panel__contract-status">Documentos restritos</p>}
    {accessible && (data?.saleId || current.length > 0) && <section className="gastronomy-panel__contracts" aria-label="Contratos do ponto">
      <h4><FileLock2 aria-hidden="true" />Contratos do ponto</h4>
      {current.length === 0 && <p>Sem arquivo anexado</p>}
      {current.map((contract) => {
        const version = contract.versions.find((version) => version.version === contract.activeVersion);
        return <article className="gastronomy-panel__contract" key={contract.contractId}>
          <div className="gastronomy-panel__contract-name">
            <strong>{version?.originalName ?? 'Arquivo indisponível'}</strong>
            <span>{contract.scope === 'LOT' ? 'Contrato individual' : 'Documento da venda'} · {contractSaleReference(contract)}</span>
            {contract.contractNumber && <span>Contrato {contract.contractNumber}</span>}
            {version && <>
              <span>Versão {version.version} · {contractDateTime.format(new Date(version.uploadedAt))}</span>
              <span>{versionAuthor(version)}</span>
            </>}
          </div>
          <div className="gastronomy-panel__contract-actions">
            {version && <LotContractFileButton version={version} className="gastronomy-panel__contract-open">Abrir contrato</LotContractFileButton>}
            {canUpload && <>
              <Button type="button" variant="outline" size="sm" onClick={(event) => openAction({ mode: 'upload', document: contract }, event.currentTarget)}>
                Substituir contrato
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={(event) => openAction({ mode: 'metadata', document: contract }, event.currentTarget)}>
                <Pencil aria-hidden="true" />Editar dados do contrato
              </Button>
            </>}
          </div>
        </article>;
      })}
      {canUpload && !current.some((contract) => contract.scope === 'LOT') && (
        <Button type="button" size="sm" onClick={(event) => openAction({ mode: 'upload' }, event.currentTarget)}>
          <Paperclip aria-hidden="true" />Anexar contrato
        </Button>
      )}
    </section>}

    {(showActivity || history.length > 0) && <details className="gastronomy-panel__contract-history">
      <summary>Histórico de contratos</summary>
      {history.map((contract) => {
        const versions = contract.versions.filter((version) => !contract.isCurrent || version.version !== contract.activeVersion);
        return <article className="gastronomy-panel__contract" key={contract.contractId}>
          <div className="gastronomy-panel__contract-name">
            <strong>{contractSaleReference(contract)}</strong>
            <span>{contract.scope === 'LOT' ? 'Contrato individual' : 'Documento da venda'}</span>
          </div>
          {versions.map((version) => <div className="gastronomy-panel__contract-version" key={version.id}>
            <strong>{version.originalName}</strong>
            <span>Versão {version.version} · {contractDateTime.format(new Date(version.uploadedAt))}</span>
            <span>{versionAuthor(version)}</span>
            <LotContractFileButton version={version} className="gastronomy-panel__contract-open">Abrir contrato</LotContractFileButton>
          </div>)}
        </article>;
      })}
      {showActivity && <div className="commercial-map-activity"><LotActivityList items={data?.history} loading={false} showActor /></div>}
    </details>}

    {action && canUpload && action.saleId === data?.saleId && action.orderId === data.orderId && <LotWorkflowDialog
      key={`${lot.id}:${action.saleId}:${action.document?.contractId ?? 'new'}:${action.mode}`}
      lot={lot}
      workflow="contract"
      contractTarget={{ structureName, ...action }}
      onClose={closeAction}
    />}
  </>;
}
