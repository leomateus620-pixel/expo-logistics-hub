import { useCommercialMapStore } from '../state/useCommercialMapStore';
import { useVisitStore } from '../visit/useVisitStore';
import { FenasojaHarvestIcon } from '../components/controls/FenasojaMapIcons';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useSoyHarvestStore } from './useSoyHarvestStore';

export function soyHarvestUnavailableReason() {
  const m=useCommercialMapStore.getState();
  if (useVisitStore.getState().enabled) return 'Encerre a visita para ver o ciclo.';
  if (m.lunarLaunchPhase!=='idle' || m.lunarLaunchReturning) return 'Aguarde o encerramento do foguete.';
  if (m.interiorEntityId) return 'Volte à área externa.';
  if (m.parkingInspectionOpen) return 'Feche a inspeção do estacionamento.';
  if (m.hydrologicalModeActive) return 'Saia do modo Rede Hidrológica.';
  if (m.salesPresentationActive) return 'Saia da apresentação de vendas.';
  if (m.workspaceMode!=='3d') return 'Abra o mapa 3D.';
  return null;
}

export function SoyHarvestButton({className=''}:{className?:string}) {
  // Subscribe to discrete modes only; never to navigation or the playback clock.
  useCommercialMapStore(s=>[s.parkingInspectionOpen,s.hydrologicalModeActive,s.salesPresentationActive,s.interiorEntityId,s.lunarLaunchPhase,s.lunarLaunchReturning,s.workspaceMode].join('|'));
  useVisitStore(s=>s.enabled);
  const active=useSoyHarvestStore(s=>s.enabled || s.status==='restoring');
  const reason=soyHarvestUnavailableReason();
  return <Tooltip><TooltipTrigger asChild><button type="button" aria-label="Ver ciclo da soja"
    title={reason ?? 'Plantio, crescimento, colheita e transporte'} aria-disabled={Boolean(reason)||active}
    className={`${className} ${active?'is-active':''}`} data-commercial-map-control="soy-harvest"
    onClick={()=>{if(!soyHarvestUnavailableReason() && !active)useSoyHarvestStore.getState().requestStart();}}>
    <FenasojaHarvestIcon aria-hidden="true" />
  </button></TooltipTrigger><TooltipContent>{reason ?? 'Plantio, crescimento, colheita e transporte'}</TooltipContent></Tooltip>;
}
