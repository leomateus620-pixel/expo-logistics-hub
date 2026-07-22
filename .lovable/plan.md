## Plano de correção end-to-end — Google Agenda

### Diagnóstico confirmado
- O conector App User do Google Calendar está habilitado, vinculado a este projeto e com acesso offline ativo.
- A UI está presa porque o registro atual em `google_calendar_connections` permanece em `status = connecting`, sem `google_email`, sem `secondary_calendar_id` e sem fila de sincronização.
- O popup retorna para `/cronograma-eventos`, que é uma rota protegida. Quando o popup não herda a sessão do app, ele mostra a tela de login; ao finalizar/fechar, a janela principal não recebe a mensagem de sucesso e continua em “Aguardando autorização”.
- A tela principal só chama `complete` quando recebe `postMessage` do popup; se o popup cai no login ou é fechado depois do consentimento, a conexão nunca é finalizada.

### 1. Criar rota pública de callback do Google Agenda
- Adicionar uma rota pública dedicada, por exemplo `/google-calendar/callback`, fora de `AuthGuard`, `OrgGuard` e permissões do Cronograma.
- Essa rota será leve e sem layout protegido: apenas processa `?google=connected`/erros, envia `postMessage` para a janela principal e fecha o popup.
- Preservar segurança: ela não deve expor tokens, não deve aceitar `code/state` diretamente e deve usar apenas o sinal consolidado do gateway.

### 2. Separar “callback do OAuth” de “voltar para a tela do usuário”
- Alterar `buildGoogleCalendarReturnUrl` para gerar o callback público com um parâmetro seguro `next` contendo a rota original do usuário, por exemplo:

```text
/google-calendar/callback?google=connected&next=/cronograma-eventos?timelineYear=2026&timelineMonth=2026-06
```

- Manter a preservação de filtros/ano/mês do Cronograma no `next`.
- Remover resíduos OAuth sem apagar os filtros reais do Cronograma.

### 3. Tornar a finalização robusta mesmo se o popup fechar
- Na janela principal, depois de abrir o popup, continuar aguardando a mensagem.
- Se o popup for fechado sem mensagem, chamar `complete` mesmo assim por algumas tentativas, porque o consentimento pode ter sido concluído antes do fechamento.
- Se `complete` confirmar a autorização, mostrar “Google Agenda conectado” e sair do estado de loading.
- Se não confirmar, liberar o botão “Tentar novamente” em vez de deixar a UI presa.

### 4. Corrigir estados presos no backend
- Ajustar `complete` para lidar melhor com registros antigos em `connecting`/`completing`.
- Se a conexão ainda não existir no gateway, retornar `pending` por tempo limitado; depois marcar `authorization_not_confirmed`/`disconnected` para a UI poder reconectar.
- Manter idempotência: se a conta já estiver autorizada, criar/recuperar o calendário secundário, salvar `google_email`, `secondary_calendar_id`, `status = connected` e enfileirar o backfill.

### 5. Melhorar o widget para todos os e-mails
- Mostrar estados claros:
  - “Aguardando autorização” somente enquanto o popup está realmente aberto.
  - “Confirmando conexão” enquanto o app chama `complete`.
  - “Conectado” quando houver calendário e e-mail confirmados.
  - “Conexão não finalizada” com botão ativo quando a autorização não se confirmar.
- Não bloquear indefinidamente os controles por registros antigos em `connecting`.

### 6. Garantir sincronização dos eventos no Google Agenda
- Validar que, após conectar, `prepareInitialBackfill` enfileira os eventos das comissões do usuário.
- Validar que `google-sync-worker` processa a fila e cria/atualiza eventos no calendário “FENASOJA — Cronograma”.
- Se necessário, ajustar o acionamento/retentativa do worker para que eventos pendentes sejam enviados após a conexão.

### 7. Testes e validação
- Atualizar testes existentes de callback e widget para cobrir:
  - callback público;
  - popup fechado depois do consentimento;
  - preservação de `timelineYear`, `timelineMonth` e filtros;
  - estado “conectado” após `complete` idempotente;
  - botão de reconexão liberado quando a autorização não finaliza.
- Validar via função backend que o status sai de `connecting` e passa para `connected` quando a autorização estiver disponível.
- Conferir no preview que o widget não fica travado e que os eventos entram na fila/sincronizam.