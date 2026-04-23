import { Component, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error('[ErrorBoundary] capturado:', error, info);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  private handleClearCache = () => {
    try {
      localStorage.removeItem('fenasoja-query-cache');
    } catch (e) {
      console.warn('Falha ao limpar cache:', e);
    }
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="w-5 h-5" />
            {this.props.fallbackTitle || 'Algo deu errado ao carregar esta seção'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Ocorreu um erro inesperado ao renderizar este conteúdo. Tente recarregar a página.
            Se o problema persistir, limpe o cache local deste navegador.
          </p>
          {this.state.error?.message && (
            <p className="text-xs font-mono text-muted-foreground bg-muted/40 p-2 rounded-md break-all">
              {this.state.error.message}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button onClick={this.handleRetry} size="sm">
              <RefreshCw className="w-4 h-4 mr-2" /> Tentar novamente
            </Button>
            <Button onClick={this.handleClearCache} size="sm" variant="outline">
              <Trash2 className="w-4 h-4 mr-2" /> Limpar cache local e recarregar
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }
}
