import { useEffect, useRef } from 'react';
import { ArrowLeft, ArrowUpRight, Building2, Crosshair, MapPinned, X } from 'lucide-react';
import { useSaleInspectionStore } from '../../state/useSaleInspectionStore';
import type { SaleInspectionGroup, SaleInspectionResolution, SaleInspectionSpace } from '../../utils/saleInspectionGroups';
import './sale-inspection.css';

export function SaleInspectionPanel({ resolution, interiorEntityId, onOverview, onEnterGroup, onSpace, onBack, onClose }: {
  resolution: SaleInspectionResolution;
  interiorEntityId: string | null;
  onOverview: () => void;
  onEnterGroup: (group: SaleInspectionGroup) => void;
  onSpace: (group: SaleInspectionGroup, space: SaleInspectionSpace) => void;
  onBack: () => void;
  onClose: () => void;
}) {
  const context = useSaleInspectionStore((state) => state.context);
  const panelRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const notify = () => window.dispatchEvent(new Event('commercial-map-panel-resize'));
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(notify);
    if (panelRef.current) observer?.observe(panelRef.current);
    notify();
    return () => { observer?.disconnect(); notify(); };
  }, []);
  if (!context) return null;
  const found = resolution.allLotIds.length;
  return <aside ref={panelRef} className="sale-inspection-panel" aria-label="Venda selecionada" data-commercial-map-camera-obstruction="sale-inspection">
    <header className="sale-inspection-heading">
      <div>
        <span className="sale-inspection-eyebrow">Venda selecionada</span>
        <strong>{context.displayName}</strong>
        <span className="sale-inspection-reference">{context.reference}</span>
      </div>
      <button className="sale-inspection-close" type="button" aria-label="Encerrar inspeção da venda" onClick={onClose}><X aria-hidden="true" /></button>
    </header>
    <div className="sale-inspection-body">
      <p className="sale-inspection-summary"><strong>{found} {found === 1 ? 'espaço localizado' : 'espaços localizados'}</strong><span>Contorno ciano no mapa</span></p>
      {resolution.missing.length > 0 && <p className="sale-inspection-warning" role="status">
        <strong>{resolution.missing.length} {resolution.missing.length === 1 ? 'espaço não localizado' : 'espaços não localizados'}</strong>
        <span>{resolution.missing.join(', ')}</span></p>}
      <ul className="sale-inspection-groups">
      {resolution.groups.map((group) => {
        const active = group.kind === 'pavilion' ? interiorEntityId === group.pavilionEntityId : !interiorEntityId;
        return <li key={group.key} className={active ? 'is-active' : ''}>
          <div className="sale-inspection-group-head">
            <div>{group.kind === 'pavilion' ? <Building2 aria-hidden="true" /> : <MapPinned aria-hidden="true" />}<strong>{group.title}</strong></div>
            <button type="button" aria-label={`Enquadrar ${group.title}`} onClick={() => onEnterGroup(group)}>{active ? 'Enquadrar' : 'Ver grupo'}<ArrowUpRight aria-hidden="true" /></button>
          </div>
          <p className="sale-inspection-group-meta">{group.spaces.length} {group.kind === 'pavilion' ? (group.spaces.length === 1 ? 'módulo' : 'módulos') : (group.spaces.length === 1 ? 'lote' : 'lotes')}{active && <span>Em exibição</span>}</p>
          <div className="sale-inspection-spaces">
            {group.spaces.map((space) => <button key={space.lotId} type="button" aria-label={`Localizar ${space.label} em ${group.title}`} onClick={() => onSpace(group, space)}>{space.label}</button>)}
          </div>
        </li>;
      })}
      </ul>
    </div>
    <footer>
      <button type="button" onClick={onOverview} disabled={!found}><Crosshair aria-hidden="true" />Todos os espaços</button>
      <button type="button" className="is-primary" onClick={onBack}><ArrowLeft aria-hidden="true" />Voltar à dashboard</button>
    </footer>
  </aside>;
}
