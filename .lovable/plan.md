## Objetivo

Aplicar a Migration 2 (`20260727160100_create_venue_events_transactions.sql` — 4.006 linhas, 151 KB) no projeto Supabase correto, criando todas as 20+ RPCs `SECURITY DEFINER` que sustentam o CRUD do módulo "Eventos Restaurante e Arena".

## Estratégia

Enviar o arquivo em **3 chunks sequenciais** via `supabase--migration`, cada um alinhado a fronteiras de função (nenhum `$$ ... $$` cortado ao meio). Como o limite de tokens de saída por resposta impede submeter os 151 KB numa única chamada, cada chunk vira uma migração separada — funcionalmente equivalente ao arquivo original, apenas registrada como 3 entradas em `supabase_migrations.schema_migrations`.

### Divisão

| Chunk | Linhas | Tamanho | Conteúdo |
|-------|--------|---------|----------|
| 2a    | 1–1067 | ~34 KB  | Helpers (`venue_assert_capability`, `venue_log_audit`, redação de PII, idempotência), `venue_get_permissions`, `venue_get_audit_history`, `venue_calculate_usage_quantity`, `venue_check_availability`, `venue_clear_usage_excess_approval`, `venue_recalculate_agreement_excess`, `venue_sync_event_counterpart`, `venue_refresh_occupancies` |
| 2b    | 1068–2467 | ~58 KB | `venue_save_event` (680 linhas) + `venue_transition_event` (655 linhas) |
| 2c    | 2468–4006 | ~59 KB | `venue_upsert_stakeholder`, `venue_upsert_agreement`, `venue_upsert_space`, `venue_upsert_space_block` e demais RPCs finais |

Cada chunk é executado em transação própria pelo tool. Se algum falhar, os anteriores permanecem — as RPCs seguintes referenciam apenas helpers do próprio arquivo, então a ordem 2a → 2b → 2c respeita todas as dependências.

## Passos

1. **Aplicar chunk 2a** — helpers e funções de leitura. Sem dependências externas além das tabelas já criadas na Migration 1.
2. **Aplicar chunk 2b** — `venue_save_event` e `venue_transition_event`, que usam os helpers do 2a.
3. **Aplicar chunk 2c** — RPCs de upsert (stakeholder, agreement, space, space_block etc.).
4. **Validar via `supabase--read_query`**: contar quantas funções `venue_*` existem em `pg_proc` e conferir se bate com o total esperado do arquivo (~20 RPCs + helpers).
5. **Rodar `supabase--linter`** para verificar se nenhuma função ficou com `search_path` aberto ou security warning.
6. **Recarregar o preview** em `/eventos-restaurante-arena` e confirmar que o erro "O domínio operacional não pôde ser carregado" desapareceu — o hook `useVenueOperations` passa a resolver as RPCs.

## Validação

- `select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'venue\_%'` deve mostrar o número esperado de funções.
- A tela `/eventos-restaurante-arena` carrega o workspace sem toast de erro.
- `supabase--linter` sem novas advertências críticas relacionadas às funções recém-criadas.

## Fora de escopo

- Não alterar código do frontend do módulo (já está pronto e aguardando as RPCs).
- Não modificar Migration 1 nem tabelas existentes.
- Não criar dados de teste — o seed automático da Migration 1 já provisiona Restaurante e Arena por org.
