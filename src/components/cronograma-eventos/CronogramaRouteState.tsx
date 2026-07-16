import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, CalendarRange, Loader2, RefreshCw, ShieldX } from 'lucide-react';
import { Link } from 'react-router-dom';
import { FenasojaBrand } from '@/components/brand/FenasojaBrand';
import { Button } from '@/components/ui/button';

interface CronogramaRouteBoundaryProps {
  children: ReactNode;
}

interface CronogramaRouteBoundaryState {
  hasError: boolean;
}

export class CronogramaRouteBoundary extends Component<
  CronogramaRouteBoundaryProps,
  CronogramaRouteBoundaryState
> {
  state: CronogramaRouteBoundaryState = { hasError: false };

  static getDerivedStateFromError(): CronogramaRouteBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const component = info.componentStack
      ?.split('\n')
      .map((line) => line.trim())
      .find(Boolean)
      ?.slice(0, 120);

    // Keep diagnostics actionable without logging records, credentials or query data.
    console.error('[cronograma-route] render_failure', {
      errorName: error.name || 'Error',
      component: component || 'unknown',
    });
  }

  private retry = () => {
    this.setState({ hasError: false });
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <RouteStateFrame>
        <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-destructive/20 bg-destructive/10 text-destructive shadow-[var(--elevation-1)]">
          <AlertTriangle className="h-6 w-6" aria-hidden="true" />
        </span>
        <p className="mt-5 text-[10px] font-black uppercase tracking-[0.18em] text-destructive">Falha de renderização</p>
        <h1 className="mt-2 text-2xl font-black tracking-tight text-foreground">O cronograma não pôde ser exibido</h1>
        <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
          Seus dados permanecem preservados. Recarregue o módulo ou volte ao portal enquanto a conexão é restabelecida.
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Button type="button" onClick={this.retry}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Tentar novamente
          </Button>
          <Button asChild variant="outline">
            <Link to="/portal">Voltar ao portal</Link>
          </Button>
        </div>
      </RouteStateFrame>
    );
  }
}

export function CronogramaRouteLoading({ label = 'Carregando Cronograma e Eventos…' }: { label?: string }) {
  return (
    <RouteStateFrame role="status" ariaLive="polite">
      <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary shadow-[var(--elevation-1)]">
        <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
      </span>
      <p className="mt-5 text-sm font-bold text-foreground">{label}</p>
      <p className="mt-1 text-xs text-muted-foreground">Preparando calendário, linha do tempo e permissões.</p>
    </RouteStateFrame>
  );
}

export function CronogramaPermissionDenied() {
  return (
    <RouteStateFrame>
      <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-warning/25 bg-warning/[0.12] text-warning-foreground shadow-[var(--elevation-1)]">
        <ShieldX className="h-6 w-6" aria-hidden="true" />
      </span>
      <p className="mt-5 text-[10px] font-black uppercase tracking-[0.18em] text-primary">Acesso por perfil</p>
      <h1 className="mt-2 text-2xl font-black tracking-tight text-foreground">Cronograma não liberado para este perfil</h1>
      <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
        A rota está disponível, mas sua conta não possui a permissão necessária. Solicite acesso ao administrador responsável.
      </p>
      <Button asChild variant="outline" className="mt-6">
        <Link to="/portal">Voltar ao portal</Link>
      </Button>
    </RouteStateFrame>
  );
}

function RouteStateFrame({
  children,
  role,
  ariaLive,
}: {
  children: ReactNode;
  role?: 'status';
  ariaLive?: 'polite';
}) {
  return (
    <main className="command-grid-bg flex min-h-[100dvh] items-center justify-center bg-[oklch(var(--brand-navy-900))] p-4">
      <section
        className="cronograma-route-state animate-soft-rise w-full max-w-xl rounded-2xl p-6 text-center sm:p-8"
        role={role}
        aria-live={ariaLive}
      >
        <div className="mb-6 flex items-center justify-center gap-3 border-b border-border/70 pb-5 text-left">
          <FenasojaBrand compact subtitle="Cronograma e Eventos" tone="light" />
          <CalendarRange className="ml-auto h-5 w-5 text-primary" aria-hidden="true" />
        </div>
        <div className="flex flex-col items-center">{children}</div>
      </section>
    </main>
  );
}
