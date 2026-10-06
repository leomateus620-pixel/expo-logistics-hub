# Financeiro Operacional Fenasoja 2028

## Como as partes se relacionam

```text
                    Organização
                         |
          +--------------+---------------+
          |                              |
   Edição 2026 (histórico)        Edição 2028 (operacional)
   somente leitura                       |
                 +--------------+--------+--------+---------------+
                 |              |                 |               |
            Comissões ---> Orçamento         Receitas        Patrocínios
            (já existem)   + linhas por      (manuais)       (carteira)
                 |         categoria             |               |
                 |              |                +----> receita derivada
                 v              v                |
             Despesas <--- previsão x execução   |
          (despesas atuais,                      |
           com edição)                           |
                 |                               |
                 +--------> Obrigações <---------+  <--- Vendas de lotes
                           (a pagar / a receber)       (pedidos e parcelas existentes,
                                  |                     mesma regra da Dashboard Comercial)
                                  v
                Movimentos (recebimentos, pagamentos, ajustes, estornos)
                                  |
            Painel · Simulações (cenários versionados) · Relatórios
```

As nove áreas mostram a mesma base filtrada de formas diferentes. Nenhuma tem cadastro próprio de totais.

## Fontes de dados de hoje e o que acontece com cada uma

| Fonte atual | Situação | No Financeiro 2028 |
|---|---|---|
| Planilha 2026 (`financial2026Data.ts`, embutida no app) | Analítica, vai junto no código que todo visitante baixa | Vira o histórico 2026, guardado no servidor como somente leitura e lido só por quem tem `financial_access`. Nada dela é copiado para 2028 |
| Despesas operacionais (`expenses`, categorias, documentos, aprovações, ressarcimentos) | Persistidas, separadas por `org_id`/`cycle_year` | Mesma tabela, com campos financeiros novos (comissão, fornecedor, competência, vencimento, origem do recurso, previsão x realização) |
| Vendas de lotes (pedidos, itens, parcelas, revisões) | Persistidas | Lidas como uma fonte de receita comercial, pelas regras da Dashboard Comercial já extraídas para código compartilhado. Sem cópia |
| Comissões (38) e acesso `financial_access` | Existem | Reaproveitados |

## Campos: o que é reaproveitado e o que é novo

| Cadastro | Reaproveitado de 2026 | Novo em 2028 |
|---|---|---|
| Edição | — | código (2026/2028), período, situação (histórico/operacional) |
| Orçamento por comissão | comissão, responsável, teto, planejado, observação (CommissionBudgetSource) | período da edição, versão, histórico de teto (anterior, novo, quem, quando, motivo) |
| Linha de orçamento | categoria de despesa, descrição, valor (GeneralBudgetItem, tipo obrigação/investimento) | período, valor previsto revisável. Obrigação anterior só entra se for cadastrada |
| Receita | categoria (as 10), origem do recurso (as 5), projetado, observação | contraparte, responsável, competência, vencimento, situação (projetada, confirmada, cancelada) |
| Patrocínio | nome, categoria (as 7), valor declarado, livre/Rouanet projetado e confirmado, credenciais, contrapartida | negociação, datas, responsável, separação entre dinheiro e contrapartida em bens ou serviços |
| Despesa | campos atuais de `expenses` | comissão, linha de orçamento, fornecedor, competência, vencimento, previsto, situação (prevista, aprovada, realizada, cancelada) |
| Obrigação | — | a pagar ou a receber, valor, vencimento, origem (despesa, receita, patrocínio ou parcela comercial) |
| Movimento | — | tipo (recebimento, pagamento, adiantamento, estorno, devolução, ajuste), data, valor, meio, referência, comprovante, obrigação alocada |
| Cenário | as premissas de `FinancialScenario` | versão, autor, data, valores-base usados |
| Campos complementares | — | nome, tipo (texto, data, número, moeda, seleção), obrigatório, opções, ordem, ativo |

## O que os termos significam (vale para modelo e telas)

- **Projetada:** é uma expectativa.
- **Confirmada:** existe um compromisso comercial ou contratual.
- **Realizada:** existe um movimento de recebimento ou pagamento registrado e alocado.
- **Saldo a receber/pagar:** é o valor da obrigação menos os movimentos alocados.

Todos os totais são calculados pelo servidor, a partir dos registros. Nenhum total é digitado.

## Entregas, em ordem de dependência

