import { Navigate, useLocation } from 'react-router-dom';
import { useCapabilities } from '@/hooks/useCapabilities';
import { Loader2 } from 'lucide-react';

interface Props {
  capability: string;
  children: React.ReactNode;
  fallbackRoute?: string;
}

export default function CapabilityGuard({ capability, children, fallbackRoute }: Props) {
  const { hasCapability, hasFullAccess, isLoading } = useCapabilities();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  // Restricted user (mobility-only) landing on Dashboard or other full_access routes
  if (!hasCapability(capability)) {
    if (fallbackRoute) return <Navigate to={fallbackRoute} replace />;
    if (!hasFullAccess && hasCapability('mobility_access')) {
      // Avoid redirect loop
      if (location.pathname !== '/mobility-auth') {
        return <Navigate to="/mobility-auth" replace />;
      }
    }
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
