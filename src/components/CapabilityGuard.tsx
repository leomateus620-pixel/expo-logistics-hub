import { Navigate } from 'react-router-dom';
import { useCapabilities } from '@/hooks/useCapabilities';
import { Loader2 } from 'lucide-react';

interface Props {
  capability: string;
  children: React.ReactNode;
  fallbackRoute?: string;
}

export default function CapabilityGuard({ capability, children, fallbackRoute }: Props) {
  const { hasCapability, isLoading } = useCapabilities();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!hasCapability(capability)) {
    // If user has mobility_access but not full_access, redirect to mobility
    const redirect = fallbackRoute || (hasCapability('mobility_access') ? '/mobility-auth' : '/');
    return <Navigate to={redirect} replace />;
  }

  return <>{children}</>;
}
