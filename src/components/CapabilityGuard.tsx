import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useCapabilities } from '@/hooks/useCapabilities';
import { Loader2 } from 'lucide-react';

interface Props {
  capability: string;
  children: ReactNode;
  fallbackRoute?: string;
  fallback?: ReactNode;
}

export default function CapabilityGuard({ capability, children, fallbackRoute, fallback }: Props) {
  const { hasCapability, hasFullAccess, isLoading, loadError, retry } = useCapabilities();
  const location = useLocation();

  // While loading, never decide — show spinner. Prevents wrongful redirects/leaks.
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (loadError && !hasCapability(capability)) {
    return (
      <div role="alert" className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background p-6 text-center">
        <p className="text-base font-semibold text-foreground">Não foi possível verificar seu acesso.</p>
        <p className="text-sm text-muted-foreground">Verifique a conexão e tente novamente.</p>
        <div className="flex gap-3">
          <button type="button" onClick={retry} className="h-11 rounded-xl bg-primary px-5 text-primary-foreground">Tentar novamente</button>
          <a href="/" className="h-11 inline-flex items-center rounded-xl border border-border px-5 text-foreground">Voltar ao módulo</a>
        </div>
      </div>
    );
  }

  if (!hasCapability(capability)) {
    if (fallbackRoute) return <Navigate to={fallbackRoute} replace />;
    if (fallback) return <>{fallback}</>;
    // Restricted user (mobility-only) — always send to /mobility-auth
    if (!hasFullAccess && hasCapability('mobility_access')) {
      if (location.pathname !== '/mobility-auth') {
        return <Navigate to="/mobility-auth" replace />;
      }
      return <>{children}</>;
    }
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
