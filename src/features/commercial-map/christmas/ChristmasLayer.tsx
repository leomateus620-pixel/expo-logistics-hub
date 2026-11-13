import { Component, lazy, Suspense, useState, type ComponentProps, type ReactNode } from 'react';
import { useChristmasSession } from './christmasSession';
import { useCommercialMapStore } from '../state/useCommercialMapStore';
import type ChristmasExperience from './ChristmasExperience';

let runtime: Promise<typeof import('./ChristmasExperience')> | undefined;

function loadExperience() {
  return runtime ??= import('./ChristmasExperience').catch((error: unknown) => {
    runtime = undefined;
    throw Object.assign(new Error('Falha local ao carregar a passagem de Natal.'), { cause: error });
  });
}

class ChristmasBoundary extends Component<{ id: number; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { useChristmasSession.getState().greet(this.props.id); }
  render() { return this.state.failed ? null : this.props.children; }
}

export function ChristmasLayer({ reduced, ...props }: Omit<ComponentProps<typeof ChristmasExperience>, 'id'>) {
  const reducedGraphics = useCommercialMapStore(state => state.reducedGraphics);
  const id = useChristmasSession(state => state.id);
  const active = useChristmasSession(state => state.phase === 'preparing' || state.phase === 'flying');
  if (!active) return null;

  return <ChristmasRuntime key={id} {...props} id={id} reduced={reduced || reducedGraphics} />;
}

function ChristmasRuntime(props: ComponentProps<typeof ChristmasExperience>) {
  // Reset React.lazy's rejected result when the user starts a fresh session.
  const [Experience] = useState(() => lazy(loadExperience));
  return (
    <ChristmasBoundary id={props.id}>
      <Suspense fallback={null}><Experience {...props} /></Suspense>
    </ChristmasBoundary>
  );
}
