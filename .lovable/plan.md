## Plano para corrigir a conexão do Google Agenda

1. **Desbloquear a ação de conexão na UI**
   - Ajustar o estado `authorization_not_confirmed` para exibir claramente a ação de reconectar.
   - Garantir que o botão nunca fique preso como “aguardando autorização” quando o backend já marcou a conexão como erro recuperável.
   - No mobile e desktop, manter CTA visível: “Conectar Google Agenda” ou “Tentar conectar novamente”.

2. **Corrigir o ciclo de retry/reconexão**
   - Fazer o botão de retry limpar o estado antigo antes de iniciar novo OAuth.
   - Evitar que registros antigos `error/connecting/completing` bloqueiem uma nova tentativa.
   - Após popup fechado ou callback sem confirmação imediata, tentar completar algumas vezes e então voltar a um estado acionável, sem loop infinito.

3. **Reforçar o callback público**
   - Manter `/google-calendar/callback` fora do `AuthGuard`, mas melhorar o fallback quando o popup não consegue chamar `window.opener`.
   - Preservar o retorno para `/cronograma-eventos` com filtros atuais.
   - Garantir que a janela lateral feche ou redirecione sem cair no login dentro do popup.

4. **Ajustar backend da autorização**
   - No `google-calendar-oauth`, tratar `authorization_not_confirmed` como estado recuperável.
   - Ao iniciar uma nova conexão, resetar com segurança qualquer tentativa anterior do mesmo usuário.
   - No `complete`, aceitar conclusão idempotente se o usuário já estiver conectado no gateway e então criar/validar o calendário secundário.

5. **Validar a sincronização inicial**
   - Confirmar que, ao conectar, o backend enfileira os eventos do Cronograma vinculados às comissões do usuário.
   - Acionar o worker de sincronização para que os eventos cheguem ao Google Agenda logo após a conexão.

6. **Testes e validação**
   - Atualizar testes do estado visual do widget e do callback.
   - Validar no preview que o widget sai de “Conexão não finalizada” para uma opção clicável de conexão.
   - Conferir os requests `status/start/complete` para garantir que desktop e mobile não ficam em loading permanente.