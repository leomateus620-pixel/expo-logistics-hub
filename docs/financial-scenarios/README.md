# Simulações financeiras FENASOJA 2028

A rota `/comissoes/financeiro-gerencial/simulacoes?edicao=2028` compara a referência oficial imutável com a operação persistida. O cenário selecionado tem categorias em grade de três colunas no desktop, duas em larguras intermediárias e uma no celular. O resumo da base fica abaixo do cenário; participação usa mosaico e a comparação complementar examina uma categoria por vez. A leitura histórica de 2026 permanece independente.

## Diagnóstico e contratos

Base: `main` em `bde7108ace4c8ed0e774519f7720ea8b91a12fc7`. `Financial2028Workspace` direcionava Simulações a `PendingView`; `ScenarioIntelligenceView` usava dados históricos de 2026. A implementação nova é exclusiva da ramificação 2028. `financial_scenarios` e as RPCs financeiras existentes foram preservados; a nova estrutura explicita `schema_version=2`, `money_unit=BRL_CENTS` e `automotive`. A sobrecarga antiga de seis argumentos de `financial_save_scenario` continua compatível, sem reinterpretar reais como centavos.

A RPC `financial_scenario_overview(org,edition,basis)` lê uma fotografia transacional e retorna metas, composição agregada por categoria/estágio, cobertura, geração e observações históricas. Não retorna compradores, documentos ou contratos. A edição e o projeto comercial são vinculados explicitamente no servidor. Os pavilhões físicos são resolvidos por pais persistidos e registro canônico; `B3` é Pavilhão 12 e `B10` é Pavilhão 7. Lotes ambíguos ficam na cobertura.

## Regras monetárias

- Carteira inclui itens ativos assinados e pendentes, com principal negociado comprovado. Estoque, tabela de preços e anexação de contrato não comprovam receita/assinatura.
- Taxas pertencem uma vez ao pedido. Rateio proporcional inteiro, piso e resíduos por UUID estável. Confirmado retém as mesmas parcelas dos itens elegíveis; o restante fica em andamento. Margem ausente ou inconsistente conserva taxas conhecidas na conciliação.
- Confirmado substitui projetado na mesma origem. Patrocínios separam livre/Rouanet; declarado e contrapartida em bens não são dinheiro adicional. Fontes manuais exigem vínculo explícito, com identidade de origem para deduplicação. Outras receitas sem meta entram separadamente no consolidado.
- Despesa comprometida substitui previsão do mesmo fato. Parcelas distribuem fatos. Caixa lê movimentos líquidos alocados, sem inferir pagamento a partir da confirmação ou de `lot_sale_installments.PAID`. A conciliação comercial pendente fica nos detalhes de cobertura. Não há saldo inicial inventado.
- Saldo = receita − despesa. Reserva formada = mínimo entre saldo positivo e alvo. Capacidade = máximo entre zero e saldo − alvo da reserva. Alocação é analítica e não cria movimento. Rouanet mantém sua vinculação.
- As metas do anexo são fixas. Investimento otimista informado **R$ 3.139.229,64**; referência calculada **R$ 3.159.229,64**. Diferença **R$ 20.000,00**, sem despesa fictícia. Estacionamento otimista permanece **R$ 720.000,00**, apesar do rótulo original de 120%. Valores pessimistas e textos originais da reserva são preservados na proveniência.

## Atualização e projeção

Um hook TanStack Query compartilhado, chave por organização/edição/base/versão, `staleTime` e `refetchInterval=600_000`, polling suspenso em aba oculta e retomada quando vencido. Mutações financeiras invalidam a raiz existente; atualização comercial invalida o agregado financeiro. Eventos financeiros têm debounce de 750 ms. Falha mantém a última fotografia; troca de base não reaproveita valores da base anterior.

O job privado `financial-scenarios-2028`, `*/10 * * * *`, coleta as três bases independentemente de navegadores abertos. Uma observação por base/bucket, retenção de 90 dias; leitura não grava versões, eventos econômicos ou auditoria de cadastro. ETA usa dias civis em `America/Sao_Paulo`, janela 30 dias e comparações 7/60, sete dias consecutivos com cobertura válida e ritmo líquido positivo. Cancelamentos podem reabrir metas. Sem histórico, ritmo ou fonte futura suficiente não há data de conclusão inventada. Reserva/capacidade usam ritmo líquido do saldo; orçamento tem previsão de cobertura própria.

## Migrações aplicadas pelo Lovable

