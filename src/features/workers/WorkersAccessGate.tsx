import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Loader2, Lock, ShieldCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useCurrentOrg } from '@/hooks/useCurrentOrg';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const UNLOCK_KEY = 'fenasoja-workers-unlock';
export const WORKERS_UNLOCK_MS = 30 * 60 * 1000;

export function readUnlock(userId: string | undefined, now = Date.now()): boolean {
  if (!userId) return false;
  try {
    const value = JSON.parse(sessionStorage.getItem(UNLOCK_KEY) ?? 'null');
    return value?.userId === userId && typeof value.until === 'number' && value.until > now;
  } catch { return false; }
}
export function writeUnlock(userId: string, now = Date.now()) {
  sessionStorage.setItem(UNLOCK_KEY, JSON.stringify({ userId, until: now + WORKERS_UNLOCK_MS }));
}
export function clearUnlock() { sessionStorage.removeItem(UNLOCK_KEY); }

/** Admins, CCPF e Comissão Central — decided in the database, never in the browser. */
export function useWorkersEligibility() {
  const { user } = useAuth(); const { orgId } = useCurrentOrg();
  const query = useQuery({
    queryKey: ['workers-eligibility', user?.id, orgId],
    enabled: Boolean(user?.id && orgId),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('ai_workers_can_access', { _org_id: orgId! });
      if (error) throw error;
      return data === true;
    },
  });
  return { eligible: query.data === true, isLoading: query.isLoading };
}

function useUnlocked() {
  const { user } = useAuth();
  const [unlocked, setUnlocked] = useState(() => readUnlock(user?.id));
  useEffect(() => { setUnlocked(readUnlock(user?.id)); }, [user?.id]);
  useEffect(() => {
    if (!unlocked || !user?.id) return;
    const touch = () => { if (readUnlock(user.id)) writeUnlock(user.id); else setUnlocked(false); };
    const timer = window.setInterval(() => { if (!readUnlock(user.id)) setUnlocked(false); }, 30_000);
    window.addEventListener('keydown', touch); window.addEventListener('pointerdown', touch);
    return () => { window.clearInterval(timer); window.removeEventListener('keydown', touch); window.removeEventListener('pointerdown', touch); };
  }, [unlocked, user?.id]);
  return { unlocked, unlock: () => { if (user?.id) { writeUnlock(user.id); setUnlocked(true); } } };
}

function PasswordPrompt({ onUnlock, compact }: { onUnlock: () => void; compact?: boolean }) {
  const { user } = useAuth();
  const [password, setPassword] = useState(''); const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!user?.email || !password || busy) return;
    setBusy(true); setError(null);
    const { data, error: authError } = await supabase.auth.signInWithPassword({ email: user.email, password });
    setBusy(false);
    if (authError || data.user?.id !== user.id) { setError('Senha incorreta. Tente novamente.'); setPassword(''); return; }
    onUnlock();
  };
  return <div className={`flex ${compact ? 'h-full' : 'min-h-[100dvh]'} items-center justify-center bg-background p-6`}>
    <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl border bg-card p-6 shadow-lg">
      <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Lock size={18} /></div>
        <div><h2 className="text-lg font-semibold">Equipe Fenasoja</h2><p className="text-sm text-muted-foreground">Confirme sua senha para continuar.</p></div></div>
      <Input type="password" autoFocus autoComplete="current-password" placeholder="Sua senha" value={password}
        onChange={event => setPassword(event.target.value)} aria-label="Senha" aria-invalid={!!error} />
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="h-11 w-full rounded-xl" disabled={busy || !password}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Entrar'}</Button>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><ShieldCheck size={13} /> O acesso fica liberado por 30 minutos de uso nesta aba.</p>
    </form>
  </div>;
}

export function WorkersRestricted() {
  return <main className="mx-auto max-w-lg p-8 text-center"><Lock className="mx-auto mb-4 text-muted-foreground" />
    <h1 className="text-xl font-semibold">Acesso restrito</h1>
    <p className="my-4 text-muted-foreground">A Equipe Fenasoja está disponível, por enquanto, apenas para administradores, CCPF e Comissão Central.</p>
    <Link to="/portal" className="underline">Voltar ao portal</Link></main>;
}

export default function WorkersAccessGate({ children, compact }: { children: ReactNode; compact?: boolean }) {
  const { eligible, isLoading } = useWorkersEligibility();
  const { unlocked, unlock } = useUnlocked();
  if (isLoading) return <div role="status" className="flex h-full min-h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (!eligible) return <WorkersRestricted />;
  if (!unlocked) return <PasswordPrompt onUnlock={unlock} compact={compact} />;
  return <>{children}</>;
}
