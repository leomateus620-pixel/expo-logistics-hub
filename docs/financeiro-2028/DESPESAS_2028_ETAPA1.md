# Despesas 2028 — Etapa 1 (infraestrutura operacional)

## 1. Diagnóstico (antes desta etapa)
| Item | Código | Banco ativo | Situação após etapa |
|---|---|---|---|
| Colunas financeiras em `expenses` | migration 20261006200356 | aplicado | reutilizadas |
| `financial_save_expense` | sim | aplicado | evoluída (categoria, favorecido, datas, validações, sem transição em edição) |
| Obrigação por despesa (`financial_expense_obligation_trg` + índice único) | sim | aplicado | reutilizada |
| `financial_record_movement` / `financial_reverse_movement` | sim | aplicado | reutilizadas sem mudança |
| `financial_categories` | sim | aplicado, 0 linhas | + ícone/cor, RPCs dedicadas |
| Listagem, detalhe, comparação | não | não | criados |
| RLS `expenses`: qualquer membro lia, operador alterava qualquer coluna | — | aplicado | leitura financeira restrita; guarda de colunas |
| Telas de despesas | `PendingView` | — | composição compartilhada |

`expenses.category_id` continua exclusivo da logística; a categoria financeira é `financial_category_id`.

## 2. Modelo
- Uma linha `expenses` = uma despesa (identidade estável). `planned_cents` (null = sem previsão) e `committed_cents` (null = não realizada) são dimensões comparativas, nunca somadas.
- Datas: `planned_on` = previsão; `committed_on` = competência/realização; `financial_due_date` = vencimento; pagamento = `financial_movements.occurred_on`.
- Pago líquido e saldo vêm só de `financial_movement_allocations` da obrigação `source_type='despesa'`.
- Vínculos com organização garantida: FK `(org_id, financial_category_id)`, FK `(financial_commission_id, org_id)`, edição FK composta existente; linha orçamentária validada na RPC (edição + comissão do orçamento).
- `cycle_year` da despesa financeira = código da edição. Despesas logísticas (sem `financial_edition_id`) não entram nos totais.

## 3. Operações
| RPC | Permissão | Validações | Efeitos | Erros |
|---|---|---|---|---|
| `financial_save_expense(org, payload, expected_version, request_id, reason)` | `financial_edit`; `financial_confirm` p/ criar realizada ou mudar valor realizado | campos permitidos (sem pago/saldo), centavos inteiros 0..2^53−1, datas ISO, categoria ativa de despesa, comissão×linha, edição operacional, versão | cria/edita; obrigação sincronizada na mesma transação; auditoria | `FINANCIAL_FIELD_NOT_ALLOWED`, `_CONFLICT`, `_EDITION_READ_ONLY`, `_OBLIGATION_BELOW_SETTLED`… |
| `financial_transition_expense(org, id, to, expected_version, payload, reason, request_id)` | edit + confirm (realizar/reverter/cancelar realizada) | transição válida, motivo ≥3, pagamento líquido = 0 para reverter/cancelar | atualiza situação; obrigação aberta/cancelada | `_TRANSITION_INVALID`, `_HAS_SETTLEMENT`, `_NO_PROJECTION` |
| `financial_list_expenses(org, edition, filters, limit≤200, offset)` | `financial_access` | `date_field` ∈ planned_on/committed_on/due_date | página + total | |
| `financial_expense_detail(org, id)` | `financial_access` | | despesa, obrigação, movimentos, histórico | |
| `financial_expense_comparison(org, edition, filters)` | `financial_access` | | totais, por categoria/comissão, desvio, vencidas, realizadas sem previsão | |
| `financial_list_categories` / `financial_save_category` / `financial_reorder_categories` / `financial_seed_expense_categories` | access / `financial_admin` | domínio, duplicidade ativa (case-insensitive), pai do mesmo domínio, sem ciclos | arquivar não desvincula | `_CATEGORY_*` |
| Pagar / estornar | `financial_settle` | saldo líquido 0..valor | movimentos e alocações | `_OVER_SETTLEMENT`, `_REVERSAL_EXCEEDS_NET` |

Idempotência: mesma chave + mesmo conteúdo devolve o resultado anterior; conteúdo diferente → `FINANCIAL_IDEMPOTENCY_CONFLICT`.

Transições:
```text
prevista --realizar--> realizada --reverter (motivo, pago=0, com previsão)--> prevista
prevista/realizada --cancelar (motivo, pago=0)--> cancelada (terminal)
nova --realizada direta--> realizada (projetado permanece null)
```

## 4. Comparação
- Desvio = realizado − projetado (positivo = acima da previsão). Percentual só quando projetado > 0; senão `comparison_state='sem_previsao'`.
- Projetado exclui canceladas; realizado conta só `realizada`.
- Pagamentos agregados por obrigação antes do join (sem duplicação por alocações).
- Filtro de período usa um campo explícito (`date_field`); pago considera todos os pagamentos das despesas filtradas.
- Totais por edição: agregação no servidor sobre todos os registros filtrados, independente da página.

## 5. Segurança
- `exp_select`: linhas com edição financeira só aparecem para quem tem acesso financeiro (conjunto `financial_accessible_org_ids()`).
- Trigger `financial_expense_guard`: colunas financeiras e despesas financeiras só mudam/apagam dentro das RPCs. Logística segue igual.
- Funções internas sem EXECUTE para `authenticated`; RPCs públicas só para `authenticated`.

## 6. Evidência (banco do projeto, transação revertida)
`docs/financeiro-2028/expenses-test.sql` executado em 13/10/2026 como `authenticated` (admin e operador logístico). Resultado:
`seed:12/0 ok:cycle ok:dup ok:replay ok:keyconflict ok:paidfield ok:fraction ok:2026 edit:v2 ok:conflict realize:planned=100000,committed=120000,obl=1 direct:planned=null ok:overpay ok:cancelpaid ok:belowsettled cmp:planned=100000,committed=170000,paid=40000,open=130000,dev=70000,pct=70.00,noplan=1 reversed:paid=0 revert:status=prevista,planned=100000 ok:revertnoplan cancel:cancelada page:total=2,items=1 archived:linked=1 ok:archivedlink ok:otherorg ok:directadmin ok:oplist ok:opsave opvisible=0 opupdate=0 ok:opinsert`
Após o teste: 0 categorias e 0 despesas financeiras persistidas.

## 7. Aplicação e pendências
- Migrações aplicadas: `drizzle/migrations/0004_financial_expenses_2028_stage1.sql`, `0005_financial_category_audit_entity_fix.sql`. Rollback: `rollback_expenses_2028.sql`.
- Pendente: teste de concorrência real em duas sessões (o script atual roda numa só transação); conferência visual autenticada; refinamento visual; categorias sugeridas não foram carregadas (botão no gerenciador). Sem publicação.
