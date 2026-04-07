import { ReactNode, useState, useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import LoginPage from '@/pages/LoginPage';
import SplashScreen from './SplashScreen';

const SPLASH_KEY = 'fenasoja-splash-shown';

export default function AuthGuard({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const [showSplash, setShowSplash] = useState(false);
  const prevUserRef = useRef<string | null>(null);

  useEffect(() => {
    if (user && !prevUserRef.current && !sessionStorage.getItem(SPLASH_KEY)) {
      setShowSplash(true);
    }
    prevUserRef.current = user?.id ?? null;
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user) return <LoginPage />;

  if (showSplash) {
    return (
      <SplashScreen
        onComplete={() => {
          sessionStorage.setItem(SPLASH_KEY, '1');
          setShowSplash(false);
        }}
      />
    );
  }

  return <>{children}</>;
}
