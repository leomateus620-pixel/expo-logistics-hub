import './interior-view-controls.css';
import { useLayoutEffect, useRef, useState } from 'react';
import { RectangleHorizontal, RectangleVertical, ZoomIn } from 'lucide-react';
import { useCommercialMapStore } from '../state/useCommercialMapStore';
import { resolveCommercialPavilionDefinition } from '../utils/commercialPavilions';
import type { MapEntity } from '../types';
import { COMMERCIAL_MAP_OBSTRUCTION_SELECTOR, readContextualViewportInsets } from '../utils/contextualViewport';

export function InteriorViewControls({ entities, active = true }: { entities: MapEntity[]; active?: boolean }) {
  const entityId = useCommercialMapStore(state => state.interiorEntityId);
  const request = useCommercialMapStore(state => state.requestInteriorView);
  const selectedModuleId = useCommercialMapStore(state => state.selectedModuleId);
  const panel = useCommercialMapStore(state => state.activePanel);
  const element = useRef<HTMLDivElement>(null);
  const [right, setRight] = useState(10);
  const entity = entities.find(item => item.id === entityId);
  useLayoutEffect(() => {
    const parent = element.current?.parentElement;
    const canvas = parent?.querySelector('canvas');
    if (!parent || !canvas) return;
    const shell = canvas.closest('.commercial-map-shell, .public-map-shell, [data-interior-qa-shell]') ?? parent;
    let signature = '';
    const update = () => {
      const insets = readContextualViewportInsets(canvas);
      setRight(insets.right + 10);
      const next = JSON.stringify(insets);
      if (next === signature) return;
      signature = next;
      window.dispatchEvent(new Event('commercial-map-panel-resize'));
    };
    const observer = new ResizeObserver(update);
    observer.observe(parent);
    const observed = new Set<Element>();
    const observePanels = () => {
      const panels = new Set(shell.querySelectorAll(COMMERCIAL_MAP_OBSTRUCTION_SELECTOR));
      observed.forEach(item => { if (!panels.has(item)) { observer.unobserve(item); observed.delete(item); } });
      panels.forEach(item => { if (!observed.has(item)) { observer.observe(item); observed.add(item); } });
      update();
    };
    const mutations = new MutationObserver(observePanels);
    mutations.observe(shell, { childList: true, subtree: true });
    observePanels();
    update();
    window.addEventListener('commercial-map-panel-resize', update);
    return () => { mutations.disconnect(); observer.disconnect(); window.removeEventListener('commercial-map-panel-resize', update); };
  }, [entityId, panel, selectedModuleId, active]);
  if (!active || !entity || !resolveCommercialPavilionDefinition(entity)) return null;
  return <div ref={element} style={{ right: `max(${right}px, env(safe-area-inset-right))` }} className="commercial-map-interior-view-controls" role="group" aria-label="Visualização interna do pavilhão"
    data-commercial-map-interior-controls
    onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()} onWheel={event => event.stopPropagation()}>
    <button type="button" aria-label="Visualizar pavilhão na vertical" title="Visualizar pavilhão na vertical" onClick={() => request(entity.id, 'vertical')}>
      <RectangleVertical aria-hidden="true" size={20} /><span>Vertical</span>
    </button>
    <button type="button" aria-label="Visualizar pavilhão na horizontal" title="Visualizar pavilhão na horizontal" onClick={() => request(entity.id, 'horizontal')}>
      <RectangleHorizontal aria-hidden="true" size={20} /><span>Horizontal</span>
    </button>
    <button type="button" aria-label="Aproximar lotes" title="Aproximar lotes" onClick={() => request(entity.id, 'inspect')}>
      <ZoomIn aria-hidden="true" size={20} /><span>Aproximar lotes</span>
    </button>
  </div>;
}
