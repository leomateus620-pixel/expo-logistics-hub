import { useContext, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { List, Settings2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useCommercialMapStore } from '../../state/useCommercialMapStore';

import { CommercialMapHeaderHost } from './headerHost';

/** The workspace owns permissions/actions; the module shell owns their placement. */
export function CommercialMapHeaderTools({ managementActions }: { managementActions?: ReactNode }) {
  const host = useContext(CommercialMapHeaderHost);
  const [managementOpen, setManagementOpen] = useState(false);
  const mode = useCommercialMapStore((state) => state.workspaceMode);
  const panel = useCommercialMapStore((state) => state.activePanel);
  const setMode = useCommercialMapStore((state) => state.setWorkspaceMode);
  const managing = managementOpen || mode === 'edit' || mode === 'create' || panel === 'calibration';
  const content = <div className="commercial-map-header-tools" aria-label="Ferramentas do mapa">
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
