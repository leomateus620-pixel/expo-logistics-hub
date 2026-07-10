import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ImagePlus, Loader2, LockKeyhole, Move, RotateCw, Ruler, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useCurrentOrg } from '@/hooks/useCurrentOrg';
import { calibrationScale } from '../../utils/geometry';
import { useMapMutations } from '../../hooks/useCommercialMap';
import { useCommercialMapStore } from '../../state/useCommercialMapStore';
import type { Coordinate, MapCalibration, MapProject } from '../../types';

function CoordinateFields({ label, value, onChange }: { label: string; value: Coordinate; onChange: (value: Coordinate) => void }) {
  return (
    <fieldset className="commercial-map-calibration-point">
      <legend>{label}</legend>
      <label><span>X</span><Input type="number" step="0.01" value={value[0]} onChange={(event) => onChange([Number(event.target.value), value[1]])} /></label>
      <label><span>Y</span><Input type="number" step="0.01" value={value[1]} onChange={(event) => onChange([value[0], Number(event.target.value)])} /></label>
    </fieldset>
  );
}

export function CalibrationPanel({ project, calibration }: { project: MapProject; calibration: MapCalibration | null }) {
  const setActivePanel = useCommercialMapStore((state) => state.setActivePanel);
  const { orgId } = useCurrentOrg();
  const { calibration: calibrationMutation, referenceUpload } = useMapMutations();
  const [pointA, setPointA] = useState<Coordinate>(calibration?.pointA ?? [-10, 0]);
  const [pointB, setPointB] = useState<Coordinate>(calibration?.pointB ?? [10, 0]);
  const [knownDistance, setKnownDistance] = useState(calibration?.knownDistanceMeters ?? 0);
  const [opacity, setOpacity] = useState(calibration?.opacity ?? 0.28);
  const [isLocked, setIsLocked] = useState(calibration?.isLocked ?? true);
  const [imageOffsetX, setImageOffsetX] = useState(calibration?.imageOffsetX ?? 0);
  const [imageOffsetY, setImageOffsetY] = useState(calibration?.imageOffsetY ?? 0);
  const [imageScaleX, setImageScaleX] = useState(calibration?.imageScaleX ?? 1);
  const [imageScaleY, setImageScaleY] = useState(calibration?.imageScaleY ?? 1);
  const [imageRotationDegrees, setImageRotationDegrees] = useState(calibration?.imageRotationDegrees ?? 0);
  const [referencePath, setReferencePath] = useState(calibration?.referenceImagePath ?? null);
  const [reason, setReason] = useState('Calibração da base cartográfica');
  const scale = useMemo(() => calibrationScale(pointA, pointB, knownDistance), [knownDistance, pointA, pointB]);
  const pending = calibrationMutation.isPending || referenceUpload.isPending;
  const isReferenceProject = project.id.startsWith('reference:');

  const upload = async (file: File | null) => {
    if (!file || !orgId || isReferenceProject) return;
    try {
      const path = await referenceUpload.mutateAsync({ orgId, projectId: project.id, file });
      setReferencePath(path);
    } catch {
      // Keep the current reference after the upload toast reports the error.
    }
  };

  const save = async (status: 'UNVALIDATED' | 'VALIDATED' | 'INVALIDATED') => {
    if (isReferenceProject) return;
    try {
      await calibrationMutation.mutateAsync({
        projectId: project.id,
        referenceImagePath: referencePath,
        opacity,
        isLocked,
        imageOffsetX,
        imageOffsetY,
        imageScaleX,
        imageScaleY,
        imageRotationDegrees,
        pointA,
        pointB,
        knownDistanceMeters: knownDistance || null,
        mapUnitsPerMeter: status === 'VALIDATED' ? scale : null,
        status,
        reason,
      });
      setActivePanel(null);
    } catch {
      // Keep calibration inputs available for correction after the toast feedback.
    }
  };

  return (
    <aside className="commercial-map-panel commercial-map-calibration-panel">
      <div className="commercial-map-panel-header">
        <div><span>Controle metrológico</span><h2>Calibração do mapa</h2></div>
        <button type="button" onClick={() => setActivePanel(null)} aria-label="Fechar painel"><X className="h-4 w-4" /></button>
      </div>
      <div className="commercial-map-calibration-content">
        <div className={`commercial-map-calibration-status ${calibration?.status === 'VALIDATED' ? 'is-valid' : ''}`}>
          {calibration?.status === 'VALIDATED' ? <CheckCircle2 /> : <AlertTriangle />}
          <span><strong>{calibration?.status === 'VALIDATED' ? 'Calibração validada' : 'Geometria não calibrada'}</strong><small>{calibration?.status === 'VALIDATED' ? `Versão ${calibration.version} · ${calibration.mapUnitsPerMeter?.toFixed(4)} un/m` : 'Áreas calculadas ainda não são medidas oficiais.'}</small></span>
        </div>

        <div className="commercial-map-editor-section">
          <h3>Imagem de referência</h3>
          <Label htmlFor="map-reference"><ImagePlus />Arquivo oficial</Label>
          <Input id="map-reference" type="file" accept="image/jpeg,image/png,image/webp" disabled={isReferenceProject || pending} onChange={(event) => upload(event.target.files?.[0] ?? null)} />
          {referencePath && <p className="commercial-map-calibration-path">Referência privada vinculada ao projeto.</p>}
          <div className="commercial-map-setting-slider">
            <span>Opacidade</span><Slider value={[opacity * 100]} min={5} max={90} step={5} onValueChange={([value]) => setOpacity(value / 100)} /><b>{Math.round(opacity * 100)}%</b>
          </div>
          <label className="commercial-map-setting-row"><span><strong>Bloquear referência</strong><small>Evita deslocamento acidental</small></span><Switch checked={isLocked} onCheckedChange={setIsLocked} /></label>
          <div className="commercial-map-calibration-transform">
            <label><span><Move />Deslocamento X</span><Input type="number" step="0.1" value={imageOffsetX} disabled={isLocked} onChange={(event) => setImageOffsetX(Number(event.target.value))} /></label>
            <label><span><Move />Deslocamento Y</span><Input type="number" step="0.1" value={imageOffsetY} disabled={isLocked} onChange={(event) => setImageOffsetY(Number(event.target.value))} /></label>
            <label><span>Escala X</span><Input type="number" min="0.1" step="0.01" value={imageScaleX} disabled={isLocked} onChange={(event) => setImageScaleX(Math.max(.1, Number(event.target.value)))} /></label>
            <label><span>Escala Y</span><Input type="number" min="0.1" step="0.01" value={imageScaleY} disabled={isLocked} onChange={(event) => setImageScaleY(Math.max(.1, Number(event.target.value)))} /></label>
            <label className="is-full"><span><RotateCw />Rotação em graus</span><Input type="number" step="0.1" value={imageRotationDegrees} disabled={isLocked} onChange={(event) => setImageRotationDegrees(Number(event.target.value))} /></label>
          </div>
        </div>

        <div className="commercial-map-editor-section">
          <h3>Escala conhecida</h3>
          <p className="commercial-map-section-description">Informe dois pontos do sistema local e a distância oficial entre eles. A escala é versionada e todas as áreas poderão ser recalculadas.</p>
          <div className="commercial-map-calibration-points"><CoordinateFields label="Ponto A" value={pointA} onChange={setPointA} /><CoordinateFields label="Ponto B" value={pointB} onChange={setPointB} /></div>
          <Label htmlFor="known-distance"><Ruler />Distância oficial em metros</Label>
          <Input id="known-distance" type="number" min="0" step="0.01" value={knownDistance || ''} onChange={(event) => setKnownDistance(Number(event.target.value))} placeholder="Ex.: 50" />
          <div className="commercial-map-calibration-result"><span>Conversão calculada</span><strong>{scale ? `${scale.toFixed(6)} unidades por metro` : 'Informe pontos e distância válidos'}</strong></div>
        </div>

        <div className="commercial-map-editor-section">
          <Label htmlFor="calibration-reason"><LockKeyhole />Motivo / fonte da calibração</Label>
          <Textarea id="calibration-reason" value={reason} onChange={(event) => setReason(event.target.value)} rows={3} />
        </div>

        {isReferenceProject && <div className="commercial-map-editor-reference-warning"><AlertTriangle /><p><strong>Importe a base primeiro</strong>A calibração só pode ser validada dentro de um projeto persistido e auditável.</p></div>}
        <div className="commercial-map-calibration-actions">
          {calibration?.status === 'VALIDATED' && <Button variant="destructive" onClick={() => save('INVALIDATED')} disabled={pending || isReferenceProject || !reason.trim()}>Invalidar calibração</Button>}
          <Button variant="outline" onClick={() => save('UNVALIDATED')} disabled={pending || isReferenceProject}>Salvar sem validar</Button>
          <Button onClick={() => save('VALIDATED')} disabled={pending || isReferenceProject || !scale || !reason.trim()}>{pending && <Loader2 className="animate-spin" />}Validar calibração</Button>
        </div>
      </div>
    </aside>
  );
}
