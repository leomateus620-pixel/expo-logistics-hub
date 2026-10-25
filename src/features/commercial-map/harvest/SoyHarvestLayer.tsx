import { Component, Suspense, lazy, useMemo, type ReactNode } from 'react';
import { SoyFieldStaticLayer } from '../components/canvas/SoyFieldStaticLayer';
import { useSoyHarvestStore } from './useSoyHarvestStore';

let runtime: Promise<typeof import('./SoyHarvestExperience')> | null = null;
const loadRuntime = () => runtime ??= import('./SoyHarvestExperience').catch(error => {
  runtime = null;
  // A failed optional chunk must not reach main.tsx's whole-app chunk-reload
  // heuristic. Preserve the cause for diagnosis, expose a local failure only.
  throw Object.assign(new Error('Falha local ao carregar a demonstração de soja.'), { cause: error });
});
class LocalBoundary extends Component<{children: ReactNode}, {failed:boolean}> {
  state={failed:false};
  static getDerivedStateFromError() { return {failed:true}; }
  componentDidCatch() { useSoyHarvestStore.getState().fail('Não foi possível preparar o ciclo. Tente novamente.'); }
  render() { return this.state.failed ? null : this.props.children; }
}

/** The chunk is requested only when a user has explicitly started this session.
 * The field stays outside the boundary: a failed machine cannot remove the map. */
export function SoyHarvestLayer({isolated=false}:{isolated?:boolean}) {
  const status=useSoyHarvestStore(s=>s.status);
  const fieldState=useSoyHarvestStore(s=>s.fieldState);
  const session=useSoyHarvestStore(s=>s.session);
  const Runtime=useMemo(()=>lazy(loadRuntime),[session]);
  const showRuntime=status==='loading'||status==='running'||status==='paused'||fieldState==='harvested';
  return <>
    <SoyFieldStaticLayer isolatedSupport={isolated}/>
    {showRuntime && <LocalBoundary key={session}><Suspense fallback={null}><Runtime/></Suspense></LocalBoundary>}
  </>;
}
