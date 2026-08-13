import { Component, type ReactNode } from 'react';

interface SeatedExecutiveErrorBoundaryProps {
  children: ReactNode;
}

interface SeatedExecutiveErrorBoundaryState {
  failed: boolean;
}

/** A missing or malformed optional character asset must never unmount B12. */
export class SeatedExecutiveErrorBoundary extends Component<
  SeatedExecutiveErrorBoundaryProps,
  SeatedExecutiveErrorBoundaryState
> {
  state: SeatedExecutiveErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): SeatedExecutiveErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch() {
    // The visual layer intentionally degrades to null; the room remains usable.
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
