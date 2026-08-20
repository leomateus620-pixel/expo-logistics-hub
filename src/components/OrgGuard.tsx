import { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useCurrentOrg } from '@/hooks/useCurrentOrg';
import LoginPage from '@/pages/LoginPage';

function OrgLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  );
}

export default function OrgGuard({ children }: { children: ReactNode }) {
  const { user, loading: authLoading, signOut } = useAuth();
  const { hasOrg, isLoading } = useCurrentOrg();
  const location = useLocation();
  const navigate = useNavigate();

  if (authLoading || isLoading) {
    return <OrgLoading />;
  }

  if (!user) {
    return <LoginPage returnTo={`${location.pathname}${location.search}`} />;
  }


  if (!hasOrg) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="w-full max-w-md rounded-2xl border border-border/60 bg-card/80 p-8 text-center shadow-lg backdrop-blur">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ShieldAlert className="h-6 w-6" aria-hidden="true" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">Acesso ainda não liberado</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sua conta ainda não está vinculada à Fenasoja 2028. Solicite a liberação à coordenação
            e tente novamente em instantes.
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <Button onClick={() => window.location.reload()} className="h-11 rounded-xl">
              Tentar novamente
            </Button>
            <Button variant="outline" className="h-11 rounded-xl" onClick={() => navigate('/portal')}>
              Voltar ao portal
            </Button>
            <Button
              variant="ghost"
              className="h-11 rounded-xl"
              onClick={async () => {
                await signOut();
                navigate('/login', { replace: true });
              }}
            >
              Sair
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
