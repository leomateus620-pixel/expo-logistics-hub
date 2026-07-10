import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CircleDot,
  CornerDownLeft,
  Grid3X3,
  Loader2,
  MousePointer2,
  Move,
  Plus,
  Redo2,
  RotateCcw,
  Save,
  Trash2,
  Undo2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useMapMutations } from '../../hooks/useCommercialMap';
import { OFFICIAL_REFERENCE_IMAGE } from '../../constants';
import { useCommercialMapStore } from '../../state/useCommercialMapStore';
import {
  addVertex,
  calibratedAreaSqm,
  nearestSegmentIndex,
  polygonAreaMapUnits,
  removeVertex,
  translateGeometry,
  updateVertex,
  validateGeometry,
  withoutClosingPoint,
} from '../../utils/geometry';
import type { Coordinate, MapCalibration, MapEntity, PolygonGeometry } from '../../types';

type EditorTool = 'vertices' | 'move';

interface Props {
  entity: MapEntity;
  calibration: MapCalibration | null;
}

function cloneGeometry(geometry: PolygonGeometry): PolygonGeometry {
  return structuredClone(geometry);
}

export function GeometryEditor({ entity, calibration }: Props) {
  const setWorkspaceMode = useCommercialMapStore((state) => state.setWorkspaceMode);
  const { geometry: geometryMutation } = useMapMutations();
  const [draft, setDraft] = useState(() => cloneGeometry(entity.geometry));
  const [history, setHistory] = useState<PolygonGeometry[]>([]);
  const [future, setFuture] = useState<PolygonGeometry[]>([]);
  const [selectedVertex, setSelectedVertex] = useState<number | null>(null);
  const [tool, setTool] = useState<EditorTool>('vertices');
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [gridSize, setGridSize] = useState(0.5);
  const [reason, setReason] = useState('Ajuste técnico da geometria');
  const [pointerOrigin, setPointerOrigin] = useState<Coordinate | null>(null);
  const [geometryOrigin, setGeometryOrigin] = useState<PolygonGeometry | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const originalArea = polygonAreaMapUnits(entity.geometry);
  const validation = useMemo(() => validateGeometry(draft), [draft]);
  const calculatedSqm = calibratedAreaSqm(validation.areaMapUnits, calibration);
  const isDirty = JSON.stringify(draft) !== JSON.stringify(entity.geometry);
  const isReference = !entity.geometry.id;
  const requestClose = useCallback(() => {
    if (isDirty && !window.confirm('Descartar as alterações geométricas que ainda não foram salvas?')) return;
    setWorkspaceMode('3d');
  }, [isDirty, setWorkspaceMode]);

  useEffect(() => {
    setDraft(cloneGeometry(entity.geometry));
    setHistory([]);
    setFuture([]);
    setSelectedVertex(null);
  }, [entity.id, entity.geometry]);

  useEffect(() => {
    const preventLeave = (event: BeforeUnloadEvent) => {
      if (!isDirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', preventLeave);
    return () => window.removeEventListener('beforeunload', preventLeave);
  }, [isDirty]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') requestClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [requestClose]);

  const commit = (next: PolygonGeometry) => {
    setHistory((items) => [...items.slice(-39), cloneGeometry(draft)]);
    setDraft(next);
    setFuture([]);
  };

  const undo = () => {
    const previous = history.at(-1);
    if (!previous) return;
    setFuture((items) => [cloneGeometry(draft), ...items]);
    setDraft(previous);
    setHistory((items) => items.slice(0, -1));
  };

  const redo = () => {
    const next = future[0];
    if (!next) return;
    setHistory((items) => [...items, cloneGeometry(draft)]);
    setDraft(next);
    setFuture((items) => items.slice(1));
  };

  const svgCoordinate = (event: React.PointerEvent<SVGSVGElement>): Coordinate => {
    const svg = svgRef.current;
    if (!svg) return [0, 0];
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const matrix = svg.getScreenCTM();
    if (!matrix) return [0, 0];
    const transformed = point.matrixTransform(matrix.inverse());
    const snap = (value: number) => snapToGrid ? Math.round(value / gridSize) * gridSize : value;
    return [snap(transformed.x), snap(transformed.y)];
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!pointerOrigin || !geometryOrigin) return;
    const current = svgCoordinate(event);
    if (tool === 'vertices' && selectedVertex !== null) {
      setDraft(updateVertex(geometryOrigin, selectedVertex, current));
    } else if (tool === 'move') {
      setDraft(translateGeometry(geometryOrigin, current[0] - pointerOrigin[0], current[1] - pointerOrigin[1]));
    }
  };

  const finishPointer = () => {
    if (!pointerOrigin || !geometryOrigin) return;
    setHistory((items) => [...items.slice(-39), geometryOrigin]);
    setFuture([]);
    setPointerOrigin(null);
    setGeometryOrigin(null);
  };

  const points = withoutClosingPoint(draft.coordinates[0] ?? []);
  const pointString = points.map(([x, y]) => `${x},${y}`).join(' ');
  const originalPoints = withoutClosingPoint(entity.geometry.coordinates[0] ?? []).map(([x, y]) => `${x},${y}`).join(' ');

  const addPoint = (event: React.MouseEvent<SVGPolygonElement>) => {
    if (event.detail !== 2 || tool !== 'vertices') return;
    const coordinate = svgCoordinate(event as unknown as React.PointerEvent<SVGSVGElement>);
    const segment = nearestSegmentIndex(draft.coordinates[0], coordinate);
    commit(addVertex(draft, segment, coordinate));
    setSelectedVertex(segment + 1);
  };

  const save = async () => {
    if (!draft.id || !validation.valid || !reason.trim()) return;
    await geometryMutation.mutateAsync({
      geometryId: draft.id,
      geometry: draft,
      expectedVersion: entity.geometry.geometryVersion,
      reason: reason.trim(),
    });
    setWorkspaceMode('3d');
  };

  return (
    <div className="commercial-map-editor">
      <div className="commercial-map-editor-header">
        <div>
          <button type="button" onClick={requestClose}><ArrowLeft className="h-4 w-4" />Voltar ao mapa</button>
          <span>Editor geométrico versionado</span>
          <h2>{entity.publicIdentifier} · {entity.name}</h2>
        </div>
        <div className="commercial-map-editor-tools" role="toolbar" aria-label="Ferramentas de geometria">
          <button type="button" className={tool === 'vertices' ? 'is-active' : ''} onClick={() => setTool('vertices')}><MousePointer2 />Vértices</button>
          <button type="button" className={tool === 'move' ? 'is-active' : ''} onClick={() => setTool('move')}><Move />Mover</button>
          <i />
          <button type="button" onClick={undo} disabled={!history.length} aria-label="Desfazer"><Undo2 /></button>
          <button type="button" onClick={redo} disabled={!future.length} aria-label="Refazer"><Redo2 /></button>
          <button type="button" onClick={() => { setDraft(cloneGeometry(entity.geometry)); setHistory([]); setFuture([]); }} disabled={!isDirty}><RotateCcw />Restaurar</button>
        </div>
      </div>

      <div className="commercial-map-editor-body">
        <div className="commercial-map-editor-stage">
          <svg
            ref={svgRef}
            viewBox="-60 -33.75 120 67.5"
            preserveAspectRatio="xMidYMid meet"
            onPointerMove={handlePointerMove}
            onPointerUp={finishPointer}
            onPointerCancel={finishPointer}
            aria-label={`Edição vetorial de ${entity.name}`}
          >
            <defs>
              <pattern id="map-grid-small" width={gridSize} height={gridSize} patternUnits="userSpaceOnUse"><path d={`M ${gridSize} 0 L 0 0 0 ${gridSize}`} fill="none" stroke="rgba(27,66,38,.12)" strokeWidth=".035" /></pattern>
              <pattern id="map-grid-large" width={gridSize * 10} height={gridSize * 10} patternUnits="userSpaceOnUse"><rect width={gridSize * 10} height={gridSize * 10} fill="url(#map-grid-small)" /><path d={`M ${gridSize * 10} 0 L 0 0 0 ${gridSize * 10}`} fill="none" stroke="rgba(27,66,38,.2)" strokeWidth=".055" /></pattern>
              <filter id="editor-shadow"><feDropShadow dx="0" dy=".2" stdDeviation=".35" floodOpacity=".28" /></filter>
            </defs>
            <image
              href={calibration?.referenceImageUrl || calibration?.referenceImagePath || OFFICIAL_REFERENCE_IMAGE}
              x={-60 * (calibration?.imageScaleX ?? 1) + (calibration?.imageOffsetX ?? 0)}
              y={-33.75 * (calibration?.imageScaleY ?? 1) + (calibration?.imageOffsetY ?? 0)}
              width={120 * (calibration?.imageScaleX ?? 1)}
              height={67.5 * (calibration?.imageScaleY ?? 1)}
              transform={`rotate(${calibration?.imageRotationDegrees ?? 0} ${calibration?.imageOffsetX ?? 0} ${calibration?.imageOffsetY ?? 0})`}
              opacity=".28"
            />
            {snapToGrid && <rect x="-60" y="-33.75" width="120" height="67.5" fill="url(#map-grid-large)" />}
            <polygon points={originalPoints} fill="rgba(30,64,44,.08)" stroke="rgba(30,64,44,.5)" strokeWidth=".18" strokeDasharray=".55 .4" />
            <polygon
              points={pointString}
              className={validation.valid ? 'draft-polygon' : 'draft-polygon is-invalid'}
              onDoubleClick={addPoint}
              onPointerDown={(event) => {
                if (tool !== 'move') return;
                event.currentTarget.setPointerCapture(event.pointerId);
                setPointerOrigin(svgCoordinate(event as unknown as React.PointerEvent<SVGSVGElement>));
                setGeometryOrigin(cloneGeometry(draft));
              }}
              filter="url(#editor-shadow)"
            />
            {tool === 'vertices' && points.map(([x, y], index) => (
              <g key={`${index}-${x}-${y}`}>
                <circle cx={x} cy={y} r={selectedVertex === index ? 0.68 : 0.5} className={selectedVertex === index ? 'editor-vertex is-selected' : 'editor-vertex'}
                  onPointerDown={(event) => {
                    event.currentTarget.setPointerCapture(event.pointerId);
                    setSelectedVertex(index);
                    setPointerOrigin([x, y]);
                    setGeometryOrigin(cloneGeometry(draft));
                  }}
                />
                <text x={x} y={y - 0.85}>{index + 1}</text>
              </g>
            ))}
          </svg>
          <div className="commercial-map-editor-hint">
            <CircleDot />
            <span>{tool === 'vertices' ? 'Arraste os vértices. Clique duas vezes sobre o polígono para inserir um novo ponto.' : 'Arraste o polígono completo para reposicioná-lo.'}</span>
          </div>
        </div>

        <aside className="commercial-map-editor-inspector">
          <div className={`commercial-map-editor-validation ${validation.valid ? 'is-valid' : 'is-invalid'}`}>
            {validation.valid ? <Check /> : <AlertCircle />}
            <div><strong>{validation.valid ? 'Geometria válida para revisão' : 'Corrija antes de salvar'}</strong><span>{validation.errors[0] || validation.warnings[0] || 'Nenhuma inconsistência geométrica detectada.'}</span></div>
          </div>

          <div className="commercial-map-editor-metrics">
            <div><span>Área anterior</span><strong>{originalArea.toFixed(2)} un²</strong></div>
            <div><span>Área proposta</span><strong>{validation.areaMapUnits.toFixed(2)} un²</strong></div>
            <div className={validation.areaMapUnits - originalArea >= 0 ? 'is-positive' : 'is-negative'}><span>Variação</span><strong>{validation.areaMapUnits - originalArea >= 0 ? '+' : ''}{(validation.areaMapUnits - originalArea).toFixed(2)} un²</strong></div>
            <div><span>Área calibrada</span><strong>{calculatedSqm === null ? 'Não disponível' : `${calculatedSqm.toFixed(2)} m²`}</strong></div>
          </div>

          <div className="commercial-map-editor-section">
            <h3>Ajustes de desenho</h3>
            <label className="commercial-map-setting-row">
              <span><strong>Encaixar na grade</strong><small>Evita desalinhamentos acidentais</small></span>
              <Switch checked={snapToGrid} onCheckedChange={setSnapToGrid} />
            </label>
            <div className="commercial-map-editor-field">
              <Label htmlFor="grid-size"><Grid3X3 />Intervalo da grade</Label>
              <Input id="grid-size" type="number" min="0.05" max="5" step="0.05" value={gridSize} onChange={(event) => setGridSize(Math.max(0.05, Number(event.target.value)))} />
            </div>
            <div className="commercial-map-editor-inline-actions">
              <Button type="button" variant="outline" size="sm" onClick={() => {
                const ring = withoutClosingPoint(draft.coordinates[0]);
                const last = ring.at(-1) ?? [0, 0];
                commit(addVertex(draft, ring.length - 1, [last[0] + gridSize, last[1] + gridSize]));
              }}><Plus />Adicionar vértice</Button>
              <Button type="button" variant="outline" size="sm" disabled={selectedVertex === null || points.length <= 3} onClick={() => {
                if (selectedVertex === null) return;
                commit(removeVertex(draft, selectedVertex));
                setSelectedVertex(null);
              }}><Trash2 />Remover</Button>
            </div>
          </div>

          <div className="commercial-map-editor-section">
            <h3>Revisão e auditoria</h3>
            <div className="commercial-map-editor-field">
              <Label htmlFor="change-reason"><CornerDownLeft />Motivo da alteração</Label>
              <Textarea id="change-reason" value={reason} onChange={(event) => setReason(event.target.value)} rows={3} />
            </div>
            {isReference && (
              <div className="commercial-map-editor-reference-warning">
                <AlertCircle />
                <p><strong>Referência ainda não persistida</strong>Importe a base cartográfica para criar a primeira revisão auditável. O rascunho local não será promovido automaticamente.</p>
              </div>
            )}
          </div>

          <div className="commercial-map-editor-footer">
            <Button variant="ghost" onClick={requestClose}>Cancelar</Button>
            <Button onClick={save} disabled={!isDirty || !validation.valid || !reason.trim() || isReference || geometryMutation.isPending}>
              {geometryMutation.isPending ? <Loader2 className="animate-spin" /> : <Save />}
              Salvar nova revisão
            </Button>
          </div>
        </aside>
      </div>
    </div>
  );
}
