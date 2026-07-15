import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface MobileCronogramaErrorBoundaryProps {
  children: ReactNode;
  resetKey?: string | number;
  onRetry?: () => void;
}

interface MobileCronogramaErrorBoundaryState {
  hasError: boolean;
}

export class MobileCronogramaErrorBoundary extends Component<
  MobileCronogramaErrorBoundaryProps,
  MobileCronogramaErrorBoundaryState
> {
  state: MobileCronogramaErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // The boundary deliberately keeps the failure local instead of exposing the page background.
  }

  componentDidUpdate(previousProps: MobileCronogramaErrorBoundaryProps) {
    if (this.state.hasError && previousProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <section className="cronograma-mobile-recovery" role="alert" aria-live="assertive">
        <span className="cronograma-mobile-recovery-icon" aria-hidden="true">
          <AlertTriangle className="h-6 w-6" />
        </span>
        <div>
          <h2 className="text-lg font-black tracking-tight text-foreground">Não foi possível exibir esta área</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Seus filtros e o período selecionado foram preservados. Tente carregar a interface novamente.
          </p>
        </div>
        <button
          type="button"
          className="cronograma-mobile-recovery-action focus-ring"
          onClick={() => {
            this.setState({ hasError: false });
            this.props.onRetry?.();
          }}
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Tentar novamente
        </button>
      </section>
    );
  }
}
