## Diagnóstico confirmado

- O app inicia o OAuth corretamente e recebe `authorization_url` do conector.
- Depois disso, o status fica em `waiting_authorization` até o front cancelar a tentativa.
- A tentativa mais recente foi marcada como `authorization_cancelled`, mas `callback_observation` continuou vazio.
- Não há logs de `oauth_callback_received`, `oauth_completion_pending` ou `oauth_callback_observed`.

Conclusão: o popup chega no retorno visual, mas o app não está recebendo/consumindo o retorno final do conector. A tela principal fica presa em “Confirmando autorização” porque o callback não confirma a conexão no backend.

## Plano de correção

1. **Corrigir o domínio de retorno do OAuth**
   - Ajustar o backend para aceitar e priorizar o mesmo origin que iniciou o fluxo no preview/editor, não forçar `www.fenasojagestao.com` quando a chamada veio do preview.
   - Manter os domínios publicados e customizados como permitidos.
   - Evitar que o popup finalize em um domínio diferente do `window.opener`, pois isso quebra o `postMessage` e a confirmação visual.

2. **Tornar o callback independente do `postMessage`**
   - No hook `useGoogleCalendarConnection`, tratar popup fechado como “retorno pendente”, não como cancelamento imediato.
   - Aguardar o backend por mais tempo e consultar status até detectar `connected`, `synchronizing`, `error` ou expiração.
   - Não chamar `cancel` automaticamente quando o erro for apenas `authorization_not_confirmed`, para não apagar uma tentativa que ainda pode completar.

3. **Fortalecer a observação do callback**
   - Enviar `attemptId` sanitizado na observação quando existir, sem gravar `code`, `state` ou valores sensíveis.
   - No backend, permitir correlacionar `observe_callback` por `attempt` mesmo sem sessão hidratada.
   - Registrar metadados suficientes para saber se o Google voltou com `code/state`, `error`, hash ou query.

4. **Corrigir parsing de retornos alternativos do conector**
   - Expandir `parseGoogleCalendarCallbackFeedback` para reconhecer variações seguras que o conector pode devolver, como `google_result`, `google`, ou `error` sem `code/state`.
   - Se o retorno não trouxer `code/state`, não marcar como sucesso falso; registrar evidência e mostrar erro recuperável com botão para reconectar.

5. **Limpar estado preso do usuário atual**
   - Após aplicar a correção, limpar apenas tentativas pendentes/erro do usuário e organização atuais, preservando histórico concluído.
   - Deixar a conexão em `disconnected` para um novo teste limpo.

6. **Validação**
   - Reproduzir o fluxo pelo widget do Cronograma.
   - Confirmar no banco que a tentativa passa por `waiting_authorization` → `completing` → `completed`.
   - Confirmar que `google_calendar_connections` fica `connected` ou `synchronizing`, com `verified_at` e `secondary_calendar_id` preenchidos.
   - Confirmar que o card sai de “Confirmando autorização” e mostra “Google Agenda conectado”.

## Arquivos envolvidos

- `supabase/functions/google-calendar-oauth/index.ts`
- `src/pages/GoogleCalendarCallbackPage.tsx`
- `src/hooks/useGoogleCalendarConnection.ts`
- `src/lib/google-calendar-callback.ts`

## Resultado esperado

Depois da correção, a autorização do Google Agenda deve finalizar sem loop, o popup deve comunicar o resultado corretamente quando possível, e a tela principal deve se recuperar consultando o backend mesmo quando o popup fechar ou o navegador bloquear a comunicação entre janelas.