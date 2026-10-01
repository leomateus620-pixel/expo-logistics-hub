# Aplicar migração da PR #180 (preço oficial no mapa)

Objetivo: acrescentar `entity_id` ao final da view de preços oficiais, para o Mapa Comercial carregar preços na mesma consulta. Nenhum lote, venda, contrato, preço ou regra de acesso muda.

## Passos
1. **Conferência prévia (leitura):** ler a definição atual da view e a lista ordenada de colunas, confirmar `security_invoker=on`, permissões atuais e que `entity_id` ainda não existe. Confirmar que o arquivo local é idêntico ao da branch `codex/dashboard-values-map-fit` (o teste de contrato do repositório já compara a view com a original, mudando só `entity_id`).
2. **Aplicar** o arquivo `supabase/migrations/20261001193000_commercial_dashboard_financial_embed.sql` byte a byte pela ferramenta de migração (inclui `NOTIFY pgrst, 'reload schema'`). Sem reaplicar migrações históricas, sem tabelas, views, RPCs ou políticas novas.
3. **Validar (leitura):**
   - colunas anteriores na mesma ordem, `entity_id` como última coluna;
   - `security_invoker=on` e permissões iguais às de antes;
   - relação `commercial_lots.entity_id` (única) → `map_entities` → view;
   - contagem/totais agregados da view iguais aos de antes (sem expor linhas).
4. **Probe público:** rodar `node scripts/dashboard/remote-pricing-gate.cjs /tmp/pricing-gate.json` com a chave pública do `.env`. Esperado: dois probes HTTP 200, array vazio, `ready=true`.
5. **Entregar:** resultado, registro da migração e saída dos probes, sem credenciais nem dados comerciais. Não publicar.

## Detalhes técnicos
- `CREATE OR REPLACE VIEW` só aceita colunas novas no final; o arquivo cumpre isso (`entity_id` no fim do SELECT final; no CTE interno é só referência).
- Se a conferência prévia mostrar divergência da definição atual em relação à original esperada, paro e informo antes de aplicar.
