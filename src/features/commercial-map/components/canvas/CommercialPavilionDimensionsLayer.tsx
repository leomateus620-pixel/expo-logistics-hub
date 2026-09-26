import { memo, useEffect, useMemo, useRef } from 'react';
import { Html } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { CommercialPavilionLayout } from '../../utils/commercialPavilions';
import { createCommercialPavilionModuleProjectionFrame, projectCommercialPavilionModuleRect, type CommercialPavilionModulePlan } from '../../utils/commercialPavilionModules';
import { COMMERCIAL_MAP_OBSTRUCTION_SELECTOR } from '../../utils/contextualViewport';
import { layoutDimensionOnScreen, resolvePavilionDimensions, type DimensionScreenRect } from '../../utils/pavilionDimensions';

const OBSTRUCTIONS = `${COMMERCIAL_MAP_OBSTRUCTION_SELECTOR}, [data-commercial-map-interior-controls], .commercial-pavilion-access-marker, [role="tooltip"], .commercial-map-tooltip`;
const SCREEN_ORIGIN = (): [number, number] => [0, 0];

/** One noninteractive SVG projected through the existing Canvas camera/group.
 * No raycast objects, GPU resources, camera controls, store writes or rAF loop.
 */
export const CommercialPavilionDimensionsLayer = memo(function CommercialPavilionDimensionsLayer({ plan, layout }: {
  plan: CommercialPavilionModulePlan; layout: CommercialPavilionLayout;
}) {
  const gl = useThree(state => state.gl);
  const invalidate = useThree(state => state.invalidate);
  const size = useThree(state => state.size);
  const group = useRef<THREE.Group>(null);
  const svg = useRef<SVGSVGElement>(null);
  const nodes = useRef(new Map<string, SVGGElement>());
  const visible = useRef(new Set<string>());
  const lastProjection = useRef('');
  const dirty = useRef(true);
  const scratch = useMemo(() => new THREE.Vector3(), []);
  const footprint = useMemo(() => ({ width: layout.interior.clearWidth, depth: layout.interior.clearDepth, outerWidth: layout.width, outerDepth: layout.depth }), [layout]);
  const dimensions = useMemo(() => resolvePavilionDimensions(plan, footprint).sort((a, b) => a.priority - b.priority), [plan, footprint]);
  const geometry = useMemo(() => {
    const frame = createCommercialPavilionModuleProjectionFrame(plan, footprint);
    const parts = [...plan.cells.flatMap(cell => cell.shape?.renderParts ?? [cell]), ...plan.supportSpaces];
    return parts.map(part => projectCommercialPavilionModuleRect(part, frame));
  }, [plan, footprint]);
  const host = gl.domElement.parentElement;

  // Tooltips/panels can open while frameloop="demand" is idle. Observe DOM
  // changes outside this SVG and request a draw, without a permanent loop.
  useEffect(() => {
    const shell = gl.domElement.closest('.commercial-map-shell, .public-map-shell, [data-interior-qa-shell]') ?? host;
    if (!shell || dimensions.length === 0) return;
    const observer = new MutationObserver(records => {
      if (records.some(record => !svg.current?.contains(record.target))) { dirty.current = true; invalidate(); }
    });
    observer.observe(shell, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden', 'aria-expanded', 'data-sheet-state'] });
    const refresh = () => { dirty.current = true; invalidate(); };
    window.addEventListener('commercial-map-panel-resize', refresh);
    return () => { observer.disconnect(); window.removeEventListener('commercial-map-panel-resize', refresh); };
  }, [dimensions.length, gl, host, invalidate]);

  useFrame(({ camera, size }) => {
    if (!group.current || !svg.current || !dimensions.length) return;
    group.current.updateWorldMatrix(true, false);
    const projection = [plan.publicIdentifier, size.width, size.height, ...camera.matrixWorld.elements, ...camera.projectionMatrix.elements, ...group.current.matrixWorld.elements].join(',');
    if (projection === lastProjection.current && !dirty.current) return;
    lastProjection.current = projection;
    dirty.current = false;
    const project = (x: number, z: number) => {
      scratch.set(x, layout.interior.floorY + 0.045, z).applyMatrix4(group.current!.matrixWorld).project(camera);
      return [((scratch.x + 1) / 2) * size.width, ((1 - scratch.y) / 2) * size.height] as const;
    };
    const obstacles: DimensionScreenRect[] = geometry.map(rect => {
      const points = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, z]) => project(rect.centerX + x * rect.width / 2, rect.centerZ + z * rect.depth / 2));
      return { left: Math.min(...points.map(p => p[0])), right: Math.max(...points.map(p => p[0])), top: Math.min(...points.map(p => p[1])), bottom: Math.max(...points.map(p => p[1])) };
    });
    const moduleSizes = obstacles.slice(0, plan.cells.length).map(rect => Math.min(rect.right - rect.left, rect.bottom - rect.top)).sort((a, b) => a - b);
    const modulePixels = moduleSizes[Math.floor(moduleSizes.length / 2)] ?? 0;
    const canvasRect = gl.domElement.getBoundingClientRect();
    const shell = gl.domElement.closest('.commercial-map-shell, .public-map-shell, [data-interior-qa-shell]') ?? host;
    shell?.querySelectorAll<HTMLElement>(OBSTRUCTIONS).forEach(element => {
      if (!element.getClientRects().length || element.hidden) return;
      const rect = element.getBoundingClientRect();
      obstacles.push({ left: rect.left - canvasRect.left, right: rect.right - canvasRect.left, top: rect.top - canvasRect.top, bottom: rect.bottom - canvasRect.top });
    });
    for (const dimension of dimensions) {
      const node = nodes.current.get(dimension.id);
      if (!node) continue;
      const result = layoutDimensionOnScreen({ dimension, start: project(...dimension.startPoint), end: project(...dimension.endPoint), modulePixels, width: size.width, height: size.height, obstacles, previouslyVisible: visible.current.has(dimension.id) });
      node.style.display = result ? '' : 'none';
      if (!result) { visible.current.delete(dimension.id); continue; }
      visible.current.add(dimension.id);
      node.setAttribute('transform', `translate(${result.cx} ${result.cy}) rotate(${result.angle})`);
      node.querySelector('path')!.setAttribute('d', result.path);
      node.querySelector('text')!.setAttribute('font-size', String(result.fontSize));
      node.querySelector('text')!.setAttribute('transform', `rotate(${result.textRotation})`);
      obstacles.push(result.textBounds);
    }
  });

  if (!host || !dimensions.length) return null;
  return <group ref={group} name={`pavilion-dimensions:${plan.publicIdentifier}`}>
    <Html calculatePosition={SCREEN_ORIGIN} zIndexRange={[2, 2]} style={{ width: size.width, height: size.height, pointerEvents: 'none' }}>
    <svg ref={svg} data-pavilion-dimensions={plan.publicIdentifier} aria-hidden="true"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'hidden', pointerEvents: 'none', userSelect: 'none', zIndex: 2 }}>
      {dimensions.map(dimension => <g key={dimension.id} ref={node => { if (node) nodes.current.set(dimension.id, node); else nodes.current.delete(dimension.id); }}
        data-dimension-id={dimension.id} data-dimension-priority={dimension.priority} style={{ display: 'none', pointerEvents: 'none' }}>
        <path fill="none" stroke="#505b53" strokeWidth="0.8" />
        <text textAnchor="middle" dominantBaseline="central" fill="#36453d" stroke="#e5e5de" strokeWidth="1.4" paintOrder="stroke" strokeLinejoin="round" fontFamily="Arial, sans-serif" fontWeight="400">{dimension.label}</text>
      </g>)}
    </svg>
    </Html>
  </group>;
});
