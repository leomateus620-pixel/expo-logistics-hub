import { Component, useEffect, type ReactNode } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { publishSoyHarvestCamera } from './SoyHarvestCamera';
import { advanceSoyHarvestClock, useSoyHarvestStore } from './useSoyHarvestStore';
import { SoyHarvestScene } from './SoyHarvestScene';
import { registerSoyHarvestContextLoss } from './registerSoyHarvestContextLoss';

class SoySceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) {
    console.error('Soy harvest scene failed', error);
    useSoyHarvestStore.getState().fail('Não foi possível preparar a demonstração. O mapa continua disponível.');
  }
  render() { return this.state.failed ? null : this.props.children; }
}

function SoyHarvestRuntime() {
  const canvas = useThree(state => state.gl.domElement);
  useEffect(() => registerSoyHarvestContextLoss(canvas), [canvas]);
  const invalidate = useThree(state => state.invalidate);
  const size = useThree(state => state.size);
  const status = useSoyHarvestStore(state => state.status);
  const session = useSoyHarvestStore(state => state.session);
  useEffect(() => { invalidate(); }, [invalidate, status, session]);
  useFrame(() => {
    const state = useSoyHarvestStore.getState();
    if (state.status === 'loading') {
      // The scene starts playback only after its local shader preparation resolves.
      return;
    }
    const time = advanceSoyHarvestClock(performance.now());
    if (state.enabled) publishSoyHarvestCamera(time, state.reducedMotion, size.width < size.height);
    if (useSoyHarvestStore.getState().status === 'running') invalidate();
  }, -3);
  return <SoyHarvestScene />;
}

/** Only imported after the explicit toolbar command. No preload or global warmup. */
export default function SoyHarvestExperience() {
  const session = useSoyHarvestStore(state => state.session);
  const status = useSoyHarvestStore(state => state.status);
  const fieldState = useSoyHarvestStore(state => state.fieldState);
  if ((status === 'idle' || status === 'error' || status === 'restoring') && fieldState !== 'harvested') return null;
  return <SoySceneBoundary key={session}><SoyHarvestRuntime /></SoySceneBoundary>;
}
