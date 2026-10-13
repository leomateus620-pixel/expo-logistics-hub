# Despesas 2028 — Etapa 1: infraestrutura operacional

## 1. Diagnóstico (confirmado nesta leitura)

| Item | Código | Banco ativo | Pendente |
|---|---|---|---|
| Campos financeiros em `expenses` (edição, comissão, linha, `planned_cents`, `committed_cents`, `committed_on`, `financial_due_date`, `financial_status`, `financial_version`) | sim | sim | — |
| `financial_save_expense` (cria/edita, versão, idempotência, auditoria, exige `financial_confirm` para realizar, motivo ao cancelar) | migration 20261006200356 | sim | categoria, favorecido, datas previstas, regras de cancelamento com pagamentos, transições explícitas |
| `financial_expense_obligation_trg`, `financial_record_movement`, `financial_reverse_movement`, `financial_reconcile_obligation` | sim | sim | reaproveitar; testar com despesas |
| `financial_categories` (domínio, pai, nome, ativo, ordem, versão) | sim | sim, 0 linhas | RPCs de categoria, ícone/cor, vínculo com despesa |
| `financial_budget_execution`, `financial_edition_summary` | sim | sim | consultas próprias de despesas |
| Listagem/detalhe/comparação de despesas | não | não | criar |
| RLS de `expenses`: operador/gestor podem `UPDATE` qualquer coluna; qualquer membro lê tudo | — | sim | proteger colunas financeiras |
| Telas Despesas Previstas/Realizadas | `PendingView` | — | substituir |
| Dados: 0 despesas financeiras, 0 obrigações | — | sim | nenhum backfill |

`expenses.category_id` continua sendo exclusivo da logística.

## 2. Modelo
- Uma linha de `expenses` = uma despesa com identidade estável. `planned_cents` (null = sem previsão) e `committed_cents` (null = não realizada) coexistem; nunca somados.
- Novas colunas (nullable, incrementais): `financial_category_id` → `financial_categories`, `payee_name`, `planned_on` (data prevista), `financial_notes`, `cancel_reason`. Significado das datas: `planned_on` = previsão; `committed_on` = competência/realização; `financial_due_date` = vencimento; pagamento = `financial_movements.occurred_on`.
- `financial_categories`: adicionar `icon`, `color` (somente visual); índice único (org, domain, lower(name)) entre ativas; trigger anti-ciclo e mesma organização/domínio do pai.
- Chaves compostas/checks: categoria, comissão, linha e edição validadas pela organização (FK composta onde possível + trigger); linha orçamentária precisa bater com a comissão quando ambas existirem.
- Pago e saldo derivados de alocações, nunca editáveis.

## 3. Transições
```text
prevista ──realizar(financial_confirm)──> realizada
prevista ──cancelar(motivo)──> cancelada
realizada ──reverter p/ prevista(motivo, sem pagamento líquido)──> prevista
realizada ──cancelar(motivo, sem pagamento líquido)──> cancelada
(nova) ──cadastrar realizada direta──> realizada (planned_cents fica null)
```
Obrigação: uma por despesa realizada (já garantida pelo trigger + índice único); valor não pode ficar abaixo do liquidado líquido; cancelar/reverter desativa a obrigação só se o líquido for zero.

## 4. RPCs (contratos)
| RPC | Permissão | Efeito |
|---|---|---|
| `financial_save_expense` (evoluída) | `financial_edit` (+`financial_confirm` para realizar) | cria/edita; valida categoria ativa de despesa, comissão×linha, datas, valores ≥0 e ≤ 2^53; bloqueia campos de pagamento |
| `financial_transition_expense(org, id, to, expected_version, reason, request_id, committed_cents?, committed_on?)` | `financial_confirm` / `financial_edit` | realizar, reverter, cancelar com regras acima |
| `financial_list_expenses(org, edition, filtros, limit, offset)` | `financial_view` | página + total de linhas |
| `financial_expense_detail(org, id)` | `financial_view` | despesa, obrigação, movimentos, auditoria |
| `financial_expense_comparison(org, edition, filtros)` | `financial_view` | totais projetado/realizado/pago líquido/saldo/vencidas, realizadas sem previsão, por categoria e comissão, desvio = realizado − projetado, percentual null com estado `sem_previsao` |
| `financial_list_categories` / `financial_save_category` / `financial_reorder_categories` / `financial_archive_category` | view / `financial_categories_admin` (admin) | arquivar não desvincula |
| `financial_seed_expense_categories(org)` | admin | nomes de 2026, idempotente, não sobrescreve |
| Pagar/estornar | reutiliza `financial_record_movement` / `financial_reverse_movement` | — |

Todas SECURITY DEFINER, `search_path=public`, EXECUTE só para `authenticated`, edição 2026 rejeitada por `financial_require_operational`. Agregações com subconsultas pré-agregadas (alocações por obrigação) para evitar duplicação.

## 5. Segurança em `expenses`
- Trigger BEFORE UPDATE/INSERT: colunas financeiras só mudam dentro das RPCs (flag de sessão `financial.rpc`); demais colunas logísticas seguem funcionando.
- SELECT: linhas com `financial_edition_id` só visíveis para `financial_can(org,'financial_view')`; logística inalterada.
- Despesas logísticas sem edição financeira ficam fora dos totais.

## 6. Frontend mínimo
- `financialExpensesApi.ts` tipado + hooks React Query (chaves com org, edição, filtros); invalidação de lista, detalhe, comparação, execução orçamentária e painel após sucesso.
- `Financial2028Expenses.tsx` compartilhado pelas rotas `despesas-previstas` e `despesas-realizadas` (foco inicial diferente), duas colunas Projetado | Realizado reaproveitando o divisor das receitas se existir; indicadores, ranking horizontal, lista paginada, formulário (cria/edita/realiza/cancela) com `request_id` estável por tentativa, gerenciador de categorias.
- Estados distintos: sem infraestrutura, sem permissão, rede, conflito, vazio.

## 7. Testes e entrega
- Novo `docs/financeiro-2028/expenses-test.sql` + extensão de `local-concurrency.sh`, rodados contra banco local com as migrações reais e papéis `authenticated` restritos: persistência, obrigação única, realizada sem previsão, pagamento parcial/integral/estorno, cancelamento com pagamento, categorias/arquivamento, isolamento de organização, bloqueio 2026, logístico sem acesso, replay e conflito, totais com várias páginas.
- Vitest para mapeamento/erros/desvio; typecheck e build.
- Documento `docs/financeiro-2028/DESPESAS_2028_ETAPA1.md` com diagnóstico, modelo, matriz, contratos, aplicação e rollback (`rollback_expenses_2028.sql`).
- Migrações aplicadas no banco do projeto (sem dados reais criados); validação no banco ativo descrita separadamente. Sem publicação.
- Atualizar `src/features/financial-management/AGENTS.md`.

## Riscos
- Se não houver Postgres local disponível no ambiente, os testes SQL serão executados apenas em transações revertidas no banco do projeto, ou ficarão pendentes e declarados como tal.
