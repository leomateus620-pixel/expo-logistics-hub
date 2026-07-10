import { useMemo, useState } from 'react';
import { AlertTriangle, Combine, Loader2, Scissors, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { useMapMutations } from '../../hooks/useCommercialMap';
import { useCommercialMapStore } from '../../state/useCommercialMapStore';
import type { CommercialLot, Coordinate, MapEntity } from '../../types';
import { mergeAdjacentPolygons, polygonAreaMapUnits, splitPolygonByLine, withoutClosingPoint } from '../../utils/geometry';

export type LotStructureOperation = 'split' | 'merge' | null;

interface Props {
  operation: LotStructureOperation;
  lot: CommercialLot;
  entity: MapEntity;
  entities: MapEntity[];
  lots: CommercialLot[];
  onClose: () => void;
}

const number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

export function LotStructureDialog({ operation, lot, entity, entities, lots, onClose }: Props) {
  const { split, merge } = useMapMutations();
  const setSelectedEntityId = useCommercialMapStore((state) => state.setSelectedEntityId);
  const [axis, setAxis] = useState<'vertical' | 'horizontal'>('vertical');
  const [position, setPosition] = useState(50);
  const [firstIdentifier, setFirstIdentifier] = useState(`${lot.publicIdentifier}-A`);
  const [firstName, setFirstName] = useState(`${lot.displayName} A`);
  const [secondIdentifier, setSecondIdentifier] = useState(`${lot.publicIdentifier}-B`);
  const [secondName, setSecondName] = useState(`${lot.displayName} B`);
  const [mergeEntityId, setMergeEntityId] = useState('');
  const [mergedIdentifier, setMergedIdentifier] = useState(`${lot.publicIdentifier}-M`);
  const [mergedName, setMergedName] = useState(`${lot.displayName} mesclado`);
  const [reason, setReason] = useState('Reorganização estrutural do lote');

  const bounds = useMemo(() => {
    const points = withoutClosingPoint(entity.geometry.coordinates[0] ?? []);
    const xs = points.map(([x]) => x);
    const ys = points.map(([, y]) => y);
    return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  }, [entity.geometry.coordinates]);

  const splitPreview = useMemo(() => {
    const ratio = position / 100;
    let line: [Coordinate, Coordinate];
    if (axis === 'vertical') {
      const x = bounds.minX + (bounds.maxX - bounds.minX) * ratio;
      line = [[x, bounds.minY - 10], [x, bounds.maxY + 10]];
    } else {
      const y = bounds.minY + (bounds.maxY - bounds.minY) * ratio;
      line = [[bounds.minX - 10, y], [bounds.maxX + 10, y]];
    }
    return { line, geometries: splitPolygonByLine(entity.geometry, ...line) };
  }, [axis, bounds, entity.geometry, position]);

  const lotByEntity = useMemo(() => new Map(lots.map((candidate) => [candidate.entityId, candidate])), [lots]);
  const mergeCandidates = useMemo(() => entities.flatMap((candidate) => {
    if (candidate.id === entity.id || candidate.classification !== entity.classification) return [];
    const candidateLot = lotByEntity.get(candidate.id);
    if (!candidateLot || !['AVAILABLE', 'BLOCKED', 'UNAVAILABLE'].includes(candidateLot.status)) return [];
    const geometry = mergeAdjacentPolygons(entity.geometry, candidate.geometry);
    return geometry ? [{ entity: candidate, lot: candidateLot, geometry }] : [];
  }), [entities, entity, lotByEntity]);
  const selectedMerge = mergeCandidates.find((candidate) => candidate.entity.id === mergeEntityId) ?? null;
  const pending = split.isPending || merge.isPending;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      if (operation === 'split' && splitPreview.geometries) {
        const result = await split.mutateAsync({
          sourceLotId: lot.id,
          firstIdentifier: firstIdentifier.trim(),
          firstName: firstName.trim(),
          firstGeometry: splitPreview.geometries[0],
          secondIdentifier: secondIdentifier.trim(),
          secondName: secondName.trim(),
          secondGeometry: splitPreview.geometries[1],
          reason: reason.trim(),
        });
        setSelectedEntityId(result.entityIds[0]);
      }
      if (operation === 'merge' && selectedMerge) {
        const result = await merge.mutateAsync({
          sourceLotIds: [lot.id, selectedMerge.lot.id],
          publicIdentifier: mergedIdentifier.trim(),
          displayName: mergedName.trim(),
          geometry: selectedMerge.geometry,
          reason: reason.trim(),
        });
        setSelectedEntityId(result.entityId);
      }
      onClose();
    } catch {
      // The mutation keeps the dialog open and reports the server reason in a toast.
    }
  };

  const ready = operation === 'split'
    ? Boolean(splitPreview.geometries && firstIdentifier.trim() && firstName.trim() && secondIdentifier.trim() && secondName.trim() && reason.trim())
    : Boolean(selectedMerge && mergedIdentifier.trim() && mergedName.trim() && reason.trim());

  return (
    <Dialog open={Boolean(operation)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[780px]">
        <form onSubmit={submit}>
          <DialogHeader>
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              {operation === 'split' ? <Scissors className="h-5 w-5" /> : <Combine className="h-5 w-5" />}
            </div>
            <DialogTitle>{operation === 'split' ? `Dividir ${lot.publicIdentifier}` : `Mesclar ${lot.publicIdentifier}`}</DialogTitle>
            <DialogDescription>
              A operação arquiva a geometria anterior e cria lotes bloqueados para revisão. Áreas, preços e contratos nunca são duplicados automaticamente.
            </DialogDescription>
          </DialogHeader>

          <div className="my-5 grid gap-5 md:grid-cols-[minmax(0,1.05fr)_minmax(260px,.95fr)]">
            <div className="commercial-map-structure-preview">
              <svg viewBox="-60 -33.75 120 67.5" aria-label="Pré-visualização da operação estrutural">
                <polygon points={withoutClosingPoint(entity.geometry.coordinates[0]).map(([x, y]) => `${x},${y}`).join(' ')} className="source-polygon" />
                {operation === 'split' && splitPreview.geometries?.map((geometry, index) => (
                  <polygon key={index} points={withoutClosingPoint(geometry.coordinates[0]).map(([x, y]) => `${x},${y}`).join(' ')} className={`result-polygon result-${index + 1}`} />
                ))}
                {operation === 'split' && <line x1={splitPreview.line[0][0]} y1={splitPreview.line[0][1]} x2={splitPreview.line[1][0]} y2={splitPreview.line[1][1]} />}
                {operation === 'merge' && selectedMerge && (
                  <polygon points={withoutClosingPoint(selectedMerge.geometry.coordinates[0]).map(([x, y]) => `${x},${y}`).join(' ')} className="result-polygon merged" />
                )}
              </svg>
              <div>
                {operation === 'split' && splitPreview.geometries ? (
                  <><span>{number.format(polygonAreaMapUnits(splitPreview.geometries[0]))} un²</span><span>{number.format(polygonAreaMapUnits(splitPreview.geometries[1]))} un²</span></>
                ) : operation === 'merge' && selectedMerge ? (
                  <span>{number.format(polygonAreaMapUnits(selectedMerge.geometry))} un² cartográficas</span>
                ) : (
                  <span>Selecione uma configuração topologicamente válida.</span>
                )}
              </div>
            </div>

            <div className="grid content-start gap-4">
              {operation === 'split' ? (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <Button type="button" variant={axis === 'vertical' ? 'default' : 'outline'} onClick={() => setAxis('vertical')}>Corte vertical</Button>
                    <Button type="button" variant={axis === 'horizontal' ? 'default' : 'outline'} onClick={() => setAxis('horizontal')}>Corte horizontal</Button>
                  </div>
                  <div className="space-y-2"><Label>Posição da linha divisória</Label><Slider min={15} max={85} step={1} value={[position]} onValueChange={([value]) => setPosition(value)} /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="space-y-1"><Label>Identificador A *</Label><Input value={firstIdentifier} onChange={(event) => setFirstIdentifier(event.target.value)} /></label>
                    <label className="space-y-1"><Label>Nome A *</Label><Input value={firstName} onChange={(event) => setFirstName(event.target.value)} /></label>
                    <label className="space-y-1"><Label>Identificador B *</Label><Input value={secondIdentifier} onChange={(event) => setSecondIdentifier(event.target.value)} /></label>
                    <label className="space-y-1"><Label>Nome B *</Label><Input value={secondName} onChange={(event) => setSecondName(event.target.value)} /></label>
                  </div>
                </>
              ) : (
                <>
                  <label className="space-y-1"><Label>Lote adjacente *</Label><select value={mergeEntityId} onChange={(event) => setMergeEntityId(event.target.value)}><option value="">Selecione um limite compartilhado</option>{mergeCandidates.map((candidate) => <option key={candidate.entity.id} value={candidate.entity.id}>{candidate.lot.publicIdentifier} · {candidate.lot.displayName}</option>)}</select></label>
                  {!mergeCandidates.length && <div className="commercial-map-form-warning"><AlertTriangle />Nenhum lote adjacente e compatível está disponível para mesclagem.</div>}
                  <label className="space-y-1"><Label>Novo identificador *</Label><Input value={mergedIdentifier} onChange={(event) => setMergedIdentifier(event.target.value)} /></label>
                  <label className="space-y-1"><Label>Novo nome *</Label><Input value={mergedName} onChange={(event) => setMergedName(event.target.value)} /></label>
                </>
              )}
              <label className="space-y-1"><Label>Motivo / documento de origem *</Label><Textarea rows={3} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
              <div className="commercial-map-structure-guard"><ShieldCheck /><span><strong>Validação dupla</strong>O navegador antecipa o resultado; o PostGIS confirma união, adjacência e sobreposição dentro da transação.</span></div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>Cancelar</Button>
            <Button type="submit" disabled={!ready || pending}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}{operation === 'split' ? 'Confirmar divisão' : 'Confirmar mesclagem'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
