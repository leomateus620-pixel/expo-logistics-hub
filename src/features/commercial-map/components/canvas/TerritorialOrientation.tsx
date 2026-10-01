import { memo, useEffect, useMemo, useRef } from 'react';
import { Html } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { CommercialLot, Coordinate, MapEntity } from '../../types';
import type { PublicExternalScenePolicy } from '../../public/publicScenePolicy';
import { COMMERCIAL_MAP_OBSTRUCTION_SELECTOR } from '../../utils/contextualViewport';
import { orientationBoxFits, orientationLevel, prepareTerritorialOrientation, TERRITORY_SYMBOLS, type ScreenBox } from '../../utils/territorialOrientation';
import { useCommercialMapStore } from '../../state/useCommercialMapStore';
import './territorial-orientation.css';

const ORIGIN = (): [number, number] => [0, 0];
export const TerritorialOrientation = memo(function TerritorialOrientation({ entities, lots, roads, policy }: {
  entities: readonly MapEntity[]; lots: readonly CommercialLot[]; roads: readonly MapEntity[]; policy?: PublicExternalScenePolicy | null;
}) {
  const gl = useThree(s => s.gl), size = useThree(s => s.size), invalidate = useThree(s => s.invalidate);
  const items = useMemo(() => {
    const scoped = policy ? entities.filter(entity => policy.activeScope.has(entity.id)) : entities;
    // Shared circulation is allowed only when present in the authorized inventory.
    const availableRoads = policy ? roads.filter(road => entities.some(entity => entity.id === road.id)) : roads;
    const prepared = prepareTerritorialOrientation(scoped, lots, availableRoads);
    if (!policy) return prepared;
    const focus = policy.focusBounds, pad = focus.diagonal * .12;
    return prepared.filter(item => item.anchor[0] >= focus.minX - pad && item.anchor[0] <= focus.maxX + pad
      && item.anchor[1] >= focus.minZ - pad && item.anchor[1] <= focus.maxZ + pad);
  }, [entities, lots, roads, policy]);
  const selected = useCommercialMapStore(s => s.selectedEntityId);
  const svg = useRef<SVGSVGElement>(null);
  const nodes = useRef(new Map<string, SVGGElement>());
  const lines = useRef(new Map<string, SVGPathElement>());
  const prior = useRef(''), dirty = useRef(true);
  const level = useRef<'far' | 'medium' | 'near'>('far');
  const point = useMemo(() => new THREE.Vector3(), []);
  const blocks = useMemo(() => items.filter(item => item.kind === 'block'), [items]);
  const rankedByLevel = useMemo(() => ({
    far: [...items].sort((a, b) => ({ segment: 0, road: 1, block: 2 })[a.kind] - ({ segment: 0, road: 1, block: 2 })[b.kind]),
    medium: [...items].sort((a, b) => ({ block: 0, road: 1, segment: 2 })[a.kind] - ({ block: 0, road: 1, segment: 2 })[b.kind]),
  }), [items]);
  useEffect(() => { dirty.current = true; invalidate(); }, [items, selected, invalidate]);
  useEffect(() => {
    const shell = gl.domElement.closest('.commercial-map-shell, .public-map-shell');
    if (!shell) return;
    const mark = () => { dirty.current = true; invalidate(); };
    const observer = new MutationObserver(records => {
      if (records.some(record => !svg.current?.contains(record.target))) mark();
    });
    observer.observe(shell, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden', 'style'] });
    const resize = new ResizeObserver(mark);
    shell.querySelectorAll(COMMERCIAL_MAP_OBSTRUCTION_SELECTOR).forEach(el => resize.observe(el));
    window.addEventListener('commercial-map-panel-resize', mark);
    return () => { observer.disconnect(); resize.disconnect(); window.removeEventListener('commercial-map-panel-resize', mark); };
  }, [gl, invalidate]);
  useFrame(({ camera, size }) => {
    if (!svg.current) return;
    camera.updateMatrixWorld();
    const key = [size.width, size.height, ...camera.matrixWorld.elements, ...camera.projectionMatrix.elements].join(',');
    if (key === prior.current && !dirty.current) return;
    prior.current = key; dirty.current = false;
    const project = (p: Coordinate, y: number) => {
      point.set(p[0], y, p[1]).project(camera);
      return { x: (point.x + 1) * size.width / 2, y: (1 - point.y) * size.height / 2, z: point.z };
    };
    // A representative quadra, rather than the whole park, defines local density.
    const spans = blocks.map(item => {
      const points = item.outline?.[0]?.map(p => project(p, item.elevation)) ?? [];
      if (points.length < 3) return 0;
      return Math.hypot(Math.max(...points.map(p => p.x)) - Math.min(...points.map(p => p.x)),
        Math.max(...points.map(p => p.y)) - Math.min(...points.map(p => p.y)));
    }).filter(Boolean).sort((a, b) => a - b);
    const span = spans.length ? spans[Math.floor(spans.length / 2)] : 0;
    level.current = orientationLevel(span, level.current);
    const canvas = gl.domElement.getBoundingClientRect();
    const occupied: ScreenBox[] = [];
    gl.domElement.closest('.commercial-map-shell, .public-map-shell')?.querySelectorAll<HTMLElement>(`${COMMERCIAL_MAP_OBSTRUCTION_SELECTOR}, .commercial-map-label, .commercial-map-top-bar, .commercial-map-toolbar, .commercial-map-onboarding-note, .commercial-map-dock`).forEach(el => {
      if (!el.getClientRects().length || getComputedStyle(el).visibility === 'hidden') return;
      const r = el.getBoundingClientRect();
      occupied.push({ left: r.left - canvas.left, right: r.right - canvas.left, top: r.top - canvas.top, bottom: r.bottom - canvas.top });
    });
    const selection = entities.find(entity => entity.id === selected);
    if (selection?.geometry.coordinates[0]?.length) {
      const pts = selection.geometry.coordinates[0].map(p => project(p, selection.geometry.elevation));
      occupied.push({ left: Math.min(...pts.map(p => p.x)), right: Math.max(...pts.map(p => p.x)),
        top: Math.min(...pts.map(p => p.y)), bottom: Math.max(...pts.map(p => p.y)) });
    }
    let shown = 0;
    const limit = size.width < 600 ? 7 : 19;
    const ranked = level.current === 'far' ? rankedByLevel.far : rankedByLevel.medium;
    for (const item of ranked) {
      const node = nodes.current.get(item.id);
      if (!node) continue;
      const center = project(item.anchor, item.elevation);
      const a = project(item.edge[0], item.elevation), b = project(item.edge[1], item.elevation);
      const text = node.querySelector('text');
      const width = Math.ceil((text?.getComputedTextLength() ?? item.name.length * 6) + 16), height = item.kind === 'segment' ? 23 : 20;
      const rect = { left: center.x - width / 2, right: center.x + width / 2, top: center.y - height / 2, bottom: center.y + height / 2 };
      const enough = item.kind === 'segment' ? level.current !== 'near' : item.kind === 'block' ? level.current !== 'far' : true;
      const visible = enough && shown < limit && center.z >= -1 && center.z <= 1
        && Math.hypot(a.x - b.x, a.y - b.y) > width * (item.kind === 'road' ? .75 : .55)
        && rect.left > 8 && rect.right < size.width - 8 && rect.top > 8 && rect.bottom < size.height - 8
        && orientationBoxFits(rect, occupied);
      node.style.display = visible ? '' : 'none';
      if (!visible) continue;
      node.setAttribute('transform', `translate(${center.x} ${center.y})`);
      if (text && item.kind === 'road') {
        const angle = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
        const upright = ((angle + 90 + 360) % 180) - 90;
        text.setAttribute('transform', `rotate(${Math.abs(upright) < 28 ? upright.toFixed(1) : 0})`);
      }
      const background = node.querySelector('rect');
      if (background) { background.setAttribute('x', String(-width / 2)); background.setAttribute('width', String(width)); }
      occupied.push(rect); shown++;
    }
    // Draw only verified cadastral quadra rings; never a synthetic segment hull.
    for (const item of blocks) {
      const path = lines.current.get(item.id);
      if (!path || !item.outline) continue;
      path.style.display = '';
      path.setAttribute('d', item.outline.map(ring => ring.map((p, index) => {
        const projected = project(p, item.elevation);
        return `${index ? 'L' : 'M'}${projected.x.toFixed(1)} ${projected.y.toFixed(1)}`;
      }).join(' ') + ' Z').join(' '));
    }
  });
  return <Html calculatePosition={ORIGIN} zIndexRange={[1, 1]} style={{ width: size.width, height: size.height, pointerEvents: 'none' }}>
    <svg ref={svg} className="territorial-orientation" aria-hidden="true" width={size.width} height={size.height}>
      {blocks.map(item => <path key={`outline:${item.id}`} className={`territorial-orientation__outline territorial-orientation__outline--${item.segmentId}`} ref={node => { if (node) lines.current.set(item.id, node); else lines.current.delete(item.id); }} />)}
      {items.map(item => <g key={item.id} className={`territorial-orientation__label territorial-orientation__label--${item.kind}`} ref={node => { if (node) nodes.current.set(item.id, node); else nodes.current.delete(item.id); }} style={{ display: 'none' }}>
        <rect y={item.kind === 'segment' ? -11.5 : -10} height={item.kind === 'segment' ? 23 : 20} rx="4" />
        <text textAnchor="middle" dominantBaseline="central">{item.kind === 'segment' && item.segmentId ? `${TERRITORY_SYMBOLS[item.segmentId].glyph}  ` : ''}{item.name}</text>
      </g>)}
    </svg>
  </Html>;
});
