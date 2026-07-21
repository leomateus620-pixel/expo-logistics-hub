## Plano de correção

1. **Corrigir a chamada autenticada para a função do Google Agenda**
   - Ajustar o hook `useGoogleCalendarConnection` para buscar a sessão atual antes de invocar `google-calendar-oauth`.
   - Enviar explicitamente o `Authorization: Bearer <access_token>` nas chamadas da função.
   - Se não houver sessão válida, não chamar a função em loop; exibir estado neutro pedindo login/recarregamento.

2. **Evitar loop visual e toast genérico no widget**
   - Impedir que o `status` fique refazendo chamadas 401 indefinidamente.
   - Melhorar a mensagem de erro para diferenciar: sessão expirada, conexão Google não concluída e falha real do gateway.
   - Manter o botão clicável em estados `error`/`connecting` antigos, com “Tentar novamente”.

3. **Corrigir preservação da tela atual no retorno do OAuth**
   - Preservar `pathname + search` atual, incluindo filtros do Cronograma, ao montar o `returnUrl`.
   - Ao voltar com `?google=connected`, chamar `complete` e limpar apenas o parâmetro `google`, sem apagar `timelineYear`, `timelineMonth` ou filtros.

4. **Fortalecer a função `google-calendar-oauth`**
   - Ajustar `requireUser` para retornar erro claro quando o token não vier ou estiver inválido.
   - Corrigir o fallback antigo que ainda aponta para `/settings?google=connected`.
   - Tornar o cálculo de `pending` confiável, usando `count` corretamente em vez de depender de `pending?.length` em consulta `head`.

5. **Validação final**
   - Verificar no preview que o widget não dispara mais 401 em loop.
   - Confirmar que o botão inicia o OAuth na tela de Cronograma e retorna para a mesma rota.
   - Conferir que o widget muda para conectado/sucesso quando a função confirma a conexão.