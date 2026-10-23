import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronDown, Loader2, MapPinned, RefreshCw, ZoomIn, ZoomOut } from 'lucide-react';
import { z } from 'zod';
import { commercialReportInventorySchema, commercialReportSnapshotSchema } from '@/lib/workers/commercial-report';
import { buildReportPlan, buildReportPlanGroups } from '@/lib/workers/report-plan';
import { COMMERCIAL_PHASES, STATUS_CONFIG } from '@/features/commercial-map/constants';
import { toCommercialPhase } from '@/features/commercial-map/types';
import type { WorkerResponseBlock } from '../../../../supabase/functions/_shared/workers/response-contract';
import { CommercialReportError, readCommercialPlan } from '../commercial-reports-api';
import '../styles/commercial-reports.css';

type InventoryLot = z.infer<typeof commercialReportInventorySchema>;
const planSchema = z.object({ snapshotId: z.string().uuid(), generation: z.string().min(1).max(180), inventory: z.array(commercialReportInventorySchema).max(100000),
  planOutlines: commercialReportSnapshotSchema.shape.planOutlines.default([]), calibration: commercialReportSnapshotSchema.shape.calibration.optional() }).strip();
type Plan = z.infer<typeof planSchema>;
type PlanBlock = Extract<WorkerResponseBlock, { type?: 'commercial_plan' }>;
const signatureLabel: Record<string, string> = { signed: 'Assinatura confirmada', pending: 'Aguardando assinatura', legacy: 'Legado sem comprovação', cancelled: 'Cancelado', inconsistent: 'Vínculo em conferência' };

