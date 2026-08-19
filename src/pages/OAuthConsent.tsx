import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import LoginPage from '@/pages/LoginPage';
import { Loader2, ShieldCheck } from 'lucide-react';

type AuthorizationDetails = {
  client?: { name?: string | null } | null;
  redirect_url?: string | null;
  redirect_to?: string | null;
};

type OAuthNamespace = {
  getAuthorizationDetails: (id: string) => Promise<{ data: AuthorizationDetails | null; error: { message: string } | null }>;
  approveAuthorization: (id: string) => Promise<{ data: AuthorizationDetails | null; error: { message: string } | null }>;
  denyAuthorization: (id: string) => Promise<{ data: AuthorizationDetails | null; error: { message: string } | null }>;
};

function oauthApi(): OAuthNamespace {
  return (supabase.auth as unknown as { oauth: OAuthNamespace }).oauth;
}

export default function OAuthConsent() {
  const [params] = useSearchParams();
  const authorizationId = params.get('authorization_id') ?? '';
  const [details, setDetails] = useState<AuthorizationDetails | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!authorizationId) {
        setError('Parâmetro authorization_id ausente.');
        return;
      }
      const { data: sess } = await supabase.auth.getSession();
      if (!active) return;
      if (!sess.session) {
        setNeedsLogin(true);
        return;
      }
      setNeedsLogin(false);
      const { data, error: detailsError } = await oauthApi().getAuthorizationDetails(authorizationId);
      if (!active) return;
      if (detailsError) {
        setError(detailsError.message);
        return;
      }
      const immediate = data?.redirect_url ?? data?.redirect_to;
      if (immediate && !data?.client) {
        window.location.href = immediate;
        return;
      }
      setDetails(data);
    })();
    return () => {
      active = false;
    };
  }, [authorizationId, needsLogin]);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) setNeedsLogin(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function decide(approve: boolean) {
    setBusy(true);
    const api = oauthApi();
    const { data, error: decisionError } = approve
      ? await api.approveAuthorization(authorizationId)
      : await api.denyAuthorization(authorizationId);
    if (decisionError) {
      setBusy(false);
      setError(decisionError.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError('O servidor de autorização não retornou um redirecionamento.');
      return;
    }
    window.location.href = target;
  }

  if (needsLogin) {
    return <LoginPage returnTo={`${window.location.pathname}${window.location.search}`} />;
  }

  const clientName = details?.client?.name ?? 'aplicativo';

  return (
    <main className="min-h-[100dvh] flex items-center justify-center bg-background p-6">
      <section className="w-full max-w-md rounded-3xl border border-border/60 bg-card/80 p-8 shadow-2xl backdrop-blur-xl">
        <div className="mb-5 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </span>
          <h1 className="text-xl font-bold tracking-tight text-foreground">Autorizar conexão</h1>
        </div>

        {error && (
          <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive" role="alert">
            Não foi possível processar esta autorização: {error}
          </p>
        )}

        {!error && !details && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Carregando solicitação…
          </p>
        )}

        {!error && details && (
          <>
            <p className="text-sm leading-relaxed text-muted-foreground">
              <strong className="text-foreground">{clientName}</strong> quer acessar a Fenasoja Log em seu nome.
              As ferramentas respeitarão exatamente as suas permissões no sistema.
            </p>
            <div className="mt-7 flex gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => decide(true)}
                className="h-11 flex-1 rounded-xl bg-primary font-semibold text-primary-foreground transition-opacity disabled:opacity-60"
              >
                {busy ? 'Processando…' : 'Aprovar'}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => decide(false)}
                className="h-11 flex-1 rounded-xl border border-border font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-60"
              >
                Recusar
              </button>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
