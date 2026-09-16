import { useEffect, useRef, useState } from 'react';
import { ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { useCommercialMapStore } from '../../state/useCommercialMapStore';
import { formatBrl } from '../../utils/lotPricing2028';
import type { CommercialLot } from '../../types';
import { isSellableLot, toSalesEntry } from '../salesEntry';
import { useSalesCart } from '../useSalesCheckout';
import { useSalesStore } from '../useSalesSelection';
import { SalesCart, SalesCartContents, SalesStageSwitch } from './SalesCart';
import { SalesCheckoutDialog } from './SalesCheckoutDialog';
import '../sales-mode.css';

/**
 * Camada do modo Vendas: ambientação leve, carrinho desktop, barra/gaveta mobile
 * e checkout. Nenhuma geometria, área ou cadastro é alterado aqui.
 */
export function SalesModeLayer({ lots }: { lots: CommercialLot[] }) {
  const active = useSalesStore((state) => state.salesModeActive);
  const addLot = useSalesStore((state) => state.addLot);
  const selectionCount = useSalesStore((state) => state.selection.length);
  const selectedEntityId = useCommercialMapStore((state) => state.selectedEntityId);
  const setTreesVisible = useCommercialMapStore((state) => state.setTreesVisible);
  const setReducedGraphics = useCommercialMapStore((state) => state.setReducedGraphics);
  const setNightModeActive = useCommercialMapStore((state) => state.setNightModeActive);
  const [sheetOpen, setSheetOpen] = useState(false);
  const previousVisuals = useRef<{ trees: boolean; reduced: boolean; night: boolean } | null>(null);

  const { summary, loading } = useSalesCart();

  // Ambientação pesada some enquanto o modo Vendas está ativo e volta ao sair.
  useEffect(() => {
    if (!active) return undefined;
    const store = useCommercialMapStore.getState();
    previousVisuals.current = {
      trees: store.treesVisible,
      reduced: store.reducedGraphics,
      night: store.nightModeActive,
    };
    setTreesVisible(false);
    setReducedGraphics(true);
    setNightModeActive(false);
    return () => {
      const snapshot = previousVisuals.current;
      if (!snapshot) return;
      setTreesVisible(snapshot.trees);
      setReducedGraphics(snapshot.reduced);
      setNightModeActive(snapshot.night);
      previousVisuals.current = null;
    };
  }, [active, setNightModeActive, setReducedGraphics, setTreesVisible]);

  // Tocar num espaço externo vendável já o inclui na venda.
  useEffect(() => {
    if (!active || !selectedEntityId) return;
    const lot = lots.find((candidate) => candidate.entityId === selectedEntityId);
    if (lot && isSellableLot(lot)) addLot(toSalesEntry(lot));
  }, [active, addLot, lots, selectedEntityId]);

  useEffect(() => {
    if (!active) setSheetOpen(false);
  }, [active]);

  if (!active) return null;

  return (
    <>
      <SalesCart summary={summary} loading={loading} />

      <button type="button" className="sales-mobile-bar" onClick={() => setSheetOpen(true)}>
        <ShoppingCart aria-hidden="true" />
        <span>
          <strong>{selectionCount} espaço{selectionCount === 1 ? '' : 's'}</strong>
          <small>{loading ? 'Calculando…' : formatBrl(summary.valueTotal) ?? 'R$ 0,00'}</small>
        </span>
        <span className="text-xs font-semibold uppercase">Ver venda</span>
      </button>

      <Drawer open={sheetOpen} onOpenChange={setSheetOpen}>
        <DrawerContent className="max-h-[88dvh]">
          <DrawerHeader className="pb-2">
            <DrawerTitle>Venda de espaços</DrawerTitle>
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

      <SalesCheckoutDialog summary={summary} />
    </>
  );
}
