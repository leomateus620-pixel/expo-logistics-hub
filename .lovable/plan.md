# Aplicar migração PR #221 — fluxo de caixa comercial e tempo de assinatura

## Estado confirmado
- Arquivo `supabase/migrations/20261021223000_commercial_sales_analytics.sql` presente no código (23.356 bytes).
- Banco ativo (Lovable Cloud do app, histórico oficial até 0025): tabela `commercial_signature_completions` e RPCs `commercial_sales_*` ainda não existem — migração não aplicada.
- Guarda: md5 atual de `confirm_sale_order_items` = `8eea4424…a475`, idêntico ao esperado pelo SQL. Sem divergência.

## Passos
1. Snapshot de contagens/somas antes (lotes, vendas, valores negociados, pedidos, itens, parcelas e status PAID/PENDING, contratos, histórico) e backup da definição atual de `confirm_sale_order_items` em `docs/validation/commercial-analytics/rollback_*.sql`.
2. Aplicar o arquivo integral, byte a byte, pela ferramenta oficial de migração (transação única; erro = rollback total). Guarda mantida. Nenhuma outra migração.
3. Releitura pós-COMMIT: registro no histórico, tabela + GRANTs + RLS, 3 RPCs (SECURITY DEFINER, sem execução para anon), nova `confirm_sale_order_items` com mesmo contrato de retorno e inserção idempotente; backfill conferido só com evidência histórica (sem datas fabricadas).
4. Validação com dados reais em sessão autorizada (somente leitura das RPCs):
   - soma meses = soma anos = total; previsto = baixas + saldo; confirmado = coberto + sem distribuição;
   - pedidos com vários itens sem multiplicar parcelas; parciais/taxas excluídas como no SQL;
   - média de assinatura sem pendentes, legado ou datas inválidas;
   - anônimo negado; map.view não recebe dados (sem conta disponível só com map.view, verifico pela lógica da função e informo).
5. Contagens após = antes.
6. Atualizar tipos gerados, typecheck/build, testes da Dashboard comercial.
7. Navegador autenticado: abrir fluxo, alternar bases principal/cobrança, mês, assinaturas, recarregar e confirmar releitura; erro de RPC exibido como erro, nunca zero.
8. Relatório curto em `docs/validation/commercial-analytics/production-apply-2026-10-22.md`.

Sem criar vendas, pagamentos ou confirmações de teste no banco ativo.
