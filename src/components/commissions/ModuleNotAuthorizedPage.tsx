import { Link } from 'react-router-dom';
import { LockKeyhole, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { CommissionModule } from '@/modules/commissions/commissionRegistry';

interface ModuleNotAuthorizedPageProps {
  module?: CommissionModule;
  adminArea?: boolean;
}

export default function ModuleNotAuthorizedPage({ module, adminArea }: ModuleNotAuthorizedPageProps) {
  const title = adminArea ? 'Acesso administrativo restrito' : 'Acesso restrito';
  const description = adminArea
    ? 'Esta área exige perfil administrativo, gestor ou capability admin_access.'
    : `Seu usuário não possui permissão para acessar ${module?.name ?? 'este módulo'}.`;

  return (
    <div className="min-h-screen bg-background grain-texture px-4 py-8 text-foreground">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-xl flex-col items-center justify-center text-center">
        <div className="liquid-glass-card gold-accent w-full rounded-2xl p-6 md:p-8">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10 text-red-600 dark:text-red-300">
            <LockKeyhole className="h-7 w-7" aria-hidden="true" />
          </div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-gold">
            Sistema Integrado Fenasoja
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
            {title}
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">
            {description}
          </p>
          {module?.sensitive && (
            <div className="mt-5 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-left text-sm text-red-700 dark:text-red-200">
              Módulo sensível - requer validação e permissões específicas antes de exibir dados operacionais.
            </div>
          )}
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Button asChild variant="outline" className="rounded-2xl">
              <Link to="/">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar
              </Link>
            </Button>
            <Button asChild className="rounded-2xl">
              <Link to="/portal">Ver comissões</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
