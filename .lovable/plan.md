# Aplicar migração commercial_revision_order_contracts (PR #217)

## Estado confirmado
- Projeto: o banco Lovable Cloud ligado a este app (mesmo ambiente das migrações 0021–0023).
- Branch da PR #217 já está no código: `supabase/migrations/20261020110000_commercial_revision_order_contracts.sql` e `drizzle/migrations/0024_commercial_revision_order_contracts.sql` têm conteúdo idêntico, e a 0024 já consta no journal do Drizzle (última entrada).
- A função `commercial_map_revision(uuid)` existe hoje no banco (versão anterior ou já atualizada — a confirmar no passo 1).

## Passos
1. **Pré-checagem**: ler definição atual (`pg_get_functiondef`), ACL (`proacl`), `prosecdef` e `proconfig`; comparar com o arquivo para saber se a 0024 já foi aplicada.
2. **Backup de rollback**: salvar a definição atual + REVOKE/GRANT originais em `docs/validation/commercial-revision/rollback_commercial_map_revision_2026-10-20.sql`.
3. **Aplicação (um único caminho)**: aplicar pelo mecanismo oficial Drizzle usando a entrada 0024 já existente no journal (conteúdo byte a byte do arquivo). Não executar o arquivo de `supabase/migrations` separadamente. Se já estiver aplicada, não reexecutar — apenas validar.
4. **Verificação final**: definição igual ao arquivo; SECURITY DEFINER; `search_path=public, pg_temp`; checagem `AUTH_REQUIRED`/`MAP_PERMISSION_DENIED` presente; EXECUTE só para `authenticated`/`service_role`/owner (sem PUBLIC/anon); chamada via API como anônimo → negada; chamada autenticada real → retorna hash (schema do PostgREST recarregado).
5. **Integridade**: contagens de `commercial_lots`, `lot_sales`, `lot_sale_orders`, `lot_sale_order_items`, `lot_contracts`, `lot_contract_lots`, `map_entity_geometries` e número de políticas RLS idênticos antes/depois.
6. **Validação isolada (sem tocar produção)**: rodar em PGlite local (como `scripts/dashboard/occupancy-db-qa.mjs`) com dois projetos: criar/substituir/desativar contrato ORDER_ITEMS e incluir/remover lote em `lot_contract_lots` no projeto A → revisão de A muda, revisão de B permanece igual. Também confirmar que versão antiga não detectava (regressão).
7. **Relatório** em `docs/validation/commercial-revision/production-apply-2026-10-20.md` com projeto, migração registrada, resultados e local do backup.

## Fora de escopo
Nenhuma alteração em vendas, assinaturas, contratos, preços, geometrias, históricos ou RLS. Em caso de erro: parar e reportar diagnóstico.
