import { ReactNode, useEffect, useRef } from 'react';
import { useCurrentOrg } from '@/hooks/useCurrentOrg';

export default function OrgGuard({ children }: { children: ReactNode }) {
  const { hasOrg, isLoading, createOrg, isCreating } = useCurrentOrg();
  const attempted = useRef(false);

  useEffect(() => {
    if (!isLoading && !hasOrg && !isCreating && !attempted.current) {
      attempted.current = true;
      createOrg('Fenasoja 2026').catch(() => {
        attempted.current = false;
      });
    }
  }, [isLoading, hasOrg, isCreating, createOrg]);

  if (isLoading || (!hasOrg && !attempted.current) || isCreating) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return <>{children}</>;
}
