import { ArrowLeft, Building2, Crosshair, MapPinned, X } from 'lucide-react';
import { useSaleInspectionStore } from '../../state/useSaleInspectionStore';
import type { SaleInspectionGroup, SaleInspectionResolution, SaleInspectionSpace } from '../../utils/saleInspectionGroups';

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
  if (!context) return null;
  const found = resolution.allLotIds.length;
  return <aside className="sale-inspection-panel" aria-label="Venda selecionada">
    <header>
      <div>
        <span className="sale-inspection-eyebrow">Venda selecionada</span>
        <strong>{context.displayName}</strong>
        <small>{context.reference} · {found} {found === 1 ? 'espaço' : 'espaços'}</small>
      </div>
      <button type="button" aria-label="Encerrar inspeção da venda" onClick={onClose}><X aria-hidden="true" /></button>
    </header>
    {resolution.missing.length > 0 && <p className="sale-inspection-warning" role="status">
      {found} de {found + resolution.missing.length} localizados. Pendente: {resolution.missing.join(', ')}.</p>}
    <ul className="sale-inspection-groups">
      {resolution.groups.map((group) => {
        const active = group.kind === 'pavilion' ? interiorEntityId === group.pavilionEntityId : !interiorEntityId;
        return <li key={group.key} className={active ? 'is-active' : ''}>
          <div className="sale-inspection-group-head">
            <span>{group.kind === 'pavilion' ? <Building2 aria-hidden="true" /> : <MapPinned aria-hidden="true" />}{group.title}
              <em>{group.spaces.length} {group.kind === 'pavilion' ? 'módulo(s)' : 'lote(s)'}</em></span>
            {group.kind === 'pavilion' && !active && <button type="button" onClick={() => onEnterGroup(group)}>Entrar</button>}
          </div>
          <div className="sale-inspection-spaces">
            {group.spaces.map((space) => <button key={space.lotId} type="button" onClick={() => onSpace(group, space)}>{space.label}</button>)}
          </div>
        </li>;
      })}
    </ul>
    <footer>
      <button type="button" onClick={onOverview}><Crosshair aria-hidden="true" />Visão geral da venda</button>
      <button type="button" className="is-primary" onClick={onBack}><ArrowLeft aria-hidden="true" />Voltar à dashboard</button>
    </footer>
  </aside>;
}
