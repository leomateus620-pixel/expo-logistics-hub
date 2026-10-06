# Financeiro 2028: execução separada de liquidação

## A regra
Cada registro tem quatro estágios. Cada estágio tem seu próprio valor, e nenhum deles é deduzido de outro.

| Estágio | Despesa | Receita | De onde vem |
|---|---|---|---|
| 1. Previsto | Valor previsto | Valor projetado | Informado no cadastro |
| 2. Executado | **Realizado/comprometido**: o serviço foi contratado ou executado e a dívida existe | **Confirmado**: há contrato ou compromisso | Informado no cadastro, com data de realização/confirmação e vencimento |
| 3. Liquidado | **Pago** | **Recebido** | Soma dos pagamentos/recebimentos registrados e vinculados ao registro |
| 4. Em aberto | **Saldo a pagar** = realizado − pago | **Saldo a receber** = confirmado − recebido | Calculado |

- Uma despesa realizada continua em aberto até alguém registrar o pagamento. Ela já conta como **execução do orçamento** no dia em que é realizada, mesmo sem pagamento.
- Uma receita confirmada **não** é caixa. Ela só vira "recebida" quando há um recebimento registrado.
- Previsto menos realizado é **folga do orçamento**, não saldo a pagar.

## O que muda nos cadastros de 2028
- **Despesas:**
  - situação: prevista, realizada, cancelada;
  - campos: valor previsto, valor realizado, data de realização, vencimento, comissão e linha de orçamento;
  - o pago e o saldo aparecem sempre como valores calculados, sem campo para digitar.
- **Receitas:**
  - situação: projetada, confirmada, cancelada (como hoje);
  - campos: projetado, confirmado e vencimento, já existentes;
  - recebido e saldo a receber passam a aparecer calculados.
- **Patrocínios:**
  - mesma regra: o confirmado (livre/Rouanet) é compromisso;
  - o recebido vem dos recebimentos vinculados ao patrocínio.
- **Execução orçamentária:**
  - por comissão e por linha, mostra quatro valores: previsto, realizado, pago e saldo a pagar;
  - a utilização do teto passa a usar o **realizado**, não o pago.
- Cancelar uma despesa já paga, no todo ou em parte, não apaga o pagamento. O sistema mostra a inconsistência e pede um estorno ou devolução registrado.

## Painel e relatórios
- **Despesas:** previsto, realizado, pago, saldo a pagar e vencido.
- **Receitas:** projetado, confirmado, recebido, saldo a receber e vencido.
- Cada número indica a regra que usa ("compromisso" ou "caixa"), e os dois nunca são somados.
- Os relatórios e exportações usam a mesma consolidação do servidor.

## Verificação (banco local sintético e testes)
- Despesa realizada sem pagamento: entra no realizado, com saldo a pagar igual ao valor e pago zero.
- Pagamento parcial: o saldo diminui e o realizado não muda.
- Receita confirmada sem recebimento: recebido zero, sem aparecer como caixa.
- Estorno: o pago ou recebido volta ao valor anterior.
- Pagamento acima do realizado é recusado.
- Despesa cancelada depois de paga aparece como inconsistente.
- A utilização do orçamento acompanha o realizado, mesmo sem nenhum pagamento.
- Tudo em centavos, com totais sem depender de limite de listagem.

Continua valendo: nada é aplicado no backend nem publicado sem a sua autorização.

## Detalhes técnicos
- `expenses` (tabela existente) ganha colunas opcionais:
  - `edition_id`, `commission_id`, `budget_line_id`, `planned_cents`, `committed_cents`, `committed_on`, `due_date`, `financial_status` ('prevista','realizada','cancelada');
  - `expenses.amount` e os status logísticos atuais continuam iguais;
  - em 2028, `committed_cents` é o valor realizado, e despesas logísticas antigas sem edição não entram no Financeiro.
  - A gravação financeira passa por `financial_save(entity 'expense')`. Ressarcimento quita a mesma obrigação, sem criar outra despesa.
- A obrigação passa a ser a **ponte única entre execução e caixa**:
  - realizar uma despesa ou confirmar uma receita/patrocínio cria ou ajusta, na mesma transação, a obrigação vinculada (`source_type`/`source_id`, valor = realizado/confirmado);
  - reduzir o realizado abaixo do já pago é recusado (`FINANCIAL_OBLIGATION_BELOW_SETTLED`);
  - cancelar com valor já liquidado marca a pendência `settlement_inconsistent`, sem baixa automática.
- `financial_edition_summary` passa a devolver os blocos `expenses` {planned, committed, paid, payable_open, overdue} e `revenues` {projected, confirmed, received, receivable_open, overdue}, calculados de cadastro + alocações, e não só de movimentos. Os blocos `budget` ganham `committed_cents` por comissão e por linha via `financial_budget_execution(edition)`.
- Front:
  - `financialOperationalMath` ganha `executionStages()` com testes;
  - os formulários marcam pago, recebido e saldos como "calculado" (só leitura);
  - o painel e o orçamento mostram as quatro colunas.
- O rascunho `docs/financeiro-2028/financial_operational_2028.sql` e `local-test.sql` são atualizados. A regra fica registrada em `src/features/financial-management/AGENTS.md`.
