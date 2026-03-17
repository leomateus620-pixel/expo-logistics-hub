import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User, Session } from '@supabase/supabase-js';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const initializedRef = useRef(false);

  useEffect(() => {
    // Set up auth listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        setTimeout(() => checkAdmin(session.user.id), 0);
      } else {
        setIsAdmin(false);
      }
      setLoading(false);
      initializedRef.current = true;
    });

    // Then get initial session — only set loading if listener hasn't fired yet
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!initializedRef.current) {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          checkAdmin(session.user.id);
        }
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const checkAdmin = async (userId: string) => {
    const { data } = await supabase.from('user_roles').select('role').eq('user_id', userId).eq('role', 'admin');
    setIsAdmin(!!data && data.length > 0);
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return { user, session, loading, isAdmin, signIn, signOut };
}
