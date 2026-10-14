# Design QA — Despesas e Receitas 2028

**final result: passed** — 13/10/2026, revisão local autenticada da PR #199.

O alvo é o plano aprovado, com a orientação posterior de identidade financeira sóbria mais marcante e explicações em ícones. O código anterior da PR (`392744d8`) é a referência de comparação, não um desenho a copiar. As diferenças de composição são intencionais. Creative Production orientou composição, tipografia e gráficos; Product Design orientou a revisão visual e os fluxos. O quadro interativo de Creative Production não estava exposto nesta sessão.

## Evidência comparada

Fonte congelada em 5194 e implementação em 5184, mesma edição 2028, perfil administrador, tema claro, banco local, registros e valores. Capturas em pixels CSS 1:1, densidade 1, desktop 1440 × 900 e mobile 390 × 844. Os recortes vieram de capturas completas do navegador; nenhum conteúdo foi redimensionado para caber.

- [Despesas — desktop](docs/validation/financial-ui-upgrade/comparison/expenses-desktop.jpg) e [mobile](docs/validation/financial-ui-upgrade/comparison/expenses-mobile.jpg).
- [Receitas — desktop](docs/validation/financial-ui-upgrade/comparison/revenue-desktop.jpg) e [mobile](docs/validation/financial-ui-upgrade/comparison/revenue-mobile.jpg).
- [Detalhes de Receitas](docs/validation/financial-ui-upgrade/comparison/revenue-detail-desktop.jpg), [Despesas](docs/validation/financial-ui-upgrade/comparison/expenses-detail-desktop.jpg) e [dois menus no mobile](docs/validation/financial-ui-upgrade/comparison/final-mobile-menus.jpg).

As montagens antes/depois foram abertas juntas para comparar hierarquia, proporções e leitura. Os recortes de detalhe permitem conferir valores, barras, filtros, tabela e estados sem depender das imagens amplas reduzidas.

## Iterações e correções

| Achado | Correção | Conferência final |
| --- | --- | --- |
| P2: hierarquia pouco marcante, materiais semelhantes em todos os cards | Cabeçalho navy; totais índigo/verde-petróleo profundos; secundários claros agrupados; barras e valores maiores | Montagens finais e [crítica inicial](docs/validation/financial-ui-upgrade/direction-review/visual-review.md) |
| P2: explicações ocupavam espaço em indicadores e fontes indisponíveis | Ajuda por ícone, com toque, Enter e Escape; cobertura e semântica preservadas | Capturas finais e teste de ajuda sem nova consulta |
| P2: título da seção manual e descrição herdavam 14,72/11,68 px | Escopo específico de 2028: seção 18 px, auxiliares ≥12 px | [Medições finais](docs/validation/financial-ui-upgrade/responsive-final.json) |
| P2: cabeçalho dedicado perdia padding na ordem dos estilos | Seletor específico do cabeçalho desses dois menus | Nova captura: 20/24 px desktop, 16 px mobile |
| P2: zero do ranking tinha alvo de 40 px | Largura mínima de 44 px | Nenhum controle visível abaixo de 44 px nas cinco larguras |
| P2: recarga imediata podia perder a divisão de Receitas | Flush local em pagehide/desmontagem, mantendo a chave exclusiva | Recarga 65/35, testes de persistência; chave de Despesas intacta |
| P2: fechar Categorias no Safari podia perder o ponto de foco | Foco explícito no controle e retorno ao abrir/fechar diálogos | CUA voltou ao botão Categorias; teste de botão e Escape |

Após as correções, novas capturas foram comparadas. Não restou achado P0/P1/P2 de apresentação ou operação dentro do ambiente validado.

## Superfícies obrigatórias

- **Tipografia:** Inter existente, títulos 32/26 px e seções 18 px; valores principais 36/28 px, secundários 20 px; pesos distintos, números tabulares e alinhamento monetário. Nomes longos quebram linha; valores compactos oferecem o valor exato. Nenhum texto auxiliar do conteúdo operacional fica abaixo de 12 px.
- **Layout:** ritmo de 8/16/24 px, raios de 12 px; contraste entre totais, apoio, gráficos e lista. A sidebar reduz a largura disponível em notebook, acionando abas. No mobile o primeiro indicador fica totalmente visível até 561 px em Despesas e 507 px em Receitas.
- **Cores:** navy `#0b2039`, projeção `#253568` e execução/recebimento `#155852`; barras índigo e petróleo; âmbar/vermelho para atenção. Valores e labels dos cards escuros mantêm contraste alto; identificação das séries também usa títulos, não depende só de cor.
- **Ativos:** logotipo existente e ícones Lucide do projeto preservados; nenhum bitmap decorativo novo nem desenho financeiro fictício. Gráficos usam os registros e escala do servidor/adapters existentes.
- **Conteúdo:** compromisso e liquidação continuam distintos. Resumo da edição e recorte manual até 500 registros estão identificados; busca local não modifica consolidação nem ranking/Rouanet do recorte ativo. Limitações de fonte ficam disponíveis nos ícones.

## Responsividade, acessibilidade e operação

360, 390, 430, 1024 e 1440 px: largura do documento igual à do viewport, controles visíveis ≥44 px, sem microtexto abaixo de 12 px. [Registro de medição](docs/validation/financial-ui-upgrade/responsive-final.json).

Zoom nativo de 200% foi conferido no Chrome porque o in-app browser não aplicou o atalho de zoom. A janela resultou em viewport CSS de 600 × 322, DPR 4 em tela Retina (DPR 2 a 100%), sem overflow horizontal. O formulário de Despesas preservou ações e corpo rolável. Zoom restaurado a 100%. [Evidência](docs/validation/financial-ui-upgrade/zoom-200.json).

Teclado em abas, ajudas, divisor, formulários; filtros/chips, expansão de registros, edição de receita e restauração da contraparte por duas gravações reais locais; categorias; perfis leitor, editor, confirmador e negado conferidos. Divisores chegaram a 65/35 e persistiram após recarga, retornaram a 50/50 e foram arrastados sem novas RPCs. [Despesas](docs/validation/financial-ui-upgrade/expense-resize.json), [Receitas](docs/validation/financial-ui-upgrade/revenue-resize.json), [perfis](docs/validation/financial-ui-upgrade/profiles.json).

Histórico 2026 continuou fora do shell operacional, somente leitura, com 254 linhas e a mesma base histórica. Fontes/componentes históricos não foram alterados. [Captura](docs/validation/financial-ui-upgrade/after/history-2026.jpg).

## Limites

Esta aprovação visual usa a sessão local com JWTs assinados, PostgreSQL/RPCs/RLS reais e um endpoint de identidade do harness. Login remoto do Supabase e versão/comportamento do gateway remoto não foram validados. O conflito em PostgREST 16.4 passou; a limitação anterior de PostgREST 13 continua documentada. Nenhuma escrita em produção foi necessária nesta etapa.

Verificações e reprodução: [README da validação](docs/validation/financial-ui-upgrade/README.md).
