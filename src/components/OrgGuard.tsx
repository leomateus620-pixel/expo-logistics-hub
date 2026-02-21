import { ReactNode } from 'react';
import { useCurrentOrg } from '@/hooks/useCurrentOrg';
import CreateOrgPage from '@/pages/CreateOrgPage';

export default function OrgGuard({ children }: { children: ReactNode }) {
  const { hasOrg, isLoading } = useCurrentOrg();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!hasOrg) return <CreateOrgPage />;

  return <>{children}</>;
}
