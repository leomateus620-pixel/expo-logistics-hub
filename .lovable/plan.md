## Diagnóstico confirmado

- O widget fica em **“Aguardando autorização”** porque a conexão gravada no backend está em `status = error` / `authorization_not_confirmed` e **não possui `connection_key`**.
- Os logs recentes da função mostram repetidamente: `probeConnection failed { reason: "missing_connection_key" }`.
- Há **63 eventos na fila** de sincronização, mas **0 eventos mapeados no Google Agenda**, então a sincronização nunca avançou porque a conexão per-user não foi finalizada.

## Plano de correção

1. **Corrigir o contrato OAuth do Google Agenda**
   - Ajustar o backend para não depender de uma `connection_key` que não está vindo no início do fluxo.
   - Validar corretamente o retorno do App User Connector e persistir a credencial per-user somente quando ela existir de fato.
   - Melhorar os logs sem expor nenhum segredo.

2. **Remover estado travado e permitir nova autorização limpa**
   - Resetar a conexão atual do Leonardo, que está travada em `authorization_not_confirmed` sem credencial.
   - Cancelar/reabrir a fila de sincronização de forma segura, mantendo os eventos existentes.

3. **Corrigir a UI do widget**
   - Se a conexão estiver sem credencial válida, mostrar **“Conectar Google Agenda”** ou **“Tentar novamente”**, nunca deixar o botão preso em “Aguardando autorização”.
   - No desktop e no mobile, o usuário sempre deve conseguir reiniciar a autorização.
   - Após sucesso, mostrar **Conectado**, conta Google, última sincronização e progresso da fila.

4. **Garantir sincronização real dos eventos**
   - Após conexão confirmada, criar/validar o calendário secundário **“FENASOJA — Cronograma”**.
   - Enfileirar novamente os eventos vinculados ao usuário/comissões.
   - Rodar o worker de sincronização e verificar que os registros aparecem em `google_calendar_event_map`.

5. **Validar ponta a ponta**
   - Testar `status`, `start`, `complete` e worker pelos endpoints do backend.
   - Conferir logs da função `google-calendar-oauth` e `google-sync-worker`.
   - Validar que o widget sai do estado de erro e que os eventos começam a aparecer no Google Agenda.

## Arquivos/áreas que serão ajustados

- `supabase/functions/google-calendar-oauth/index.ts`
- `supabase/functions/_shared/googleCalendarGateway.ts`
- `supabase/functions/google-sync-worker/index.ts`
- `src/hooks/useGoogleCalendarConnection.ts`
- `src/lib/google-calendar-state.ts`
- `src/components/cronograma-eventos/GoogleCalendarHeroWidget.tsx`
- Testes existentes do Google Calendar para cobrir o estado sem `connection_key` e evitar regressão.

## Resultado esperado

- O fluxo deixa de ficar preso em **“Aguardando autorização”**.
- Caso a autorização falhe, a UI permite tentar novamente imediatamente.
- Quando conectar com sucesso, o widget exibe **Google Agenda conectado**.
- Os eventos do Cronograma entram no calendário secundário do Google Agenda do usuário conectado.