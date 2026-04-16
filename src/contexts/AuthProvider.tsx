import { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import type { User, Session } from '@supabase/supabase-js';

const QUERY_CACHE_KEY = 'fenasoja-query-cache';
const LAST_USER_KEY = 'fenasoja-last-user-id';
const ORG_KEY = 'fenasoja_org_id';

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const initializedRef = useRef(false);
  const lastUserIdRef = useRef<string | null>(null);

  const handleUserChange = (newUserId: string | null) => {
    const previous = lastUserIdRef.current ?? localStorage.getItem(LAST_USER_KEY);
    if (previous && previous !== newUserId) {
      try {
        queryClient.clear();
        localStorage.removeItem(QUERY_CACHE_KEY);
        localStorage.removeItem(ORG_KEY);
      } catch {}
    }
    lastUserIdRef.current = newUserId;
    if (newUserId) {
      localStorage.setItem(LAST_USER_KEY, newUserId);
    } else {
      localStorage.removeItem(LAST_USER_KEY);
    }
  };

  const checkAdmin = async (userId: string) => {
    const { data } = await supabase.from('user_roles').select('role').eq('user_id', userId).eq('role', 'admin');
    setIsAdmin(!!data && data.length > 0);
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      const newUserId = newSession?.user?.id ?? null;
      handleUserChange(newUserId);
      setSession(newSession);
      setUser(newSession?.user ?? null);
      if (newSession?.user) {
        setTimeout(() => checkAdmin(newSession.user.id), 0);
      } else {
        setIsAdmin(false);
      }
      setLoading(false);
      initializedRef.current = true;
    });

    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      if (!initializedRef.current) {
        const newUserId = initialSession?.user?.id ?? null;
        handleUserChange(newUserId);
        setSession(initialSession);
        setUser(initialSession?.user ?? null);
        if (initialSession?.user) {
          checkAdmin(initialSession.user.id);
        }
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    return { error };
  };

  const signOut = async () => {
    try {
      queryClient.clear();
      localStorage.removeItem(QUERY_CACHE_KEY);
      localStorage.removeItem(ORG_KEY);
      localStorage.removeItem(LAST_USER_KEY);
    } catch {}
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, isAdmin, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuthContext must be used within AuthProvider');
  return ctx;
}
