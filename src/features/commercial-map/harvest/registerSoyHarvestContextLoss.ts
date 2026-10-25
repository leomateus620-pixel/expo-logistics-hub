import { useSoyHarvestStore } from './useSoyHarvestStore';

/** The existing map renderer owns WebGL recovery. Release only the local cycle
 * and its clock when that context is lost, so playback cannot advance unseen. */
export function registerSoyHarvestContextLoss(canvas: HTMLCanvasElement) {
  const lost = () => {
    const state = useSoyHarvestStore.getState();
    if (!state.enabled && state.fieldState !== 'harvested') return;
    state.fail('A demonstração foi interrompida pela conexão gráfica. Após a restauração do mapa, tente novamente.');
  };
  canvas.addEventListener('webglcontextlost', lost);
  return () => canvas.removeEventListener('webglcontextlost', lost);
}