1. **Fundação.** Cadastro de edições e o seletor "Fenasoja 2026 · Histórico" / "Fenasoja 2028" no Financeiro. As rotas ficam em `/comissoes/financeiro-gerencial/2026/...` e `/2028/...`, com filtros e formulários separados por edição. Os dados de 2026 saem do código e passam a ser lidos do servidor.
2. **Orçamento por comissão**, com linhas e histórico de mudanças.
3. **Despesas.** Extensão das despesas atuais. O ressarcimento quita a obrigação, sem criar uma segunda despesa.
4. **Receitas e patrocínios.** A carteira de patrocínios gera a receita derivada.
5. **Comercialização.** A regra da Dashboard Comercial é extraída para uso compartilhado, com uma consulta só de leitura para quem tem acesso ao Financeiro. Isso não dá poder de editar vendas, e o usuário pode abrir o pedido se tiver permissão.
6. **Obrigações e movimentos.** Quitação parcial, ajustes e estornos vinculados. Antes de qualquer recebimento parcial em parcela comercial, `revise_sale_order_items` passa a proteger o valor já recebido, não só parcelas PAID.
7. **Categorias e campos complementares** guardados como metadados validados.
8. **Cenários versionados, painel e relatórios.** Cada total abre a lista de registros de origem, e a exportação usa a mesma consulta.

## Segurança e consistência (todas as entregas)

- Isolamento por organização e edição, RLS e autorização no servidor.
- Capacidades separadas:
  - `financial_access`: consultar;
  - `financial_edit`: cadastrar;
  - `financial_confirm`: confirmar;
  - `financial_settle`: registrar movimentos e estornos;
  - `financial_admin`: categorias e campos.

  Nenhum acesso é concedido sem pedido seu.
- Gravações sensíveis por funções transacionais, com chave de idempotência, controle de versão e auditoria.
- Comprovantes em armazenamento privado, com links temporários.
- Totais calculados por agregação no servidor, sem depender de paginação e sem somar duas vezes por causa de anexos.

## Verificação

- **Banco local isolado, com dados fictícios:**
  - isolamento entre edições e organizações;
  - permissões;
  - duplicidade e idempotência;
  - centavos;
  - quitação parcial;
  - concorrência;
  - cancelamento comercial sem baixa automática;
  - auditoria;
  - totais com mais de 1.000 registros.
- **Testes:** testes unitários dos cálculos e testes de interface das nove áreas, com os estados carregando, vazio, erro, acesso restrito e inconsistente.
- **Regressão:** os testes atuais de 2026 e da Dashboard Comercial precisam continuar passando, e os números de 2026 não podem mudar.

## Limites importantes

- **Produção:** o preview e o site publicado usam o mesmo backend. Aplicar as atualizações do banco já é mexer em produção. Por isso, eu escrevo as atualizações e testo tudo no banco local isolado. Só aplico no backend depois que você autorizar expressamente, entrega por entrega. A saída de 2026 do código só entra no ar junto com essa aplicação.
- **Fora do escopo:**
  - importar lançamentos reais;
  - conceder acessos;
  - integração bancária;
  - publicar;
  - executar movimentações.
- **Tamanho:** é um trabalho grande. Cada entrega fica revisável e funcional sozinha, sem reduzir o escopo final.

## Detalhes técnicos

- Tabelas novas em `public`, todas com `org_id`, `edition_id`, `created_by`/`updated_by`, timestamps, `version` e GRANT+RLS:
  - `financial_editions`, `financial_budgets`, `financial_budget_lines`, `financial_budget_revisions`;
  - `financial_revenues`, `financial_sponsorships`, `financial_sponsorship_revisions`;
  - `financial_obligations`, `financial_movements`, `financial_movement_allocations`;
  - `financial_categories`, `financial_custom_fields`, `financial_custom_values`;
  - `financial_scenarios`, `financial_scenario_versions`, `financial_historical_snapshots` (2026, somente leitura).
- `expenses` ganha colunas opcionais e `edition_id`. `cycle_year` continua existindo. Os fluxos logísticos atuais não mudam.
- RPCs `financial_*` com `SECURITY DEFINER`, validação de payload e recibos de idempotência, no mesmo padrão de `venue_mutation_receipts`. Agregação por `financial_edition_summary(edition, filtros)` e `financial_source_records(...)` para rastrear origem.
- O front reaproveita `FinancialPrimitives`, `FinancialCharts`, `FinancialTables`, os seletores, `financialFormatters` e `salesMoney` (centavos). Os hooks seguem o padrão de `useExpenses` com react-query.
