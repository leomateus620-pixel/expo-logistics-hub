import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import type { User, Session } from '@supabase/supabase-js';

const QUERY_CACHE_KEY = 'fenasoja-query-cache';
const LAST_USER_KEY = 'fenasoja-last-user-id';

export function useAuth() {
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
      // Different user detected — clear all cached data from prior session
      try {
        queryClient.clear();
        localStorage.removeItem(QUERY_CACHE_KEY);
        localStorage.removeItem('fenasoja_org_id');
      } catch {}
    }
    lastUserIdRef.current = newUserId;
    if (newUserId) {
      localStorage.setItem(LAST_USER_KEY, newUserId);
    } else {
      localStorage.removeItem(LAST_USER_KEY);
    }
  };

  useEffect(() => {
    // Set up auth listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const newUserId = session?.user?.id ?? null;
      handleUserChange(newUserId);
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
        const newUserId = session?.user?.id ?? null;
        handleUserChange(newUserId);
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          checkAdmin(session.user.id);
        }
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    try {
      queryClient.clear();
      localStorage.removeItem(QUERY_CACHE_KEY);
      localStorage.removeItem('fenasoja_org_id');
      localStorage.removeItem(LAST_USER_KEY);
    } catch {}
    await supabase.auth.signOut();
  };

  return { user, session, loading, isAdmin, signIn, signOut };
}
