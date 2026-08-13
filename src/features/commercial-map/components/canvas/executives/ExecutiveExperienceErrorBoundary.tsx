import { Component, type ErrorInfo, type ReactNode } from 'react';
import { resetExecutiveExperienceState } from './executiveExperienceState';

interface ExecutiveExperienceErrorBoundaryProps {
  children: ReactNode;
}

interface ExecutiveExperienceErrorBoundaryState {
  failed: boolean;
}

/**
 * Keeps a rejected GLB or malformed animation local to the optional executive
 * layer. React can then preserve the Commercial Map scene, camera and lots.
 */
export class ExecutiveExperienceErrorBoundary extends Component<
  ExecutiveExperienceErrorBoundaryProps,
  ExecutiveExperienceErrorBoundaryState
> {
  state: ExecutiveExperienceErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): ExecutiveExperienceErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    resetExecutiveExperienceState(false);
    if (import.meta.env.DEV) {
      console.warn(
        'A camada opcional de personagens executivos foi desativada após falha de asset.',
        error,
        info.componentStack,
      );
    }
  }

  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}
