
## Objetivo

Criar contas de acesso para Fernanda (`fer.secklereich@gmail.com`) e Cléo (`fenasojafeira@gmail.com`) com senha `Fenaosja@2028`, garantindo que ao conectarem o Google Agenda recebam automaticamente todos os eventos da FENASOJA — igual ao fluxo aplicado a Soltis, Djeison e Zélia.

## Passos

1. **Criar usuários no auth** via edge function `create-user` (ou insert direto em `auth.users`) com:
   - Email confirmado automaticamente
   - Senha `Fenaosja@2028`
   - `full_name` correspondente ("Fernanda Secklereich" e "Cléo — FENASOJA Feira")

2. **Vincular à organização FENASOJA** (`org_members`):
   - Role: `operador` (mesmo padrão de Zélia/Soltis/Djeison)
   - `is_active = true`
   - `nome_exibicao` preenchido

3. **Garantir capability de recepção de eventos**: o fluxo de backfill do Google Calendar (`prepareInitialBackfill` no `google-calendar-oauth-callback`) já busca automaticamente todos os eventos da org para membros com `full_access`, ou os eventos vinculados às comissões do membro. Definir capability apropriada em `user_capabilities` para que recebam **todos** os eventos (igual Leonardo/Soltis): `capability = 'full_access'`.

4. **Nenhuma alteração de código necessária** — a correção do RPC `queue_google_sync_for_user` (aceitando `refresh_token_ciphertext`) já está aplicada, então o backfill funcionará automaticamente quando cada uma conectar o Google Agenda pelo widget.

5. **Notificações por e-mail** (24h, 2h, 1h antes) também já estão ativas via `event-reminders` — funcionam para qualquer membro ativo da org.

## Validação

- Confirmar que ambos os usuários aparecem em `auth.users` com email confirmado.
- Confirmar `org_members` ativo e `user_capabilities` com `full_access`.
- Instruir Fernanda e Cléo a fazer login e clicar em **Conectar Google Agenda** no widget — o backfill dos 150+ eventos será enfileirado automaticamente e drenado pelo `pg_cron` em ~15 min.

## Fora de escopo

Nenhuma mudança de código, UI, edge function ou schema. Apenas inserção de dados (auth + membership + capability).
