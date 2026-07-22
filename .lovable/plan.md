## Plano de correção do Google Agenda

### Diagnóstico confirmado
- A conexão mais recente do usuário está presa como `connecting`, com `connection_key` preenchida, mas sem `google_email`, sem `secondary_calendar_id` e sem sincronização concluída.
- Os logs da função mostram várias tentativas rejeitadas pelo gateway com `401 unauthorized` ao validar a credencial.
- Existem 63 eventos na fila de sincronização (`queued`), então os eventos não chegam ao Google Agenda porque a conexão nunca vira `connected`.
- O client App User Connector **Cronograma e eventos** está vinculado ao projeto e com `offline access` ativo.

### Causa provável a corrigir
O fluxo atual está tratando o `session_id` inicial do OAuth como se já fosse uma credencial final para chamadas Google. O Google confirma o consentimento, mas a validação do backend usa uma chave que o gateway ainda rejeita como `unauthorized`; por isso a UI cai em “autorização não confirmada” e a fila não roda.

### Implementação proposta
1. **Corrigir o contrato com o gateway do App User Connector**
   - Ajustar o helper server-side para iniciar OAuth, salvar a sessão temporária e finalizar/revalidar a conexão usando a credencial realmente autorizada pelo gateway.
   - Não considerar `session_id` automaticamente como conexão válida sem uma chamada Google bem-sucedida.

2. **Tornar o `complete` resiliente e idempotente**
   - Ao receber retorno do OAuth, tentar finalizar a conexão em etapas com polling controlado.
   - Se o gateway responder `401 unauthorized`, manter estado recuperável por curto período, mas depois liberar nova tentativa sem travar a UI.
   - Só gravar `status: connected` quando conseguir criar/validar o calendário secundário e obter uma chamada Google válida.

3. **Limpar estado preso do usuário atual**
   - Remover ou resetar o registro `connecting` atual que está usando uma chave rejeitada.
   - Reenfileirar os 63 eventos apenas depois da conexão válida.

4. **Garantir sincronização inicial**
   - Após conectar, criar/validar o calendário “FENASOJA — Cronograma”.
   - Rodar o worker de sincronização e verificar que os itens saem de `queued` para sincronizados.
   - Se houver falha de permissão/scope, mostrar o erro real na UI e nos logs.

5. **Ajustar a UI do widget**
   - Mostrar “Conectado” somente com `status: connected` real.
   - Em erro recuperável, exibir botão claro de “Conectar novamente” sem loop infinito.
   - No mobile, evitar popup preso em “aguardando autorização” quando a janela fecha ou retorna sem credencial final.

6. **Validação final**
   - Validar o endpoint `google-calendar-oauth` com a sessão autenticada disponível.
   - Validar no banco: conexão com `google_email`, `secondary_calendar_id`, `status: connected`, `last_error: null`.
   - Validar fila: eventos processados pelo `google-sync-worker` e mapeados em `google_calendar_event_map`.
   - Validar visualmente no preview desktop/mobile que o widget não mostra mais erro nem loading infinito.

### Observação importante
Se, após a correção, o gateway continuar retornando `401 unauthorized` para uma autorização recém-concluída, a configuração do Google já feita pode estar correta, mas o client do App User Connector pode precisar ser reconectado no workspace para regenerar a chave/callback do conector. Nesse caso, o sistema deverá exibir essa instrução de forma clara em vez de manter a tela em loop.