## Objetivo

Eliminar o requisito do `vault.secrets` (`google_sync_worker_service_role_key`) e fazer o `google-sync-worker` ser acordado a cada minuto usando apenas recursos nativos que o Lovable Cloud consegue provisionar sozinho — sem chamado ao suporte.

## Diagnóstico atual

- A migração `20260722234000_google_calendar_oauth_hardening.sql` criou `public.invoke_google_sync_worker()` que lê `vault.decrypted_secrets` procurando o service-role key. Como o Lovable Cloud não expõe o service-role key ao usuário, esse segredo nunca é inserido e a função retorna `NULL` a cada minuto, deixando o outbox sem processamento.
- O `google-sync-worker/index.ts` valida a chamada via `requireServiceRole()` comparando o `Authorization: Bearer` com `SUPABASE_SERVICE_ROLE_KEY` (que existe no runtime da Edge Function, mas não no Postgres).
- Já existe secret `LOVABLE_API_KEY` e `RESEND_API_KEY`; nenhum secret Vault é necessário para outros fluxos além do email queue (que possui o mesmo problema, mas fora do escopo aqui).

## Estratégia

Usar um **token de worker** próprio (não o service-role):

1. Gerar `GOOGLE_SYNC_WORKER_TOKEN` como secret de runtime via `secrets--generate_secret` (fluxo Lovable, sem intervenção do suporte).
2. Armazenar o **mesmo valor** dentro do banco em uma tabela restrita (`public.internal_worker_tokens`) para o cron ler — sem depender do Vault.
3. Reescrever `invoke_google_sync_worker()` para ler dessa tabela e chamar a Edge Function passando `Authorization: Bearer <token>`.
4. Ajustar `google-sync-worker/index.ts` para aceitar **duas formas** de autenticação: (a) service-role (mantém compatibilidade com invocações do `google-calendar-oauth`), (b) `GOOGLE_SYNC_WORKER_TOKEN`.

## Passos

### Fase 1 — Provisionar o token
- `secrets--generate_secret` com nome `GOOGLE_SYNC_WORKER_TOKEN` (64 chars). Guardar o valor bruto para inserir no banco na mesma migração via string literal — porém, como o segredo gerado não é revelado, usar um fluxo diferente: gerar um valor via `gen_random_bytes` diretamente no SQL da migração e, em seguida, usar `secrets--set_secret` com esse mesmo valor.
- Alternativa mais limpa: a migração cria o token com `encode(gen_random_bytes(32), 'hex')`, grava em `public.internal_worker_tokens`. Um segundo passo (fora do SQL) lê esse token via `supabase--read_query` e chama `secrets--set_secret` para publicá-lo como env da Edge Function.

### Fase 2 — Migração
```sql
CREATE TABLE public.internal_worker_tokens (
  name text PRIMARY KEY,
  token text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.internal_worker_tokens TO service_role;
ALTER TABLE public.internal_worker_tokens ENABLE ROW LEVEL SECURITY;
-- sem policies: apenas service_role acessa

INSERT INTO public.internal_worker_tokens(name, token)
VALUES ('google_sync_worker', encode(gen_random_bytes(32), 'hex'))
ON CONFLICT (name) DO NOTHING;

-- Reescrever invoke_google_sync_worker()
CREATE OR REPLACE FUNCTION public.invoke_google_sync_worker()
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, net AS $$
DECLARE worker_token text; request_id bigint;
BEGIN
  SELECT token INTO worker_token FROM public.internal_worker_tokens WHERE name = 'google_sync_worker';
  IF worker_token IS NULL THEN RETURN NULL; END IF;
  SELECT net.http_post(
    url := 'https://btfaumhroqtqzxomqorx.supabase.co/functions/v1/google-sync-worker',
    headers := jsonb_build_object('Content-Type','application/json','X-Worker-Token', worker_token),
    body := '{}'::jsonb
  ) INTO request_id;
  RETURN request_id;
END; $$;
```

### Fase 3 — Publicar token como secret da Edge Function
- Ler o token via `supabase--read_query` (`SELECT token FROM internal_worker_tokens WHERE name='google_sync_worker'`).
- Chamar `secrets--set_secret` com `GOOGLE_SYNC_WORKER_TOKEN` = valor lido.

### Fase 4 — Ajuste no worker
- Editar `supabase/functions/google-sync-worker/index.ts`:
  ```ts
  const workerToken = Deno.env.get("GOOGLE_SYNC_WORKER_TOKEN");
  function requireAuth(req: Request) {
    const auth = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    const wt = req.headers.get("X-Worker-Token") ?? "";
    return (serviceRoleKey && auth === serviceRoleKey) || (workerToken && wt === workerToken);
  }
  ```
  Substituir chamada de `requireServiceRole` por `requireAuth`.
- Redeploy da função.

### Fase 5 — Validação
- `supabase--read_query`: verificar `cron.job` continua ativo.
- Aguardar um ciclo (~1 min) e consultar `net._http_response` para confirmar HTTP 200.
- Consultar `google_sync_outbox` para observar tarefas saindo do status `queued`.
- Reconectar Google Agenda no widget e confirmar que os eventos aparecem no Google Calendar.

## Observações

- Não altera o fluxo de OAuth já corrigido — apenas o wake-up periódico.
- Mantém compatibilidade: `google-calendar-oauth` continua invocando o worker com service-role via `supabase.functions.invoke`.
- `email_queue` continua dependendo do Vault; se o usuário quiser, aplico a mesma técnica em seguida (fora deste plano).
