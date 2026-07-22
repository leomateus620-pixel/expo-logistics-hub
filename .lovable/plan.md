## Diagnóstico confirmado

- O client de Google Calendar App User Connector está configurado e vinculado ao projeto, com offline access ativo.
- O registro do usuário Leonardo existe, mas ficou em `status = error` com `last_error = authorization_not_confirmed`, sem `google_email`, sem `secondary_calendar_id` e sem itens na fila de sincronização.
- Os logs da função mostram `probeConnection rejected { status: 400 }` repetidamente. Isso acontece na etapa de confirmação: o app recebeu/assumiu o retorno do OAuth, mas a chamada de validação pelo gateway não consegue localizar/usar uma credencial per-user válida.
- O código atual chama o gateway do Google Calendar usando apenas `X-Client-Api-Key` + `X-App-User-Id`. O próprio banco já tem coluna `connection_key`, mas ela não é gravada nem usada. Resultado: a UI fica “aguardando autorização”/“conexão não finalizada” mesmo depois do usuário completar telas do Google/Lovable, e os eventos não chegam ao Google Agenda.

## Plano de correção

1. **Corrigir contrato do gateway**
   - Ajustar o helper `googleCalendarGateway` para separar:
     - início OAuth: usa client key do App User Connector;
     - chamadas Google: usam `LOVABLE_API_KEY` + `X-Connection-Api-Key` com a `connection_key` per-user.
   - Melhorar logs seguros para registrar status e código de erro do gateway sem expor tokens.

2. **Capturar e persistir a credencial per-user**
   - No retorno do `startOAuth`, mapear qualquer campo de credencial retornado pelo gateway (`connection_key`, `connectionKey`, `connection_api_key`, etc.) quando disponível.
   - Persistir a `connection_key` em `google_calendar_connections`.
   - Usar essa chave em `complete`, `status`, `ensureSecondaryCalendar`, busca de perfil e worker de sincronização.

3. **Tornar a UI resiliente ao caso “autorizou, mas a chave ainda não propagou”**
   - Não transformar imediatamente em erro se a confirmação ainda estiver propagando.
   - Se passar do tempo limite sem chave/conexão válida, liberar o botão “Tentar novamente” e limpar a trava anterior antes de abrir novo OAuth.
   - Preservar retorno para `/cronograma-eventos`, sem redirecionar para configurações ou comissão logística.

4. **Garantir sincronização real dos eventos**
   - Atualizar `google-sync-worker` para usar `connection_key` do registro conectado.
   - Reenfileirar os eventos do usuário depois que a conexão for confirmada.
   - Acionar o worker e validar que a fila sai de `queued/failed` para `done`.

5. **Limpar estado travado atual do Leonardo**
   - Após deploy, resetar apenas o registro travado desse usuário para permitir nova autorização limpa.
   - Validar via banco/logs que o próximo fluxo grava `google_email`, `secondary_calendar_id`, `status = connected` e cria/sincroniza eventos.

6. **Testes e validação**
   - Atualizar testes de contrato para cobrir o uso de `X-Connection-Api-Key` e `connection_key`.
   - Rodar teste seletivo do módulo Google Calendar.
   - Verificar logs da função e tabela de conexão após a tentativa.