import { useEffect, useRef, useState } from 'react';
import { ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { useCommercialMapStore } from '../../state/useCommercialMapStore';
import { formatAreaSqmLabel, formatBrl } from '../../utils/lotPricing2028';
import { useSalesEligibility } from '../salesEligibility';
import { useSalesCart } from '../useSalesCheckout';
import { useSalesStore } from '../useSalesSelection';
import { SalesCart, SalesCartContents, SalesStageSwitch } from './SalesCart';
import { SalesCheckoutDialog } from './SalesCheckoutDialog';
import '../sales-mode.css';

/**
 * Camada do modo Vendas: preset visual leve (só ambientação), carrinho desktop,
 * barra/gaveta mobile e checkout. Nenhuma geometria, área ou cadastro muda aqui,
 * e `reducedGraphics` nunca é acionado — pavilhões mantêm a arquitetura normal.
 */
export function SalesModeLayer({ projectId }: { projectId: string | null }) {
  const active = useSalesStore((state) => state.salesModeActive);
  const selectionCount = useSalesStore((state) => state.selection.length);
  const checkoutOpen = useSalesStore((state) => state.checkoutOpen);
  const setTreesVisible = useCommercialMapStore((state) => state.setTreesVisible);
  const setNightModeActive = useCommercialMapStore((state) => state.setNightModeActive);
  const setSalesPresentationActive = useCommercialMapStore((state) => state.setSalesPresentationActive);
  const [sheetOpen, setSheetOpen] = useState(false);
  const previousVisuals = useRef<{ trees: boolean; night: boolean } | null>(null);

  const { summary, loading } = useSalesCart();
  useSalesEligibility(projectId, active);

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
          <small>
            {loading
              ? 'Calculando…'
              : `${formatAreaSqmLabel(summary.areaTotal)} · ${formatBrl(summary.valueTotal) ?? 'R$ 0,00'}`}
          </small>
        </span>
        <span className="sales-mobile-bar__cta">Ver venda</span>
      </button>

      <Drawer open={sheetOpen} onOpenChange={setSheetOpen}>
        <DrawerContent className="max-h-[80dvh]">
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

      {/* Checkout só existe quando há seleção válida. */}
      {checkoutOpen && summary.ready && <SalesCheckoutDialog summary={summary} />}
    </>
  );
}
