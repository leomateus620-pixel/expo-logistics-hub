## Diagnóstico confirmado

- O cliente do Google Calendar App User Connector está vinculado ao projeto e com acesso offline ativo.
- No banco, a conexão mais recente do usuário ficou como `status: error`, `last_error: authorization_not_confirmed`, sem `google_email`, sem `secondary_calendar_id` e sem `connection_key`.
- Isso explica os dois sintomas: a UI mostra “autorização ainda não confirmada” e nenhum evento entra no Google Agenda, porque o sistema não recebeu/persistiu a chave per-user retornada ao final do OAuth.

## Plano de correção

1. **Corrigir o handshake OAuth final**
   - Ajustar o callback/retorno para completar a conexão mesmo quando o popup fecha ou retorna sem enviar `postMessage`.
   - Fazer o backend consultar/recuperar a conexão autorizada no gateway quando a conexão já aparece como concedida no Google, em vez de depender apenas da chave enviada no payload inicial.

2. **Persistir corretamente a conexão ativa**
   - Garantir que `connection_key`, `google_email`, `secondary_calendar_id`, `status: connected` e `last_error: null` sejam gravados juntos somente depois de uma chamada Google válida.
   - Remover o estado preso atual para permitir uma reconexão limpa após a correção.

3. **Acionar backfill dos eventos automaticamente**
   - Assim que a conexão virar `connected`, criar/validar o calendário secundário “FENASOJA — Cronograma”.
   - Enfileirar os eventos vinculados às comissões do usuário e disparar o worker de sincronização.
   - Manter feriados/eventos sem data fora do envio quando aplicável ao fluxo existente.

4. **Melhorar os estados da UI**
   - Evitar que “Aguardando autorização” fique indefinidamente.
   - Mostrar “Conectado” quando o backend detectar conexão válida, mesmo que o popup tenha sido fechado.
   - Mostrar “Tentar novamente” apenas quando a conexão realmente não tiver sido finalizada.

5. **Validar ponta a ponta**
   - Testar a função de status/conclusão com a sessão atual.
   - Verificar no banco se a conexão passou para `connected` com email e calendário.
   - Confirmar que a fila (`google_sync_outbox`) recebeu eventos e que o worker processou sem dead-letter/reconnect.

## Resultado esperado

Depois da implementação, ao finalizar o login Google, o widget deve sair de “Aguardando autorização”, mostrar “Conectado” com o e-mail usado e começar a inserir os eventos no calendário “FENASOJA — Cronograma” da conta conectada.