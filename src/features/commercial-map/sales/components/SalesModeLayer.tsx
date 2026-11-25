import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CommercialLot, MapEntity } from '../../types';
import { isSellableLot, toSalesEntry } from '../salesEntry';
import { ShoppingCart, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { useCommercialMapStore } from '../../state/useCommercialMapStore';
import { foodPointQuantityLabel, formatAreaSqmLabel, formatBrl } from '../../utils/lotPricing2028';
import { useSalesEligibility } from '../salesEligibility';
import { useSalesCart } from '../useSalesCheckout';
import { useSalesStore } from '../useSalesSelection';
import { SalesCart, SalesCartContents, SalesStageSwitch } from './SalesCart';
import { SalesCheckoutDialog } from './SalesCheckoutDialog';
import { toast } from '@/hooks/use-toast';
import '../sales-mode.css';

/**
 * Camada do modo Vendas: preset visual leve (só ambientação), carrinho desktop,
 * barra/gaveta mobile e checkout. Nenhuma geometria, área ou cadastro muda aqui,
 * e `reducedGraphics` nunca é acionado — pavilhões mantêm a arquitetura normal.
 */
export function SalesModeLayer({ projectId, operatorId, lots, entities = [], onOpenOrder }: {
  projectId: string | null;
  operatorId?: string;
  lots: readonly CommercialLot[];
  entities?: readonly MapEntity[];
  onOpenOrder?: (orderId: string) => void;
}) {
  const active = useSalesStore((state) => state.salesModeActive);
  const selectionCount = useSalesStore((state) => state.selection.length);
  const checkoutOpen = useSalesStore((state) => state.checkoutOpen);
  const setTreesVisible = useCommercialMapStore((state) => state.setTreesVisible);
  const setNightModeActive = useCommercialMapStore((state) => state.setNightModeActive);
  const setSalesPresentationActive = useCommercialMapStore((state) => state.setSalesPresentationActive);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [availabilityNotices, setAvailabilityNotices] = useState<string[]>([]);
  const owner = projectId && operatorId ? { projectId, operatorId } : null;
  const ownerKey = owner ? `${owner.projectId}:${owner.operatorId}` : null;
  const previousVisuals = useRef<{ trees: boolean; night: boolean } | null>(null);

  const { summary, loading } = useSalesCart(projectId, active);
  const { eligible } = useSalesEligibility(projectId, active);

  useLayoutEffect(() => {
    const store = useSalesStore.getState();
    if (!store.selection.length || !lots.length) return;
    const current = new Map(lots.map((lot) => [lot.id, lot]));
    const unavailable = store.selection.filter(({ lotId }) => {
      const lot = current.get(lotId);
      return !lot || Boolean(lot.archivedAt) || lot.status === 'SOLD' || lot.status === 'SALE_OPEN'
        || (eligible != null && !isSellableLot(lot, eligible));
    });
    if (!unavailable.length) return;
    unavailable.forEach(({ lotId }) => store.removeLot(lotId));
    const notices = unavailable.map(({ publicIdentifier }) => `${publicIdentifier} saiu do carrinho porque deixou de estar disponível para esta venda.`);
    if (store.checkoutOpen) setAvailabilityNotices((previous) => [...new Set([...previous, ...notices])]);
    else toast({ title: 'Carrinho atualizado', description: notices.join(' ') });
  }, [eligible, lots]);

  useLayoutEffect(() => {
    const store = useSalesStore.getState();
    if (!store.selection.length || !entities.length) return;
    const byId = new Map(lots.map(lot => [lot.id, lot]));
    const byEntity = new Map(entities.map(entity => [entity.id, entity]));
    const next = store.selection.map(entry => {
      const lot = byId.get(entry.lotId);
      if (!lot) return entry;
      const entity = byEntity.get(lot.entityId);
      if (!entity) return entry;
      const parent = entity?.parentEntityId ? byEntity.get(entity.parentEntityId) : null;
      return toSalesEntry(lot, null, entity, parent);
    });
    if (next.some((entry, index) => JSON.stringify(entry) !== JSON.stringify(store.selection[index]))) {
      useSalesStore.setState({ selection: next });
    }
  }, [entities, lots]);

  // Ambientação decorativa some enquanto o modo Vendas está ativo e volta ao sair.
  useEffect(() => {
    if (!active) return undefined;
    const store = useCommercialMapStore.getState();
    previousVisuals.current = { trees: store.treesVisible, night: store.nightModeActive };
    setSalesPresentationActive(true);
    setTreesVisible(false);
    setNightModeActive(false);
    return () => {
      setSalesPresentationActive(false);
      const snapshot = previousVisuals.current;
      if (!snapshot) return;
      setTreesVisible(snapshot.trees);
      setNightModeActive(snapshot.night);
      previousVisuals.current = null;
    };
  }, [active, setNightModeActive, setSalesPresentationActive, setTreesVisible]);

  useEffect(() => {
    if (!active || checkoutOpen) setSheetOpen(false);
    if (!checkoutOpen) setAvailabilityNotices([]);
  }, [active, checkoutOpen]);

  if (!active) return null;

  return (
    <>
      <SalesCart summary={summary} loading={loading} />

      <button type="button" className="sales-mobile-bar" onClick={() => setSheetOpen(true)}>
        <ShoppingCart aria-hidden="true" />
        <span>
          <strong>{selectionCount} espaço{selectionCount === 1 ? '' : 's'}</strong>
          <small>
            {loading
              ? 'Calculando…'
              : [
                summary.foodPointCount > 0 ? foodPointQuantityLabel(summary.foodPointCount) : null,
                summary.areaTotal > 0 ? formatAreaSqmLabel(summary.areaTotal) : null,
                formatBrl(summary.valueTotal),
              ].filter(Boolean).join(' · ')}
          </small>
        </span>
        <span className="sales-mobile-bar__cta">Ver venda</span>
      </button>

      <Drawer open={sheetOpen} onOpenChange={setSheetOpen} shouldScaleBackground={false}>
        <DrawerContent className="sales-cart-drawer max-h-[80dvh] bg-card backdrop-blur-none">
          <DrawerHeader className="sales-cart-drawer__header">
            <DrawerTitle>Venda de espaços</DrawerTitle>
            <DrawerDescription className="sr-only">Etapa de valores, espaços selecionados e total da venda.</DrawerDescription>
            <DrawerClose asChild>
              <Button type="button" variant="ghost" size="icon" aria-label="Fechar carrinho"><X aria-hidden="true" /></Button>
            </DrawerClose>
          </DrawerHeader>
          <div className="sales-sheet-body px-4 pb-6">
            <SalesStageSwitch />
            <SalesCartContents summary={summary} loading={loading} />
            <Button
              type="button"
              variant="ghost"
              className="h-9 w-full rounded-xl"
              onClick={() => { setSheetOpen(false); useSalesStore.getState().closeSalesMode(); }}
            >
              Sair do modo Vendas
            </Button>
          </div>
        </DrawerContent>
      </Drawer>

      {owner && onOpenOrder && <SalesCheckoutDialog key={ownerKey} owner={owner} summary={summary}
        availabilityNotices={availabilityNotices} onOpenOrder={onOpenOrder} />}
    </>
  );
}
