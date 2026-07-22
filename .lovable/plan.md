# Validação da Conexão Google Agenda

Agora que o Google Console foi configurado (redirect URI, origens JS, domínios autorizados e scopes), vamos validar o fluxo end-to-end.

## Passos

1. **Limpar estado preso da conexão anterior**
   - Remover registro `google_calendar_connections` do usuário `leomateus620@gmail.com` que esteja em `status=error` ou `authorization_not_confirmed`.
   - Zerar quaisquer flags de "aguardando autorização" no `localStorage` documentando ao usuário como fazer (ou via reset action já existente).

2. **Testar fluxo OAuth real**
   - Instruir o usuário a clicar em "Conectar Google Agenda" no widget do módulo Cronograma e Eventos.
   - Confirmar seleção de conta → consentimento → redirect para `connector-gateway.lovable.dev/api/v1/app-users/oauth2/callback` → volta ao sistema.
   - Verificar via logs da edge function `google-calendar-oauth` se `connection_key` foi persistida com sucesso.

3. **Rodar sincronização inicial**
   - Invocar `google-sync-worker` para o usuário conectado.
   - Confirmar que os eventos do FENASOJA aparecem no Google Agenda do usuário (calendar secundário "FENASOJA").
   - Verificar logs de sync (contagem de eventos criados/atualizados).

4. **Validar widget UI**
   - Widget deve mostrar status "Conectado" com email, último sync, e próximos eventos.
   - Sem loops de "aguardando autorização".

5. **Testar notificação de evento**
   - Criar/confirmar evento próximo vinculado ao usuário.
   - Rodar `event-reminders` manualmente e verificar entrega do email + aparição no Google Agenda.

## Detalhes técnicos

- Edge functions envolvidas: `google-calendar-oauth` (status/reset/start), `google-sync-worker` (push de eventos), `event-reminders`.
- Tabelas: `google_calendar_connections`, `event_google_mappings`, `event_reminders`.
- Após validação, se algum passo falhar, capturar log específico e corrigir apenas o ponto quebrado (sem refatorar o fluxo inteiro novamente).

## Resultado esperado

Widget "Conectado" ✅ · Eventos visíveis no Google Agenda do usuário ✅ · Email de lembrete entregue ✅.