export function WorkerCommercialPlan({ block, orgId }: { block: PlanBlock; orgId: string }) {
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [markers, setMarkers] = useState(false);
  const id = useId();
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    setPlan(null); setFailure(null); setZoom(1);
  }, [block.snapshotId, block.generation]);
  useEffect(() => {
    if (!open) return;
    const current = new AbortController(); controller.current = current;
    setLoading(true); setFailure(null);
    void readCommercialPlan({ orgId, snapshotId: block.snapshotId }, current.signal).then(value => {
      if (current.signal.aborted) return;
      const result = planSchema.safeParse(value);
      if (!result.success || result.data.snapshotId !== block.snapshotId || result.data.generation !== block.generation) throw new CommercialReportError('invalid_response');
      setPlan(result.data);
    }).catch(cause => {
      if (!current.signal.aborted) { setPlan(null); setFailure(cause instanceof CommercialReportError ? cause.message : 'Não foi possível validar a planta desta consulta. Tente novamente.'); }
    }).finally(() => { if (!current.signal.aborted) setLoading(false); });
    return () => current.abort();
  }, [open, attempt, orgId, block.snapshotId, block.generation]);

  const { geometry, numberLabel } = useMemo(() => buildReportPlan(plan?.inventory ?? [], plan?.planOutlines ?? []), [plan]);
  const groups = useMemo(() => buildReportPlanGroups(plan?.inventory ?? []), [plan]);
  const markerByLot = useMemo(() => new Map(groups.flatMap(group => group.lots.map(lot => [lot.lotId, group.marker] as const))), [groups]);
  const missingGeometry = plan ? plan.inventory.length - geometry.lots.length : block.missingGeometryCount;
  const ambiguousLots = plan?.inventory.filter(lot => lot.associations.length > 1).length ?? 0;
  const [viewX, viewY, viewWidth, viewHeight] = geometry.viewBox.split(' ').map(Number);
  const metricScale = plan?.calibration?.status === 'VALIDATED' ? plan.calibration.mapUnitsPerMeter * geometry.scale : null;
  const targetMeters = metricScale ? viewWidth / 6 / metricScale : null;
  const scalePower = targetMeters ? 10 ** Math.floor(Math.log10(targetMeters)) : 1;
  const scaleMeters = targetMeters ? [5, 2, 1].map(n => n * scalePower).find(n => n <= targetMeters) ?? scalePower : null;
  const scaleLength = scaleMeters && metricScale ? scaleMeters * metricScale : null;
  const viewBox = scaleLength ? `${viewX} ${viewY} ${viewWidth} ${viewHeight + 44}` : geometry.viewBox;

  return <details className="worker-commercial-plan" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary><MapPinned size={20} aria-hidden="true" /><span><strong>Ver planta 2D</strong><small>{block.scopeLabels.join(' · ')} · {block.lotCount.toLocaleString('pt-BR')} espaços</small></span><ChevronDown size={16} aria-hidden="true" /></summary>
    <div className="worker-commercial-plan__body">
      <p id={`${id}-description`}>{block.title}. Geometria e ocupação da mesma consulta. Identificação comercial e assinatura são apresentadas na correspondência abaixo.</p>
      {loading && <p role="status"><Loader2 size={15} className="worker-commercial-spin" aria-hidden="true" /> Consultando a planta autorizada…</p>}
      {failure && <><p role="alert">{failure}</p><button type="button" className="worker-button worker-button--quiet" onClick={() => setAttempt(value => value + 1)}><RefreshCw size={15} />Tentar novamente</button></>}
      {plan && !loading && <>
        {missingGeometry > 0 && <p>{missingGeometry.toLocaleString('pt-BR')} espaços sem geometria válida. Cobertura incompleta da planta.</p>}
        {ambiguousLots > 0 && <p>{ambiguousLots.toLocaleString('pt-BR')} espaços com associação ambígua. Nenhuma empresa foi escolhida para seus marcadores.</p>}
        {geometry.lots.length ? <>
          <div className="worker-commercial-plan__controls"><button type="button" className="worker-icon-button" aria-label="Reduzir planta" disabled={zoom === 1} onClick={() => setZoom(value => Math.max(1, value - 1))}><ZoomOut size={17} /></button><span>{zoom}×</span><button type="button" className="worker-icon-button" aria-label="Ampliar planta" disabled={zoom === 4} onClick={() => setZoom(value => Math.min(4, value + 1))}><ZoomIn size={17} /></button>{groups.length > 0 && <label><input type="checkbox" checked={markers} onChange={event => setMarkers(event.target.checked)} />Marcadores de empresas</label>}</div>
          <div className="worker-commercial-plan__canvas" role="region" tabIndex={0} aria-label="Planta com rolagem e ampliação"><svg role="img" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} viewBox={viewBox} style={{ width: `${zoom * 100}%`, maxHeight: `${zoom * 560}px` }}><title id={`${id}-title`}>{block.title}</title>{geometry.outlines.map(outline => <path key={outline.id} d={outline.path} fill="none" stroke={outline.color} strokeWidth={1.5} strokeDasharray={outline.kind === 'support' ? '3 3' : undefined} vectorEffect="non-scaling-stroke"><title>{outline.label}</title></path>)}{geometry.lots.map(shape => {
            const phase = toCommercialPhase(shape.lot.status); const config = STATUS_CONFIG[phase];
            const marker = markerByLot.get(shape.lot.id);
            const label = (shape.lot.lotNumber ?? 'S/N') + (markers && marker ? ` [${marker}]` : '');
            const fit = numberLabel(label, shape.labelWidth, shape.labelHeight, .8 * zoom, 13);
            return <g key={shape.lot.id}><title>{shape.lot.displayName} · {config.label}{marker ? ` · Marcador ${marker}` : ''}</title><path d={shape.path} fill={config.color} stroke={config.border} strokeWidth={1} vectorEffect="non-scaling-stroke" fillRule="evenodd" /><text x={shape.labelPoint[0]} y={shape.labelPoint[1]} textAnchor="middle" dominantBaseline="central" fontSize={fit.fontSize} fontWeight={600} fill={phase === 'SOLD' || phase === 'BLOCKED' ? '#fff' : '#102238'} transform={fit.vertical ? `rotate(-90 ${shape.labelPoint[0]} ${shape.labelPoint[1]})` : undefined}>{label}</text></g>;
          })}{geometry.outlines.filter(outline => outline.kind === 'support').map(outline => <text key={`reference-${outline.id}`} x={outline.labelPoint[0]} y={outline.labelPoint[1]} fontSize={11} textAnchor="middle" fill="#102238" stroke="#fff" strokeWidth={2} paintOrder="stroke">{outline.label}</text>)}{scaleLength && <g fill="#102238" stroke="#102238"><path d={`M${viewX + 20} ${viewY + viewHeight + 12}v6h${scaleLength}v-6`} strokeWidth={1.5} fill="none" /><text x={viewX + 20 + scaleLength / 2} y={viewY + viewHeight + 35} textAnchor="middle" stroke="none" fontSize={13}>{scaleMeters.toLocaleString('pt-BR')} m</text></g>}</svg></div>
          <ul className="worker-commercial-plan__legend" aria-label="Legenda da situação comercial">{COMMERCIAL_PHASES.map(status => <li key={status}><i style={{ background: STATUS_CONFIG[status].color }} aria-hidden="true" />{STATUS_CONFIG[status].symbol} {STATUS_CONFIG[status].label}</li>)}</ul>
          <p>Orientação: eixos do cadastro. {scaleLength ? 'Escala gráfica calculada com a calibração validada.' : 'Escala métrica não comprovada nesta prévia.'} “Vendido” no mapa pode incluir legado sem comprovação de assinatura.</p>
        </> : <p>A geometria deste recorte não está disponível.</p>}
        {groups.length > 0 ? <div className="worker-commercial-plan__key" role="region" tabIndex={0} aria-label="Correspondência dos marcadores"><table><caption>Empresas e espaços da planta</caption><thead><tr><th scope="col">Marcador</th><th scope="col">Empresa / expositor</th><th scope="col">Espaços</th><th scope="col">Assinatura</th></tr></thead><tbody>{groups.map(group => <tr key={group.key}><td>{group.marker}</td><td>{group.name}</td><td>{group.lots.map(lot => lot.lotLabel).join(', ')}</td><td>{[...group.states].map(state => signatureLabel[state.toLowerCase()] ?? 'Vínculo em conferência').join(' · ')}</td></tr>)}</tbody></table></div> : <p>A identificação empresarial desta planta está ausente ou restrita. Isso não significa ausência de ocupação.</p>}
      </>}
    </div>
  </details>;
}
