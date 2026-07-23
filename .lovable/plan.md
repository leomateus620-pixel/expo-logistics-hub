## Diagnóstico

Todas as três conexões estão com `oauth_provider = google_direct` e `refresh_token_ciphertext` populado, mas `connection_key = NULL` (esse campo era do fluxo antigo App User Connector).

O RPC `public.queue_google_sync_for_user` ainda exige:

```sql
WHERE ... AND connection_key IS NOT NULL AND secondary_calendar_id IS NOT NULL
```

Como o novo fluxo direto nunca preenche `connection_key`, o RPC devolve imediatamente sem enfileirar nada. Isso causa os dois sintomas:

1. **Soltis e Djeison sem backfill (0/150):** `prepareInitialBackfill` no callback chama esse RPC evento a evento — todas as chamadas viram no-op. O `backfill_total` é atualizado direto na tabela (por isso mostra 150), mas nenhuma linha entra em `google_sync_outbox` para a `connection_generation` atual.
2. **Novos eventos não sincronizam para o Leonardo:** o trigger `trg_evento_google_sync_write` → `enqueue_google_sync` → `queue_google_sync_for_user` é bloqueado pelo mesmo filtro. Os 140 eventos do Leonardo só foram parar no outbox porque foram inseridos manualmente em turno anterior; o trigger nunca funcionou para `google_direct`. Por isso os 3 eventos criados hoje (`Teste evento fenaosja`, `REUNIÃO AGÊNCIA 22 PERFORMANCE`, `JANTAR DE RELACIONAMENTO AGCO`) e outros 9 mais antigos estão fora do outbox dele.

## Correções

### 1. Migração — corrigir o filtro do RPC

Substituir a condição em `public.queue_google_sync_for_user` para reconhecer o provider direto:

```sql
AND secondary_calendar_id IS NOT NULL
AND (connection_key IS NOT NULL OR refresh_token_ciphertext IS NOT NULL)
```

Isso cobre conexões novas (`google_direct`) sem quebrar registros legados.

### 2. Reprocessar backfill de Soltis e Djeison

Chamar `queue_google_sync_for_user` (agora funcional) para cada evento futuro da org na conexão atual de cada um, marcando `_initial_backfill = true`. Ajustar `backfill_done = 0` e `backfill_total` para refletir a fila real.

### 3. Enfileirar os 12 eventos faltantes do Leonardo

Mesmo RPC, sem `_initial_backfill`, para os 12 event_ids que hoje não têm linha no outbox dele. Isso inclui o `Teste evento fenaosja` recém-criado.

### 4. Disparar o worker

`POST /functions/v1/google-sync-worker` com `X-Worker-Token` em batches até `queued = 0` para as três contas. O `pg_cron` de 5 min continua rodando automaticamente daí em diante.

### 5. Validação

- `google_sync_outbox` sem `queued`/`failed` para as três contas.
- `google_calendar_connections` com `backfill_done = backfill_total` e `status = 'connected'` (a UI passa a exibir **"Conectado"** via `useGoogleCalendarConnection`).
- Criar um evento de teste após a migração e confirmar via `SELECT` que aparece uma linha `queued` para cada conexão ativa automaticamente (validando o trigger).

## Fora de escopo

Sem mudanças de UI, sem alterar callback, worker, event-reminders ou frontend — o bug é 100% na condição do RPC. Os lembretes (24h/2h/1h) já estão ativos e passarão a agendar automaticamente conforme os eventos entrarem no `event_reminder_deliveries`.
