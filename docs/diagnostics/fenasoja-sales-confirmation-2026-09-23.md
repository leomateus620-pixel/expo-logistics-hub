# Falha na confirmação de vendas — Mapa Comercial (23/09/2026)

## Ambiente analisado

- Banco de fato usado pelo aplicativo (Lovable Cloud / Postgres do projeto), consultado em 23/09/2026 ~08:20 UTC (05:20 America/Sao_Paulo).
- Função inspecionada com `pg_get_functiondef` e esquema com `information_schema.columns` (somente leitura).

## Evidência (sanitizada)

Definição **instalada** de `public.register_commercial_sale_order`, no `INSERT INTO public.lot_sales`:

```sql
coalesce((SELECT nome FROM public.profiles WHERE id = auth.uid()), 'Equipe comercial')
```

Esquema real de `public.profiles`: `id (uuid)`, `user_id (uuid)`, `full_name (text)`, `created_at (timestamptz)`.
Não existe coluna `nome`; o vínculo com o usuário autenticado é `user_id`.
Verificação complementar: dos 89 perfis existentes, **89 têm `id <> user_id`** — o filtro antigo jamais encontraria o perfil correto mesmo que a coluna existisse.

## Causa confirmada

Referência a coluna inexistente (`nome`) dentro do corpo da função → erro de execução (`undefined_column`, SQLSTATE 42703) no primeiro `INSERT` em `lot_sales`. Como tudo roda em uma única transação, a venda inteira é revertida e o app exibe "Venda não concluída — nenhum espaço foi alterado". Ocorre para qualquer espaço (pavilhão ou lote externo), pois o ponto de falha é posterior à validação de elegibilidade e preço.

Defeito secundário (app): o erro do banco era convertido apenas em texto genérico, descartando código, detalhe e dica — impedindo diagnóstico.

## Correção aplicada

### Banco

Nova migração com `CREATE OR REPLACE FUNCTION` sobre a definição instalada, preservando assinatura, elegibilidade por `commercial_sale_eligibility`, `FOR UPDATE`, recálculo de preço no servidor, conferências de total/parcelas, histórico, auditoria, idempotência e atomicidade. Única mudança funcional:

```sql
v_salesperson_name := coalesce(
  (SELECT nullif(btrim(p.full_name), '') FROM public.profiles AS p WHERE p.user_id = auth.uid()),
  'Equipe comercial'
);
```

Resolvido uma vez, após a validação de sessão. `salesperson_user_id = auth.uid()` preservado. Nenhuma coluna criada, nenhuma permissão ampliada, RLS intacta.

Verificação pós-aplicação: `pg_get_functiondef` contém `full_name` e não contém mais `SELECT nome`.

Varredura de rotinas ativas: o padrão defeituoso aparecia apenas nesta função (migrations `20260916043104_*` e `20260916050233_*`); nenhuma outra rotina ativa consulta `profiles.nome` ou filtra `profiles.id = auth.uid()`.

### Aplicativo

- `src/features/commercial-map/sales/salesErrors.ts` (novo): `SalesOrderError` com mensagem segura + diagnóstico tipado, classificação (`BUSINESS`/`AUTH`/`SCHEMA`/`NETWORK`/`UNKNOWN`), sanitização de CPF/CNPJ/telefone/e-mail/credenciais e evento estruturado `commercial_sale_order_failed`.
- `src/features/commercial-map/sales/salesService.ts`: erro relançado preservando código/detalhe/dica/status HTTP quando disponível; retorno nulo ou não-UUID deixa de ser tratado como sucesso.
- `src/features/commercial-map/sales/useSalesCheckout.ts`: falha de comunicação passa a ser tratada como resultado **indeterminado** (não afirma "nenhum espaço foi alterado"), revalida o mapa e mantém seleção, formulário e a mesma chave de idempotência para reenvio sem duplicar.

## Testes executados

- `src/test/salesOrderErrors.test.ts` (novo, 8 casos): classificação de esquema/negócio/sessão/rede, sanitização de dados pessoais, retorno inválido não vira sucesso, preservação do código técnico com mensagem segura.
- `src/test/salesMode.test.ts` e `src/test/salesModeInteraction.test.ts`: aprovados.
- Verificação de tipos (`tsc --noEmit`) e análise de código: sem erros (apenas 2 avisos pré-existentes de fast-refresh).

## Pendências

- Não foi possível executar teste de integração autenticado contra a função SQL neste ambiente (o acesso direto ao banco é restrito e não executa funções; não há banco de testes isolado configurado no projeto). A correção foi comprovada por: esquema real, definição instalada antes/depois e a constatação de que `id <> user_id` em 100% dos perfis.
- Validação funcional final (confirmar uma venda real pela interface, com usuário autorizado, e conferir por nova leitura o pedido, itens, parcelas e status dos espaços) ainda depende de execução autorizada pela equipe.
- Nada foi publicado em produção.
