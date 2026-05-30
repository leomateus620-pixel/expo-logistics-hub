import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { useModuleAccess } from '@/hooks/useModuleAccess';
import type { CommissionModule } from '@/modules/commissions/commissionRegistry';
import ModuleNotAuthorizedPage from './ModuleNotAuthorizedPage';

interface ModuleAccessGuardProps {
  module?: CommissionModule;
  adminArea?: boolean;
  children: ReactNode;
}

function LoadingState() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  );
}

export default function ModuleAccessGuard({ module, adminArea = false, children }: ModuleAccessGuardProps) {
  const { canAccess, isLoading } = useModuleAccess(module, adminArea);

  if (isLoading) return <LoadingState />;

  if (!canAccess) {
    return <ModuleNotAuthorizedPage module={module} adminArea={adminArea} />;
  }

  return <>{children}</>;
}
