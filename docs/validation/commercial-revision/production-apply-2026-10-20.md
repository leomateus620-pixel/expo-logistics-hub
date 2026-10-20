# commercial_map_revision — ORDER_ITEMS (PR #217) — 2026-10-20

- Ambiente: banco Lovable Cloud deste app (o mesmo das migrações 0021–0023).
- Antes: função sem ramo ORDER_ITEMS (versão anterior). SECURITY DEFINER, `search_path=public, pg_temp`, EXECUTE só postgres/authenticated/service_role.
- Backup: `rollback_commercial_map_revision_2026-10-20.sql` (nesta pasta).
- Aplicação: mecanismo oficial Drizzle. A entrada 0024 (já no journal pela branch) foi aplicada como pendente; a ferramenta também registrou 0025 com SQL idêntico (byte a byte). `CREATE OR REPLACE` é idempotente: resultado final é uma única definição. O arquivo de `supabase/migrations` não foi executado à parte.
- Depois: definição contém ORDER_ITEMS; SECURITY DEFINER e search_path preservados; ACL idêntica (sem PUBLIC/anon).
- PostgREST: anônimo → 42501 permission denied; autenticado projeto real → hash (estável em 2 chamadas); projeto sem acesso → MAP_PERMISSION_DENIED.
- Integridade (antes = depois): lots 1637, lot_sales 600, orders 126, items 600, contracts 79, contract_lots 0, geometrias 1805, políticas RLS 381.
- Validação isolada (PGlite, dois projetos): ver `isolated-pglite-results.txt`. Versão antiga não detectava nenhuma das 7 mudanças; nova detecta todas no projeto A e não altera o projeto B.
- Sem dados reais: produção tem 0 vínculos em `lot_contract_lots`; nenhum registro fictício criado em produção.
