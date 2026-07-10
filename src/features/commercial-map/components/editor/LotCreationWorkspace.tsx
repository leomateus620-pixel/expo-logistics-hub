import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, ArrowLeft, Check, CircleDot, Loader2, MapPinPlus, RotateCcw, Save, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { OFFICIAL_REFERENCE_IMAGE } from '../../constants';
import { useMapMutations } from '../../hooks/useCommercialMap';
import { useCommercialMapStore } from '../../state/useCommercialMapStore';
import { calculateAskingPrice, calibratedAreaSqm, closeRing, validateGeometry } from '../../utils/geometry';
import type { Coordinate, MapCalibration, MapEntity, MapLayer, MapProject, PolygonGeometry, PricingMode } from '../../types';

interface Props {
  project: MapProject;
  calibration: MapCalibration | null;
  layers: MapLayer[];
  entities: MapEntity[];
}

export function LotCreationWorkspace({ project, calibration, layers, entities }: Props) {
  const setWorkspaceMode = useCommercialMapStore((state) => state.setWorkspaceMode);
  const setSelectedEntityId = useCommercialMapStore((state) => state.setSelectedEntityId);
  const { lotCreation } = useMapMutations();
  const svgRef = useRef<SVGSVGElement>(null);
  const [points, setPoints] = useState<Coordinate[]>([]);
  const [publicIdentifier, setPublicIdentifier] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [classification, setClassification] = useState<'SELLABLE_LOT' | 'INTERNAL_STAND'>('SELLABLE_LOT');
  const [parentEntityId, setParentEntityId] = useState('');
  const [block, setBlock] = useState('');
  const [lotNumber, setLotNumber] = useState('');
  const [levelLabel, setLevelLabel] = useState('');
  const [officialAreaSqm, setOfficialAreaSqm] = useState('');
  const [frontageMeters, setFrontageMeters] = useState('');
  const [depthMeters, setDepthMeters] = useState('');
  const [officialAreaValidated, setOfficialAreaValidated] = useState(false);
  const [pricingMode, setPricingMode] = useState<PricingMode>('NEGOTIABLE');
  const [fixedTotal, setFixedTotal] = useState('');
  const [pricePerSqm, setPricePerSqm] = useState('');
  const [minimumPrice, setMinimumPrice] = useState('');
  const [reason, setReason] = useState('Cadastro e traçado inicial do lote');
  const commercialLayer = layers.find((layer) => layer.key === 'commercial');
  const parentCandidates = entities.filter((entity) => ['PAVILION', 'OTHER', 'RURAL_EXHIBITION'].includes(entity.classification));

  const geometry = useMemo<PolygonGeometry>(() => ({
    id: null,
    type: 'Polygon',
    coordinates: [closeRing(points)],
    elevation: 0,
    extrusionHeight: classification === 'INTERNAL_STAND' ? 0.32 : 0.18,
    rotation: 0,
    geometryVersion: 1,
    calibrationVersion: calibration?.status === 'VALIDATED' ? calibration.version : null,
  }), [calibration, classification, points]);
  const validation = useMemo(() => validateGeometry(geometry), [geometry]);
  const calculatedSqm = calibratedAreaSqm(validation.areaMapUnits, calibration);
  const officialAreaNumber = officialAreaSqm ? Number(officialAreaSqm) : null;
  const pricing = calculateAskingPrice({
    pricingMode,
    fixedTotal: fixedTotal ? Number(fixedTotal) : null,
    pricePerSqm: pricePerSqm ? Number(pricePerSqm) : null,
    officialAreaSqm: officialAreaNumber,
    areaValidationStatus: officialAreaValidated ? 'VALIDATED' : 'UNVALIDATED',
  });
  const minimumPriceNumber = minimumPrice ? Number(minimumPrice) : null;
  const minimumPriceInvalid = minimumPriceNumber !== null
    && (!Number.isFinite(minimumPriceNumber) || minimumPriceNumber < 0 || (pricing.value !== null && minimumPriceNumber > pricing.value));
  const isDirty = points.length > 0 || Boolean(publicIdentifier || displayName || description || block || lotNumber || levelLabel || officialAreaSqm || frontageMeters || depthMeters || fixedTotal || pricePerSqm || minimumPrice);
  const requestClose = useCallback(() => {
    if (isDirty && !window.confirm('Descartar o novo lote e o traçado que ainda não foram salvos?')) return;
    setWorkspaceMode('3d');
  }, [isDirty, setWorkspaceMode]);

  useEffect(() => {
    const preventLeave = (event: BeforeUnloadEvent) => {
      if (!isDirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') requestClose();
    };
    window.addEventListener('beforeunload', preventLeave);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('beforeunload', preventLeave);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [isDirty, requestClose]);

  const svgCoordinate = (event: React.MouseEvent<SVGSVGElement>): Coordinate => {
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return [0, 0];
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const transformed = point.matrixTransform(matrix.inverse());
    return [Math.round(transformed.x * 4) / 4, Math.round(transformed.y * 4) / 4];
  };

  const save = async () => {
    if (!commercialLayer || !validation.valid) return;
    const entityId = await lotCreation.mutateAsync({
      projectId: project.id,
      layerId: commercialLayer.id,
      parentEntityId: parentEntityId || null,
      publicIdentifier: publicIdentifier.trim(),
      displayName: displayName.trim(),
      description: description.trim(),
      classification,
      geometry,
      block: block.trim(),
      lotNumber: lotNumber.trim(),
      levelLabel: levelLabel.trim(),
      officialAreaSqm: officialAreaNumber,
      areaValidationStatus: officialAreaValidated ? 'VALIDATED' : 'UNVALIDATED',
      frontageMeters: frontageMeters ? Number(frontageMeters) : null,
      depthMeters: depthMeters ? Number(depthMeters) : null,
      pricingMode,
      fixedTotal: fixedTotal ? Number(fixedTotal) : null,
      pricePerSqm: pricePerSqm ? Number(pricePerSqm) : null,
      askingPrice: pricing.value,
      minimumPrice: minimumPriceNumber,
      reason: reason.trim(),
    });
    setSelectedEntityId(String(entityId));
    setWorkspaceMode('3d');
  };

  const requiredReady = Boolean(
    publicIdentifier.trim()
    && displayName.trim()
    && reason.trim()
    && validation.valid
    && commercialLayer
    && !pricing.warning
    && !minimumPriceInvalid
    && (!officialAreaValidated || (officialAreaNumber !== null && Number.isFinite(officialAreaNumber) && officialAreaNumber > 0)),
  );
  return (
    <div className="commercial-map-editor commercial-map-lot-creation">
      <div className="commercial-map-editor-header">
        <div>
          <button type="button" onClick={requestClose}><ArrowLeft className="h-4 w-4" />Voltar ao mapa</button>
          <span>Implantação comercial controlada</span>
          <h2>Traçar novo lote</h2>
        </div>
        <div className="commercial-map-editor-tools">
          <button type="button" className="is-active"><MapPinPlus />Traçar</button>
          <i />
          <button type="button" onClick={() => setPoints((current) => current.slice(0, -1))} disabled={!points.length}><Undo2 />Desfazer ponto</button>
          <button type="button" onClick={() => setPoints([])} disabled={!points.length}><RotateCcw />Limpar</button>
        </div>
      </div>

      <div className="commercial-map-editor-body">
        <div className="commercial-map-editor-stage">
          <svg
            ref={svgRef}
            viewBox="-60 -33.75 120 67.5"
            preserveAspectRatio="xMidYMid meet"
            onClick={(event) => setPoints((current) => [...current, svgCoordinate(event)])}
            aria-label="Área de traçado do novo lote"
          >
            <defs><filter id="lot-create-shadow"><feDropShadow dx="0" dy=".2" stdDeviation=".3" floodOpacity=".25" /></filter></defs>
            <image
              href={calibration?.referenceImageUrl || calibration?.referenceImagePath || OFFICIAL_REFERENCE_IMAGE}
              x={-60 * (calibration?.imageScaleX ?? 1) + (calibration?.imageOffsetX ?? 0)}
              y={-33.75 * (calibration?.imageScaleY ?? 1) + (calibration?.imageOffsetY ?? 0)}
              width={120 * (calibration?.imageScaleX ?? 1)}
              height={67.5 * (calibration?.imageScaleY ?? 1)}
              transform={`rotate(${calibration?.imageRotationDegrees ?? 0} ${calibration?.imageOffsetX ?? 0} ${calibration?.imageOffsetY ?? 0})`}
              opacity=".55"
            />
            {points.length >= 2 && <polyline points={points.map(([x, y]) => `${x},${y}`).join(' ')} className="lot-creation-line" />}
            {points.length >= 3 && <polygon points={points.map(([x, y]) => `${x},${y}`).join(' ')} className={validation.valid ? 'draft-polygon' : 'draft-polygon is-invalid'} filter="url(#lot-create-shadow)" />}
            {points.map(([x, y], index) => <g key={`${x}-${y}-${index}`}><circle cx={x} cy={y} r=".48" className="editor-vertex" /><text x={x} y={y - .8}>{index + 1}</text></g>)}
          </svg>
          <div className="commercial-map-editor-hint"><CircleDot /><span>Clique nos limites oficiais do lote em sequência. O polígono fecha automaticamente após o terceiro ponto.</span></div>
        </div>

        <aside className="commercial-map-editor-inspector">
          <div className={`commercial-map-editor-validation ${validation.valid ? 'is-valid' : 'is-invalid'}`}>
            {validation.valid ? <Check /> : <AlertCircle />}
            <div><strong>{validation.valid ? 'Traçado pronto para cadastro' : 'Continue delimitando o lote'}</strong><span>{validation.errors[0] || validation.warnings[0] || 'Polígono simples sem inconsistências.'}</span></div>
          </div>
          <div className="commercial-map-editor-metrics">
            <div><span>Vértices</span><strong>{points.length}</strong></div>
            <div><span>Área cartográfica</span><strong>{validation.areaMapUnits.toFixed(2)} un²</strong></div>
            <div><span>Área calibrada</span><strong>{calculatedSqm === null ? 'Não disponível' : `${calculatedSqm.toFixed(2)} m²`}</strong></div>
            <div><span>Camada</span><strong>{commercialLayer?.name || 'Camada ausente'}</strong></div>
          </div>

          <div className="commercial-map-editor-section commercial-map-form-grid">
            <h3>Identificação e hierarquia</h3>
            <label><span>Identificador público *</span><Input value={publicIdentifier} onChange={(event) => setPublicIdentifier(event.target.value)} placeholder="Ex.: Q-042" /></label>
            <label><span>Nome de exibição *</span><Input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Ex.: Lote Q-042" /></label>
            <label><span>Classificação *</span><select value={classification} onChange={(event) => setClassification(event.target.value as typeof classification)}><option value="SELLABLE_LOT">Lote comercial externo</option><option value="INTERNAL_STAND">Estande interno</option></select></label>
            <label><span>Estrutura superior</span><select value={parentEntityId} onChange={(event) => setParentEntityId(event.target.value)}><option value="">Sem vínculo definido</option>{parentCandidates.map((entity) => <option value={entity.id} key={entity.id}>{entity.publicIdentifier} · {entity.name}</option>)}</select></label>
            <label><span>Bloco</span><Input value={block} onChange={(event) => setBlock(event.target.value)} /></label>
            <label><span>Número do lote</span><Input value={lotNumber} onChange={(event) => setLotNumber(event.target.value)} /></label>
            <label><span>Piso / nível</span><Input value={levelLabel} onChange={(event) => setLevelLabel(event.target.value)} placeholder="Ex.: Térreo" /></label>
            <label className="is-full"><span>Descrição</span><Textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={2} /></label>
          </div>

          <div className="commercial-map-editor-section commercial-map-form-grid">
            <h3>Medidas oficiais</h3>
            <label><span>Área oficial (m²)</span><Input type="number" min="0" step="0.01" value={officialAreaSqm} onChange={(event) => { setOfficialAreaSqm(event.target.value); if (!event.target.value) setOfficialAreaValidated(false); }} /></label>
            <label><span>Testada (m)</span><Input type="number" min="0" step="0.01" value={frontageMeters} onChange={(event) => setFrontageMeters(event.target.value)} /></label>
            <label><span>Profundidade (m)</span><Input type="number" min="0" step="0.01" value={depthMeters} onChange={(event) => setDepthMeters(event.target.value)} /></label>
            <label className="commercial-map-setting-row is-full"><span><strong>Medida validada</strong><small>Ative somente com documento ou levantamento oficial</small></span><Switch checked={officialAreaValidated} onCheckedChange={setOfficialAreaValidated} disabled={!officialAreaSqm} /></label>
          </div>

          <div className="commercial-map-editor-section commercial-map-form-grid">
            <h3>Precificação inicial</h3>
            <label><span>Modelo</span><select value={pricingMode} onChange={(event) => setPricingMode(event.target.value as PricingMode)}><option value="NEGOTIABLE">A negociar</option><option value="FIXED_TOTAL">Valor total fixo</option><option value="PRICE_PER_SQUARE_METER">Preço por m²</option><option value="NOT_FOR_SALE">Fora de venda</option></select></label>
            {pricingMode === 'FIXED_TOTAL' && <label><span>Valor total</span><Input type="number" min="0" step="0.01" value={fixedTotal} onChange={(event) => setFixedTotal(event.target.value)} /></label>}
            {pricingMode === 'PRICE_PER_SQUARE_METER' && <label><span>Preço por m²</span><Input type="number" min="0" step="0.01" value={pricePerSqm} onChange={(event) => setPricePerSqm(event.target.value)} /></label>}
            <label><span>Preço mínimo</span><Input type="number" min="0" step="0.01" value={minimumPrice} onChange={(event) => setMinimumPrice(event.target.value)} /></label>
            {pricing.warning && <p className="commercial-map-form-warning is-full"><AlertCircle />{pricing.warning}</p>}
            {minimumPriceInvalid && <p className="commercial-map-form-warning is-full"><AlertCircle />O preço mínimo precisa ser válido e não pode superar o valor solicitado.</p>}
          </div>

          <div className="commercial-map-editor-section commercial-map-form-grid">
            <h3>Auditoria</h3>
            <label className="is-full"><span>Motivo / fonte *</span><Textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={2} /></label>
          </div>
          <div className="commercial-map-editor-footer">
            <Button variant="ghost" onClick={requestClose}>Cancelar</Button>
            <Button onClick={save} disabled={!requiredReady || lotCreation.isPending}>{lotCreation.isPending ? <Loader2 className="animate-spin" /> : <Save />}Cadastrar lote</Button>
          </div>
        </aside>
      </div>
    </div>
  );
}
