## Marco real identificado

O último marco comprovado no backend foi:

1. O popup retornou para `/google-calendar/callback` com `attempt` e `code` presentes.
2. O backend trocou o `code` e armazenou uma `connection_key` na tabela de conexões.

O marco que **não foi concluído** foi a validação Google pós-troca:

- `google_probe_succeeded` não apareceu nos logs.
- A conexão ficou com `status = error`, `error_code = authorization_not_confirmed`.
- Não existe `secondary_calendar_id`, `verified_at`, `connected_at` nem evento real sincronizado.
- Há 63 itens na fila, mas eles não podem ser processados enquanto a conexão não tiver calendário verificado e geração ativa.

## Correção definitiva proposta

### 1. Tornar o probe Google observável e resiliente

Alterar o helper do Google Calendar para que `probeConnection` não retorne apenas `true/false`.

Ele passará a retornar um resultado estruturado:

```ts
{
  ok: boolean,
  stage: 'calendar_list_probe',
  status: number | null,
  safeCode: string,
  attempts: number
}
```

Também terá retry curto com backoff para cobrir atraso de propagação da chave recém-gerada pelo conector.

### 2. Só marcar conexão como ativa após provas reais

No `google-calendar-oauth`:

- registrar logs sanitizados para cada marco: callback recebido, code trocado, probe Google, calendário pronto, backfill criado;
- se o probe falhar, salvar `error_code` preciso, como `provider_unauthorized`, `provider_bad_request`, `provider_unavailable`, etc.;
- manter a conexão sem `connected_at` e sem `verified_at` até o Google responder 2xx e o calendário secundário estar acessível.

### 3. Garantir calendário secundário e sincronização inicial

Após probe 2xx:

- recuperar ou criar o calendário “FENASOJA — Cronograma”;
- validar acesso ao calendário;
- criar `connection_generation`;
- enfileirar os eventos elegíveis;
- acionar imediatamente o worker de sincronização.

### 4. Corrigir o worker e a prova de evento real

No worker:

- manter processamento apenas quando a conexão estiver verificada;
- registrar erro real de provider em vez de erro genérico;
- confirmar evento remoto via leitura do evento criado/atualizado;
- só considerar tarefa concluída após confirmação do evento no Google.

### 5. Ajustar testes de contrato

Atualizar os testes que ainda esperam a validação antiga por `state` obrigatório, porque o próprio gateway já mostrou que o retorno real vem com `attempt + code` e sem `state`.

Os testes vão cobrir:

- callback com `attempt + code` sem `state`;
- `probeConnection` estruturado;
- conexão só confirmada após probe e calendário;
- frontend não recebe nem expõe `connection_key`.

### 6. Implantar e validar com dados reais

Depois da correção:

- limpar somente os estados travados/incompletos do usuário afetado;
- publicar as funções `google-calendar-oauth` e `google-sync-worker`;
- testar uma nova conexão;
- verificar no banco os marcos reais:
  - `status` conectado/sincronizando;
  - `connection_key` presente;
  - `secondary_calendar_id` presente;
  - `verified_at` presente;
  - pelo menos um item em `google_calendar_event_map` com `google_event_id`;
  - fila avançando para `completed`.

## Resultado esperado

A UI só mostrará “Google Agenda conectado” depois que o backend tiver:

1. recebido o callback OAuth;
2. trocado o código por chave final;
3. recebido 2xx do Google Calendar;
4. criado/validado o calendário FENASOJA;
5. disparado sincronização inicial;
6. confirmado evento real no Google Agenda.