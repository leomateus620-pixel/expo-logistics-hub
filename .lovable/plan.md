# Validação e sincronização completa do Google Agenda

Contexto: Google Calendar API agora está **Ativada** no seu projeto Google Cloud (confirmado na screenshot). A conexão travada foi limpa e o callback endurecido classifica corretamente probe 403 vs escopos vs API desativada.

## Passo 1 — Você reconecta (única ação manual)
1. Abrir `/cronograma-eventos`
2. Clicar **Reconectar Google Agenda** no widget
3. Login com `leomateus620@gmail.com`
4. Marcar **as duas caixas** de permissão de Agenda
5. Fechar o popup quando o Google mostrar sucesso

Enquanto isso, monitoro os logs em tempo real.

## Passo 2 — Validação técnica automática (eu executo)
Assim que a conexão fechar como `synchronizing`, verifico na ordem:

1. **Logs do callback**: `google_probe_succeeded` (não mais `google_probe_failed`)
2. **Banco**: `google_calendar_connections` do seu user_id com
   - `status = 'connected'` ou `'synchronizing'`
   - `secondary_calendar_id` preenchido (calendário FENASOJA criado)
   - `verified_at` preenchido
   - `error_code IS NULL`
3. **Google real**: o worker cria/atualiza um evento e loga `remote_event_verified` com o `htmlLink` do Google

Se algo falhar, capturo o `safeCode` do log e corrijo antes de prosseguir — sem loop silencioso.

## Passo 3 — Enfileirar todos os eventos para o seu calendário
Para todo evento em `cronograma_eventos` com data ≥ hoje e vinculado à sua organização:

1. Inserir/atualizar linha em `google_calendar_event_mappings` com
   - `user_id` = seu id
   - `event_id` = id do cronograma
   - `sync_status = 'pending'`
   - `operation = 'upsert'`
2. Disparar `google-sync-worker` manualmente (batch 25) até drenar a fila
3. Contar quantos eventos ficaram com `sync_status = 'synced'` e quantos com `error`
4. Para cada erro, mostrar o código Google exato retornado

## Passo 4 — Prova viva
- Envio o link `htmlLink` de 1 evento sincronizado (você abre e vê no seu Google Agenda)
- Envio a contagem final: `X sincronizados / Y com erro / Z pendentes`
- Se houver erro, corrijo na hora antes de encerrar

## Detalhes técnicos
- **Sem novas migrations**: uso apenas `UPDATE`/`INSERT` nas tabelas existentes (`google_calendar_event_mappings`)
- **Sem novo código de app**: reaproveita `google-sync-worker` já deployado
- **Disparo do worker**: via `supabase.functions.invoke` com `X-Worker-Token` (token já configurado)
- **Escopo**: só eventos futuros da sua org atual — não polui o Agenda com eventos vencidos

Confirma? Ao aprovar, eu apenas espero você clicar Reconectar e a partir daí executo os passos 2–4 sozinho.