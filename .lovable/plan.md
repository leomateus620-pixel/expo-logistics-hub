# Financeiro 2028: estornos seguros e obrigações vinculadas à origem

## Objetivo
1. Nenhum estorno, devolução ou recebimento parcial pode deixar uma obrigação com quitação negativa ou acima do valor dela. Isso vale também quando duas pessoas registram ao mesmo tempo.
2. Uma obrigação ligada a uma receita, a um patrocínio ou a uma parcela comercial só existe se essa origem for real e for da mesma organização e edição. Cada fato financeiro tem no máximo uma obrigação, mesmo que a gravação seja repetida.

Tudo continua só no rascunho e no banco local de teste. Nada é aplicado no sistema real nem publicado.

## 1. Estorno com saldo líquido
- Ao estornar, o sistema bloqueia o movimento original e todas as obrigações que ele afeta antes de gravar qualquer coisa. O bloqueio segue sempre a mesma ordem, para que duas operações simultâneas não travem uma à outra.
- Depois recalcula a quitação líquida de cada obrigação, já contando o estorno:
  - se ficaria negativa ou acima do valor, recusa com `FINANCIAL_REVERSAL_EXCEEDS_NET`;
  - a recusa informa qual movimento precisa ser estornado antes.
- **Ordem dos movimentos:** uma devolução ou um estorno que dependa do movimento original precisa ser desfeito primeiro.
  - Exemplo: recebeu 100, devolveu 40 e tenta estornar os 100. É recusado, porque a quitação iria a −40.
  - Para corrigir, primeiro estorna a devolução (a quitação volta a 100) e depois estorna o recebimento (vai a 0).
- **Obrigação cancelada ou com aviso de inconsistência:** o estorno que reduz a quitação é permitido. Quando o pago/recebido chega a 0, o aviso de inconsistência some e a obrigação fica cancelada.
- O registro de pagamentos e recebimentos passa a bloquear as obrigações na mesma ordem fixa e soma as parcelas repetidas da mesma obrigação. A verificação do saldo considera tudo o que já foi gravado antes, inclusive por outra transação concluída no meio.

## 2. Obrigação com origem validada
Antes de gravar, o sistema bloqueia a origem e confere que ela existe, pertence à organização e está na edição informada:

| Origem | Condição para a obrigação existir | Valor da obrigação |
|---|---|---|
| Receita | Receita confirmada | Valor confirmado (não editável) |
| Patrocínio | Patrocínio não cancelado e com valor confirmado | Livre + Rouanet confirmados (não editável) |
| Despesa | Despesa realizada | Valor realizado (não editável) |
| Parcela comercial | Parcela não cancelada, de pedido não cancelado de um mapa da organização, na edição operacional 2028 | Valor da parcela em centavos (não editável) |
| Manual | Sem origem; valor e descrição informados | Valor informado |

- Origem inexistente, de outra organização ou de outra edição é recusada (`FINANCIAL_SOURCE_INVALID`). Uma origem não executada (receita projetada, parcela cancelada) também é recusada (`FINANCIAL_SOURCE_NOT_EXECUTED`).
- Valor diferente do valor da origem é recusado (`FINANCIAL_AMOUNT_DERIVED`). Só obrigações manuais aceitam valor digitado.
- **Uma obrigação por origem:** quando a origem já tem obrigação, a gravação devolve essa mesma obrigação, já reconciliada. Isso vale para nova tentativa, outro código de requisição ou duas gravações simultâneas, sem criar uma segunda.
- **Reconciliação:** cada gravação e cada pagamento/recebimento recalcula o valor a partir da origem.
  - Se a revisão da venda mudou a parcela, o valor é atualizado.
  - Se o novo valor ficaria abaixo do que já foi quitado, nada é alterado e a obrigação é marcada como inconsistente para correção.
  - As tabelas comerciais e o fluxo de revisão de vendas não são alterados.

## Testes no banco local (dados inventados)
- Recebe 100, devolve 40 e estorna o recebimento: recusado. Quitação continua 60, sem novo movimento.
- Estorna a devolução e depois o recebimento: quitação 100 e depois 0.
- Recebimento parcial seguido de estorno: volta ao saldo anterior.
- Estorno duplo: recusado.
- Concorrência entre duas sessões:
  - estorno e devolução simultâneos na mesma obrigação: só um passa, e a quitação nunca fica negativa;
  - dois recebimentos simultâneos acima do valor: só um passa.
- Obrigação com origem inexistente, de outra organização, de outra edição ou da edição 2026: recusada.
- Receita projetada: recusada.
- Valor divergente da origem: recusado.
- Repetição com outro código de requisição e duas gravações simultâneas: uma única obrigação.
- Parcela revisada: valor reconciliado. Abaixo do quitado: marcada inconsistente.
- Os 34 testes atuais continuam passando.

## Detalhes técnicos
- **`financial_reverse_movement`:**
  1. `SELECT ... FOR UPDATE` no original e verificação de `kind`.
  2. `PERFORM 1 FROM financial_obligations WHERE id IN (alocações do original) ORDER BY id FOR UPDATE`.
  3. Validação de `settled − alloc` por obrigação dentro de `0..amount_cents` antes do INSERT. Depois do INSERT, o `CHECK` é repetido como defesa.
  4. Limpeza de `settlement_inconsistent` e status `cancelada` quando o saldo chega a 0 e a origem está inativa.
- **`financial_record_movement`:**
  - normaliza `_allocations` com `GROUP BY obligation_id`;
  - bloqueia as obrigações `ORDER BY id`;
  - para obrigações com origem, chama antes `financial_reconcile_obligation(o.id)`;
  - valida o saldo após inserir, mantendo o `FINANCIAL_OVER_SETTLEMENT` existente.
- **Nova função interna `financial_resolve_source(_org, _edition, _source_type, _source_id)`:**
  - `SECURITY DEFINER`, sem permissão de execução para clientes;
  - bloqueia a origem e devolve `{active, amount_cents, due_date, description, direction}`;
  - parcela: `lot_sale_installments → lot_sale_orders → map_projects.org_id`, edição = 2028 operacional da organização, `round(amount*100)`.
- **Ramo `obligation` do `financial_save`:**
  - origem ≠ manual: chama `financial_resolve_source` e depois `financial_sync_source_obligation` (os gatilhos já usam essa função), devolvendo a obrigação reconciliada;
  - `INSERT ... ON CONFLICT (source_type, source_id) WHERE source_type <> 'manual' DO NOTHING` seguido de `SELECT ... FOR UPDATE`, sobre o índice único que já existe;
  - `source_type`, `source_id` e `direction` ficam imutáveis depois de criados.
- **Concorrência no teste local:** script com dois `psql` em paralelo, usando `pg_sleep` dentro de transações explícitas e verificando o estado final.
- **Documentação:** a regra entra em `src/features/financial-management/AGENTS.md`.
- **Premissa a confirmar:** parcela comercial pertence à edição 2028 porque o mapa comercial não guarda o ano da edição.
