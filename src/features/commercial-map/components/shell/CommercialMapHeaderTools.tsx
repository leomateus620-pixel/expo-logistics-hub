import { useContext, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { List, Settings2, ShoppingCart } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useCommercialMapStore } from '../../state/useCommercialMapStore';
import { useSalesStore } from '../../sales/useSalesSelection';

import { CommercialMapHeaderHost } from './headerHost';

/** The workspace owns permissions/actions; the module shell owns their placement. */
export function CommercialMapHeaderTools({
  managementActions,
  salesAvailable = false,
}: { managementActions?: ReactNode; salesAvailable?: boolean }) {
  const host = useContext(CommercialMapHeaderHost);
  const [managementOpen, setManagementOpen] = useState(false);
  const mode = useCommercialMapStore((state) => state.workspaceMode);
  const panel = useCommercialMapStore((state) => state.activePanel);
  const setMode = useCommercialMapStore((state) => state.setWorkspaceMode);
  const salesActive = useSalesStore((state) => state.salesModeActive);
  const toggleSalesMode = useSalesStore((state) => state.toggleSalesMode);
  const managing = managementOpen || mode === 'edit' || mode === 'create' || panel === 'calibration';
  const content = <div className="commercial-map-header-tools" aria-label="Ferramentas do mapa">
    {salesAvailable && <button
      type="button"
      className={salesActive ? 'is-active' : ''}
      aria-label="Vendas"
      aria-pressed={salesActive}
      onClick={() => { if (!salesActive && mode !== '3d') setMode('3d'); toggleSalesMode(); }}
    >
      <ShoppingCart aria-hidden="true" /><span>Vendas</span>
    </button>}
    {managementActions && <Popover open={managementOpen} onOpenChange={setManagementOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={managing ? 'is-active' : ''} aria-label="Gestão" aria-pressed={managing}>
          <Settings2 aria-hidden="true" /><span>Gestão</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="commercial-map-header-management" align="end" data-commercial-map-escape-priority="true">
        <strong>Gestão do mapa</strong>
        {managementActions}
      </PopoverContent>
    </Popover>}
    <button type="button" className={mode === 'list' ? 'is-active' : ''} aria-label="Lista e tabela"
      aria-pressed={mode === 'list'} onClick={() => setMode(mode === 'list' ? '3d' : 'list')}>
      <List aria-hidden="true" /><span>Lista e tabela</span>
    </button>
  </div>;
  return host ? createPortal(content, host) : <div className="commercial-map-header-tools-fallback">{content}</div>;
}