Projeto confirmado: **Fenasoja Log**, `756eeb64-0d44-4171-b445-f8a60f0492c0`; configuração Supabase `btfaumhroqtqzxomqorx`, correspondente ao repositório. `get_database_status` confirmou banco habilitado antes da inspeção.

| Migração | SHA-256 |
|---|---|
| `20261022090000_financial_live_scenarios.sql` | `e3ae06784b0815d8d2d4eef3d60fdcdcd16e939df2c03c9ea6a568eba2c72a29` |
| `20261022093000_financial_scenario_projection_hardening.sql` | `cbc311a55a61f6b866553f7d934686f18aed621def6ead276374b64ee2d1a4b1` |
| `20261022100000_financial_scenario_cash_contract.sql` | `c5f120fa09c8ccd793f5c3d5dfd143b02152af557f730c082dac60ffc1b62ffe` |

O conector expõe `query_database`, sem ferramenta dedicada de migrations. Foi utilizado o mecanismo rastreável do projeto: SQL exato em transação, advisory lock, precondições de escopo, entrada em `supabase_migrations.schema_migrations`, hash no registro e releitura após COMMIT. `migration-envelope.mjs` reproduz o envelope. Replay de versão exige fonte idêntica; não reexecuta a migração.

A segunda migração conserva margens nulas em cobertura e elimina varreduras correlacionadas da classificação. Mesmos 1.652 lotes e checksum de classificação antes/depois; consulta completa das três bases passou de aproximadamente 34 s para **115 ms** por base no ensaio conectado. É uma medição pontual, não um SLA. Inventário de contagens, somas e checksums de **26 tabelas de fatos existentes** permaneceu igual após as aplicações. Nenhuma venda foi criada, reprecificada ou confirmada; nenhum recebimento/despesa foi inserido para popular a interface. O coletor histórico teve execução `succeeded` nas três bases.

A terceira migração garante centavos textuais na composição de patrocínios sem caixa alocado. Observações históricas anteriores com composição inválida são preservadas no armazenamento, marcadas sem cobertura na leitura e excluídas da projeção, sem inventar valores. Recebimento sem rateio comprovável fica em outras receitas com cobertura pendente. As três bases foram revalidadas no contrato SQL e no parser do frontend.

RLS, quatro contas do roster e `financial_can` preservados (definição conferida por checksum). Cliente não recebe execução das funções internas nem poder comercial. Leitor não edita metas. Referências v2 são imutáveis; edição administrativa exige versão esperada e chave idempotente, gera nova versão auditada e rejeita concorrência desatualizada.

Evidência sanitizada: [lovable-application.json](evidence/lovable-application.json). As releituras conectadas usaram `SET LOCAL ROLE authenticated` e claim da conta leitora autorizada pelo conector. Isso valida capacidades e contratos no banco; **não constitui login interativo na aplicação de produção**. O frontend ainda depende de revisão/merge e publicação pelo fluxo normal do projeto.

## Validação reproduzível

Usar `npm install`, conforme AGENTS.md; depois `npm run typecheck`, `npm run build`, `npm test`. O harness visual usa os componentes reais com PostgreSQL descartável e fatos fictícios, sem Supabase remoto.

```sh
# Reutiliza o bootstrap isolado financeiro já existente.
node scripts/financial-2028/start-isolated-postgres.mjs
sh scripts/financial-scenarios/run-isolated.sh
node scripts/financial-2028/review-server.mjs
node node_modules/vite/bin/vite.js --config scripts/financial-scenarios/review.vite.config.ts
```

Dependências do banco isolado seguem o utilitário existente: `embedded-postgres` e `postgres` em `/tmp/financial-postgres/node_modules` ou o caminho configurável do bootstrap. Abra `http://127.0.0.1:8087/scripts/financial-scenarios/review.html?view=simulacoes`. O banner identifica dados fictícios. Após recriar o banco, reinicie a ponte e recarregue a página para renovar a edição descartável.

Testes financeiros cobrem centavos/rateio, assinatura parcial, revisão/cancelamento, legado, 501 patrocinadores, manual vinculado, movimentos/estornos, estágios de despesas, acesso, idempotência, concorrência, rollback e paridade da classificação. Frontend cobre reconciliação, bigint seguro, excesso/meta zero, orçamento, previsão, informação por teclado, seleção/categoria, mosaico e refresh com relógio controlado. Resultado completo e falhas preexistentes: [test-results.json](evidence/test-results.json).

Rollback após uso deve ser compensatório: desativar a navegação/coleta ou publicar nova versão/correção. Não remover referências, vínculos, fatos, histórico ou auditoria.
