import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Loader2, CheckCircle2, AlertTriangle, MailX } from 'lucide-react';

type State = 'validating' | 'ready' | 'already' | 'invalid' | 'submitting' | 'done' | 'error';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

export default function UnsubscribePage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const [state, setState] = useState<State>('validating');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token) { setState('invalid'); return; }
    (async () => {
      try {
        const res = await fetch(
          `${SUPABASE_URL}/functions/v1/handle-email-unsubscribe?token=${encodeURIComponent(token)}`,
          { headers: { apikey: SUPABASE_ANON } },
        );
        const body = await res.json();
        if (!res.ok) { setState('invalid'); setMessage(body?.error ?? null); return; }
        if (body.valid === false && body.reason === 'already_unsubscribed') setState('already');
        else if (body.valid) setState('ready');
        else setState('invalid');
      } catch { setState('invalid'); }
    })();
  }, [token]);

  async function confirm() {
    if (!token) return;
    setState('submitting');
    const { data, error } = await supabase.functions.invoke('handle-email-unsubscribe', { body: { token } });
    if (error) { setState('error'); setMessage(error.message); return; }
    if ((data as any)?.success) setState('done');
    else if ((data as any)?.reason === 'already_unsubscribed') setState('already');
    else setState('error');
  }

  return (
    <div className="min-h-[100dvh] flex items-center justify-center p-6 bg-gradient-to-br from-slate-50 to-slate-100">
      <Card className="max-w-md w-full p-8 space-y-5 text-center">
        <div className="mx-auto w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
          {state === 'validating' || state === 'submitting' ? <Loader2 className="w-7 h-7 animate-spin" />
            : state === 'done' || state === 'already' ? <CheckCircle2 className="w-7 h-7" />
            : state === 'invalid' || state === 'error' ? <AlertTriangle className="w-7 h-7 text-destructive" />
            : <MailX className="w-7 h-7" />}
        </div>

        {state === 'validating' && <><h1 className="text-xl font-bold">Validando link…</h1></>}

        {state === 'ready' && (
          <>
            <h1 className="text-xl font-bold">Cancelar assinatura</h1>
            <p className="text-sm text-muted-foreground">
              Confirme para parar de receber lembretes de eventos neste endereço.
            </p>
            <Button onClick={confirm} className="w-full h-11">Confirmar cancelamento</Button>
          </>
        )}

        {state === 'submitting' && <h1 className="text-xl font-bold">Processando…</h1>}

        {state === 'done' && (
          <>
            <h1 className="text-xl font-bold">Assinatura cancelada</h1>
            <p className="text-sm text-muted-foreground">Você não receberá mais e-mails deste sistema.</p>
          </>
        )}

        {state === 'already' && (
          <>
            <h1 className="text-xl font-bold">Já cancelado</h1>
            <p className="text-sm text-muted-foreground">Este endereço já está descadastrado.</p>
          </>
        )}

        {(state === 'invalid' || state === 'error') && (
          <>
            <h1 className="text-xl font-bold">Link inválido</h1>
            <p className="text-sm text-muted-foreground">{message ?? 'O link expirou ou já foi utilizado.'}</p>
          </>
        )}
      </Card>
    </div>
  );
}
