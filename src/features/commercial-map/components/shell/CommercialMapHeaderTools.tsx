import { useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Flame, Footprints, List, Settings2, ShoppingCart } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useCommercialMapStore } from '../../state/useCommercialMapStore';
import { useSalesStore } from '../../sales/useSalesSelection';
import { useVisitStore } from '../../visit/useVisitStore';
import { CommercialMapHeaderHost } from './headerHost';
import './commercial-map-shell.css';

/** The workspace owns permissions/actions; the module shell owns their placement. */
export function CommercialMapHeaderTools({
  managementActions,
  dashboardOpen = false,
  salesAvailable = false,
  visitAvailable = false,
  visitEntityId,
}: { managementActions?: ReactNode; dashboardOpen?: boolean; salesAvailable?: boolean; visitAvailable?: boolean; visitEntityId?: string }) {
  const host = useContext(CommercialMapHeaderHost);
  const [managementOpen, setManagementOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const mode = useCommercialMapStore((state) => state.workspaceMode);
  const panel = useCommercialMapStore((state) => state.activePanel);
  const setMode = useCommercialMapStore((state) => state.setWorkspaceMode);
  const salesActive = useSalesStore((state) => state.salesModeActive);
  const toggleSalesMode = useSalesStore((state) => state.toggleSalesMode);
  const checkoutOpen = useSalesStore((state) => state.checkoutOpen);
  const visitEnabled = useVisitStore((state) => state.enabled);
  const startVisit = useVisitStore((state) => state.start);
  const [cartEntranceSequence, setCartEntranceSequence] = useState(0);
  const previousSalesActive = useRef(salesActive);
  const toolsUnavailable = dashboardOpen || visitEnabled;
  const toolsUnavailableRef = useRef(toolsUnavailable);
  toolsUnavailableRef.current = toolsUnavailable;
  const canStartVisit = !checkoutOpen && (mode === '3d' || mode === 'list');
  const managing = managementOpen || dashboardOpen || mode === 'edit' || mode === 'create'
    || mode === 'list' || panel === 'calibration';

  useEffect(() => {
    if (toolsUnavailable) setManagementOpen(false);
  }, [toolsUnavailable]);

  useLayoutEffect(() => {
    if (contentRef.current) contentRef.current.inert = toolsUnavailable;
  }, [toolsUnavailable]);

  useLayoutEffect(() => {
    // The keyed, decorative icon restarts only on a genuine OFF -> ON change.
    // Unrelated store updates keep the same DOM and never schedule frame work.
    if (salesActive && !previousSalesActive.current) setCartEntranceSequence((sequence) => sequence + 1);
    previousSalesActive.current = salesActive;
  }, [salesActive]);

  const content = <TooltipProvider delayDuration={300}>
    <div
      ref={contentRef}
      className="commercial-map-header-tools"
      role="group"
      aria-label="Ferramentas do mapa"
      aria-hidden={dashboardOpen || undefined}
      hidden={visitEnabled}
      data-commercial-map-full-motion
      style={visitEnabled ? { display: 'none' } : dashboardOpen ? { pointerEvents: 'none' } : undefined}
    >
      {visitAvailable && <Tooltip><TooltipTrigger asChild>
        <button type="button" className="commercial-map-header-visit" aria-label="Modo Visita" disabled={!canStartVisit}
          onClick={() => startVisit()} data-commercial-map-visit-start>
          <Footprints aria-hidden="true" />
        </button>
      </TooltipTrigger><TooltipContent side="bottom">Modo Visita</TooltipContent></Tooltip>}
      {visitAvailable && visitEntityId && <Tooltip><TooltipTrigger asChild>
        <button type="button" className="commercial-map-header-visit commercial-map-header-visit--lot" aria-label="Visitar este lote" disabled={!canStartVisit}
          onClick={() => startVisit({ entityId: visitEntityId })} data-commercial-map-visit-lot>
          <Footprints aria-hidden="true" />
        </button>
      </TooltipTrigger><TooltipContent side="bottom">Visitar este lote</TooltipContent></Tooltip>}
      {salesAvailable && <Tooltip><TooltipTrigger asChild>
        <button
          type="button"
          className={`commercial-map-header-sales ${salesActive ? 'is-active' : ''}`}
          aria-label="Vendas"
          aria-pressed={salesActive}
          onClick={() => { if (!salesActive && mode !== '3d') setMode('3d'); toggleSalesMode(); }}
        >
          <span key={cartEntranceSequence} className="commercial-map-header-sales__motion" data-commercial-map-cart-entrance={cartEntranceSequence} aria-hidden="true">
            <Flame className="commercial-map-header-sales__flame" />
            <ShoppingCart className="commercial-map-header-sales__cart" />
          </span>
          <span className="commercial-map-header-sales__label">Vendas</span>
        </button>
      </TooltipTrigger><TooltipContent side="bottom">{salesActive ? 'Sair do modo Vendas' : 'Abrir modo Vendas'}</TooltipContent></Tooltip>}

      <Popover open={managementOpen && !toolsUnavailable} onOpenChange={(open) => { if (!toolsUnavailable) setManagementOpen(open); }}>
        <Tooltip><TooltipTrigger asChild><PopoverTrigger asChild>
          <button type="button" className={`commercial-map-header-management-trigger ${managing ? 'is-active' : ''}`} aria-label="Gestão" aria-pressed={managing}>
            <Settings2 aria-hidden="true" />
          </button>
        </PopoverTrigger></TooltipTrigger><TooltipContent side="bottom">Gestão do mapa</TooltipContent></Tooltip>
        {!toolsUnavailable && <PopoverContent
          className="commercial-map-header-management"
          align="end"
          data-commercial-map-escape-priority="true"
          data-commercial-map-full-motion
          onCloseAutoFocus={(event) => { if (toolsUnavailableRef.current) event.preventDefault(); }}
        >
          <strong>Gestão do mapa</strong>
          <button
            type="button"
            className={`commercial-map-header-management__list ${mode === 'list' ? 'is-active' : ''}`}
            aria-label="Lista e tabela"
            aria-pressed={mode === 'list'}
            onClick={() => {
              setMode(mode === 'list' ? '3d' : 'list');
              setManagementOpen(false);
            }}
          >
            <List aria-hidden="true" /><span>{mode === 'list' ? 'Voltar ao mapa 3D' : 'Lista e tabela'}</span>
          </button>
          {managementActions && <div className="commercial-map-header-management__actions">{managementActions}</div>}
        </PopoverContent>}
      </Popover>
    </div>
  </TooltipProvider>;
  return host ? createPortal(content, host) : <div className="commercial-map-header-tools-fallback">{content}</div>;
}
