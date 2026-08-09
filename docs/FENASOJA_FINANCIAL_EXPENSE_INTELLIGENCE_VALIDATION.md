# Fenasoja Financeiro — Expense Intelligence

## Escopo entregue

O upgrade foi aplicado somente às três visões solicitadas do Financeiro Gerencial:

- `/comissoes/financeiro-gerencial/despesas-previstas`
- `/comissoes/financeiro-gerencial/despesas-realizadas`
- `/comissoes/financeiro-gerencial/orcamento-comissoes`

As rotas, a cadeia de proteção, `financial_access`, Supabase, backend e semântica da planilha permanecem inalterados.

## 1. Estratégia de design

A primeira camada passou a ser composta por cabeçalho executivo compacto, cinco KPIs decisórios, um único recorte analítico compartilhado, indicador explícito de cobertura e visualizações integrais antes do ledger. A hierarquia usa cartões de baixa ornamentação, superfícies claras, acentos Fenasoja controlados, números tabulares e governança rebaixada para disclosures.

## 2. Influência das três referências

As referências descritas no briefing foram usadas como direção, sem reprodução literal:

- Referência 1: KPIs limpos, ritmo de espaçamento e leitura imediata.
- Referência 2: equilíbrio operacional entre filtros, gráficos e detalhamento.
- Referência 3: tipografia mais refinada, composição premium e maturidade executiva.

As imagens anexadas ao objetivo também foram tratadas como baseline do estado anterior para comparação de densidade, hierarquia e dependência de tabelas.

## 3. Poda de informação

- As descrições longas e a legenda genérica saíram do hero das três telas.
- A origem foi reduzida para `Planilha oficial · somente leitura` na primeira camada.
- Helpers óbvios e notas repetidas foram removidos ou consolidados.
- Reconciliação, anomalias e metodologia foram preservadas em disclosures discretos.
- A separação contábil do orçamento geral fora das comissões permaneceu explícita.
- A advertência sobre origens realizadas independentes e não exaustivas ficou junto da visualização relevante.

## 4. Sistema de gráficos

### Despesas Previstas

- donut integral por categoria;
- comparação 2025 × 2026;
- treemap categoria → despesa;
- barras completas por comissão;
- barras completas por categoria;
- ledger integral sincronizado com os mesmos filtros.

### Despesas Realizadas

- donut das origens declaradas, usando somente o subtotal preenchido como denominador;
- barras completas por categoria;
- treemap integral, incluindo a contabilização das linhas sem área monetária;
- barras completas por comissão;
- stacked bars das origens independentes e não exaustivas;
- ledger integral sincronizado.

### Orçamento por Comissão

- donut com os cinco estados orçamentários;
- comparação absoluta Teto × Orçado para 25 comissões;
- bullet chart relativo de pressão para 25 comissões;
- ledger completo com ordenação, filtro de estouro e detalhamento.

Tooltips, legendas, estados de foco, navegação por teclado, tabelas acessíveis e valores monetários completos acompanham os gráficos. Os IDs ARIA usam índices estáveis e seguros.

## 5. Tipografia

- Inter/UI para leitura executiva e JetBrains Mono somente no contexto técnico de origem.
- `font-variant-numeric: tabular-nums` em valores financeiros e percentuais.
- Títulos, labels, KPIs, headers de gráficos e tabelas receberam escalas e pesos próprios.
- Headers de tabela ficaram mais legíveis sem perder densidade.

## 6. KPIs

- Cinco KPIs por tela, com prioridade visual, fonte do dado e valor acessível completo.
- Cinco colunas em desktop; no mobile, KPI principal em largura total e os quatro secundários em grade 2 × 2.
- Status aparecem com texto e cor, nunca somente por cor.
- Motion de entrada usa transform/opacity e progressão via `requestAnimationFrame` nas visualizações financeiras.

## 7. Tabelas e listas

