import { Component, lazy, Suspense, useMemo, type ComponentProps, type ReactNode } from 'react';
import { useChristmasSession } from './christmasSession';
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

export function ChristmasLayer(props: Omit<ComponentProps<typeof ChristmasExperience>, 'id'>) {
  const id = useChristmasSession(state => state.id);
  const active = useChristmasSession(state => state.phase === 'preparing' || state.phase === 'flying');
  const Experience = useMemo(() => lazy(loadExperience), [id]);
  if (!active) return null;

  return (
    <ChristmasBoundary id={id} key={id}>
      <Suspense fallback={null}><Experience {...props} id={id} /></Suspense>
    </ChristmasBoundary>
  );
}
