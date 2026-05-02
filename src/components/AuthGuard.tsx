import { ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';
import LoginPage from '@/pages/LoginPage';

export default function AuthGuard({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user) return <LoginPage />;

  return <>{children}</>;
}
