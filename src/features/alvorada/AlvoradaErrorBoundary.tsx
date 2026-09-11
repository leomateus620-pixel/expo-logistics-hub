import { Component, type ErrorInfo, type ReactNode } from 'react';

interface AlvoradaErrorBoundaryProps {
  children: ReactNode;
  fallback: ReactNode;
  onError: () => void;
}

interface AlvoradaErrorBoundaryState {
  failed: boolean;
}

/** Converts a WebGL render failure into the caller's fallback presentation. */
export class AlvoradaErrorBoundary extends Component<
  AlvoradaErrorBoundaryProps,
  AlvoradaErrorBoundaryState
> {
  state: AlvoradaErrorBoundaryState = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.onError();
    if (import.meta.env.DEV) {
      console.warn('A experiência Alvorada ativou o fallback WebGL.', error, info.componentStack);
    }
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** CSS-only sunrise used when no WebGL frame can be presented. */
export function AlvoradaFallback({ recovering = false }: { recovering?: boolean }) {
  return (
    <div
      className="alvorada-fallback"
      data-testid="alvorada-fallback"
      role="img"
      aria-label={recovering
        ? 'Recuperando a Alvorada de Santa Rosa'
        : 'Alvorada de Santa Rosa'}
    >
      <div className="alvorada-fallback__sun" aria-hidden="true" />
      <div className="alvorada-fallback__cloud alvorada-fallback__cloud--one" aria-hidden="true" />
      <div className="alvorada-fallback__cloud alvorada-fallback__cloud--two" aria-hidden="true" />
      <div className="alvorada-fallback__horizon" aria-hidden="true" />
    </div>
  );
}