- Coluna decisória recebeu prioridade visual; colunas de apoio ficaram mais silenciosas.
- Valores usam alinhamento à direita e numerais tabulares.
- Headers permanecem sticky em regiões roláveis com nome acessível.
- Estados de linha são expostos por `data-*`, texto e cor.
- Controles, detalhes e ações têm alvo mínimo de 44 px.
- Cards mobile preservam todas as linhas e dados por disclosure, sem substituir o ledger por uma amostra.

## 8. Cobertura integral da base

### Previstas

- 254 linhas preservadas;
- 216 linhas com área monetária;
- 38 linhas de valor zero preservadas no ledger e na tabela acessível do treemap;
- 13 categorias;
- R$ 8.519.650,14 visualizados nos períodos.

A diferença de R$ 2.600,00 entre a soma dos períodos e `Orçado` permanece explicitamente reconciliada, sem correção inventada.

### Realizadas

- 254 linhas preservadas no recorte, treemap acessível e ledger;
- 216 linhas com atividade registrada;
- 215 blocos monetários;
- 39 linhas sem área por valor realizado zero;
- linha 107 preservada com R$ 1.000,00 em Rouanet e realizado zero.

Somente 53 linhas, em 7 comissões, possuem alguma origem declarada. O subtotal de R$ 1.226.505,86 representa 14,40% do realizado e é apresentado como composição entre origens registradas, nunca como composição exaustiva do total.

### Orçamento

- 25 de 25 comissões nas lentes absoluta, relativa e detalhada;
- estados: 6 dentro do esperado, 10 em atenção, 5 próximas do teto, 3 acima e 1 sem teto definido.

## 9. Responsividade

- Grids analíticos 5/7 e 6/6 convertem-se em uma coluna sem truncar dados.
- KPIs, cobertura, filtros e disclosures têm regras específicas para 1180, 980, 760, 620, 430, 390 e abaixo de 340 px.
- Gráficos extensos usam regiões internas roláveis; a página não cria overflow horizontal.
- Todos os dados continuam disponíveis em cards/ledgers móveis.

## 10. Validação visual e técnica

Foi usado um harness temporário, removido antes do commit, que montou as páginas e componentes reais com a fixture oficial, sem alterar rotas ou guardas.

Validação visual do diff:

- 1440 × 900: três telas, grid executivo, charts, paleta, cobertura e ledgers;
- 430 × 900: sem overflow horizontal, controles de 44 px e 254 cards preservados;
- 390 × 844: três telas, KPI principal + grade 2 × 2, cobertura em duas colunas e detalhe integral;
- filtro compartilhado exercitado com `Marketing`: 73 de 254 linhas, R$ 1.150.769,00, com cobertura, gráficos e ledger convergentes;
- reduced-motion emulado: a progressão do bullet chart continuou de `scaleX(0.39)` até `scaleX(1)` via `requestAnimationFrame`;
- nenhum erro de console nas três páginas do harness.

Limite de evidência: o smoke autenticado nas rotas locais não foi executado porque a aplicação redireciona para login e a sessão disponível pertence à produção. O harness valida o layout e as interações do diff com dados reais, mas não substitui um smoke autenticado da cadeia de guardas. Também não foi coletado trace de FPS; a implementação foi estruturada para motion estável com transform/opacity, `requestAnimationFrame` e `will-change` pontual.

Validação automatizada:

- TypeScript integrado;
- ESLint focado nos arquivos alterados;
- 40/40 testes financeiros focados, incluindo runtime RTL de charts e ledgers;
- build de produção;
- suíte global: 550/581; as 31 falhas permanecem nos seis arquivos não financeiros já conhecidos de Cronograma, Login e Venue Events, sem falha financeira.

## 11. Confirmações de não alteração

- Rotas: não alteradas.
- Supabase: não modificado.
- Backend: não modificado.
- Auth e permissões financeiras: não alterados.
- Migrações: nenhuma criada.
- Semântica e labels reais da planilha: preservados.
- Dados financeiros: não substituídos por mocks ou abstrações inventadas.
