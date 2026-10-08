# Plantas e análise comercial — validação local

Base de comparação: `4fb76b4ceab1cabded26be99b2097496bcc8820f`, após o merge da PR #189. Esta evolução é exclusivamente de apresentação na região selecionada da dashboard.

## O que mudou

- Pavilhões 8 e 13: contorno interno, apoios, acessos e envelope reconciliados por uma translação validada contra os metadados normalizados e os polígonos carregados. Os polígonos dos lotes não são reconstruídos nem deslocados. A revisão persistida das ilhas centrais e os módulos irregulares do 13 são mantidos.
- Referência ausente, incompatível ou inconsistente: a planta enquadra os lotes reais; contorno e acessos não comprovados deixam de ser desenhados, com pendência em informação acessível.
- Ficha HTML dentro da planta, ancorada ao lote por `getScreenCTM()`, com inversão de lado e contenção nas bordas. Hover/foco exibem prévia; clique, toque e seletor fixam. Escape e fechar preservam seleção/foco. Zoom, scroll e atualização reposicionam a ficha sem mudar sua tipografia.
- Seletor e ferramentas abaixo da planta. Seleção pelo seletor revela um lote fora do viewport sem reiniciar o zoom. Registros sem geometria continuam consultáveis com posição indisponível explícita.
- Indicadores sem subtítulos redundantes. Donut com hierarquia refinada, lista de três colunas acompanhando Quantidade/Área oficial e explicações concentradas nos controles de informação.

## Fontes dos indicadores

| Informação | Fonte existente |
| --- | --- |
| Inventário, situação, deduplicação, arquivados, reversões, contagem comercial e agregados de área | `buildCommercialDashboardSnapshot`, sem alterações |
| Identificação do espaço | `resolveLotIdentity`, com lote, entidade e pavilhão carregados |
| Área da ficha | `DashboardLotRecord.officialAreaSqm`, já validada pelo snapshot; nunca aproximada pelo polígono |
| Valor negociado | `DashboardLotRecord.value`, resolvido pelas vendas persistidas; sem fallback para tabela quando ausente/conflitante |
| Renovação / Segunda Etapa | `resolveDashboardLotValue(lot, stage)`, usando a precificação existente; zero monetário preservado |
| Empresa / expositor | `resolveLotTooltipPresentation` e identificação autorizada já carregada; conflitos e restrições não exibem o nome |
| Donut Quantidade | Vendidos / `commercialLots`; indisponíveis fora da base, bloqueados dentro |
| Donut Área oficial | Área vendida / área oficial conhecida; cobertura parcial explícita no controle de informação; ausência não vira zero |

Anexos não são usados para inferir assinatura, venda, pagamento ou comprador. RESERVED e IN_NEGOTIATION mantêm seu rótulo real na ficha, sem dados de venda inferidos.

## Evidências e limites

As capturas usam React e SVG reais em Chrome/Chromium local, com DPR 1 e emulação de toque no celular. Todos os pedidos Supabase são bloqueados pelo harness. Não houve sessão autenticada da aplicação disponível para validação; estas evidências não comprovam produção, WebGL, aparelhos físicos, Safari ou iOS.

A fixture reproduz independentemente o referencial persistido dos pavilhões 8 e 13, incluindo o alinhamento de extremidade após rotação e a revisão central do 13 (início em 6 m, diferente da referência estática). Os outros seis pavilhões usam a referência existente. Preços, estados dos três primeiros lotes e nome do expositor são valores locais de teste, claramente declarados no harness, sem gravação externa.

As capturas `area.png` cobrem ausência de metragem. As adicionais `area-known.png` preenchem somente três campos oficiais da fixture com 3, 6 e 9 m², sem derivá-los da geometria, para inspecionar o donut e a lista com cobertura parcial; os campos são restaurados em seguida.

| Tela | Dimensões |
| --- | --- |
| Desktop | 1920 × 1080 |
| Notebook | 1366 × 768 |
| Celular | 390 × 844 |

Os arquivos em [evidence](evidence) incluem antes/depois das plantas, análise por quantidade, análise por área e ficha selecionada para os oito pavilhões. Os JSONs por tela registram medidas, hashes, contenção, acessos, apoios, interação e ausência de chamadas ao backend. A sequência completa pode ser repetida com `pavilion-inspection-browser.cjs` e `pavilion-inspection-qa.tsx`, usando a configuração local `presentation.vite.config.ts`; a entrada não participa do roteador da aplicação.

### Medidas antes/depois

Mínimo efetivo da fonte dos números, em pixels, medido com a escala renderizada do SVG. Os limites são retangulares porque o contorno interno destes dois pavilhões é retangular; os módulos irregulares permanecem com seus próprios polígonos. Dados completos em [geometry-comparison.json](geometry-comparison.json).

| Tela | Pavilhão | Lotes fora do contorno antes → depois | Fonte mínima antes → depois | Largura ocupada pelos módulos antes → depois |
| --- | --- | --- | --- | --- |
| Desktop | 8 | 91 → 0 | 9,49 → 10,97 px | 238,45 → 345,11 px |
| Notebook | 8 | 91 → 0 | 7,78 → 10,97 px | 201,33 → 291,38 px |
| Celular | 8 | 91 → 0 | 8,33 → 9,91 px | 213,28 → 247,37 px |
| Desktop | 13 | 4 → 0 | 10,97 → 10,97 px | 321,23 → 331,77 px |
| Notebook | 13 | 4 → 0 | 10,97 → 10,97 px | 271,23 → 280,12 px |
| Celular | 13 | 4 → 0 | 10,79 → 10,94 px | 243,26 → 248,61 px |

Em fit inicial, todos os lotes, contornos, apoios e ícones de acesso cabem na superfície, sem scroll interno. Os seis pavilhões fora da correção preservam seus paths. No celular, os pavilhões densos continuam dispondo de zoom e seletor; não se alega leitura confortável de todos os números em escala inicial.

| Recorte | Desktop | Notebook | Celular |
| --- | --- | --- | --- |
| Pavilhão 8 | [antes](evidence/before-desktop-pavilion-8-plant.png) · [depois](evidence/after-desktop-pavilion-8-plant.png) | [antes](evidence/before-notebook-pavilion-8-plant.png) · [depois](evidence/after-notebook-pavilion-8-plant.png) | [antes](evidence/before-mobile-pavilion-8-plant.png) · [depois](evidence/after-mobile-pavilion-8-plant.png) |
| Pavilhão 13 | [antes](evidence/before-desktop-pavilion-13-plant.png) · [depois](evidence/after-desktop-pavilion-13-plant.png) | [antes](evidence/before-notebook-pavilion-13-plant.png) · [depois](evidence/after-notebook-pavilion-13-plant.png) | [antes](evidence/before-mobile-pavilion-13-plant.png) · [depois](evidence/after-mobile-pavilion-13-plant.png) |
| Ficha dentro da planta | [selecionada](evidence/after-desktop-pavilion-13-selected.png) | [selecionada](evidence/after-notebook-pavilion-13-selected.png) | [selecionada](evidence/after-mobile-pavilion-13-selected.png) |
| Donut com área conhecida parcial | [Área oficial](evidence/after-desktop-pavilion-8-area-known.png) | [Área oficial](evidence/after-notebook-pavilion-8-area-known.png) | [Área oficial](evidence/after-mobile-pavilion-8-area-known.png) |

## Verificações de dados e interação

- Tradução válida, tolerância a arredondamento, orientação/escala divergentes, chave duplicada/desconhecida, âncoras insuficientes, referência ausente, revisão incompatível e preservação dos módulos irregulares.
- Hashes antes/depois de polígonos, IDs, numeração e dados comerciais; agregados idênticos. Paths SVG dos seis pavilhões fora da correção também idênticos.
- Prévia por foco/hover, seleção por Enter, toque e seletor, fechamento por Escape/botão, foco retido, callback existente de “Ver no mapa”, quatro bordas, zoom, scroll, fit e atualização comercial sem perder seleção/zoom.
- Duas etapas de preço, zero monetário, área ausente, valor negociado ausente/conflitante, comprador indisponível/conflitante, estados reais sem venda inferida, reversões/deduplicação e invalidação de vendas existentes.
- Sem rolagem horizontal da página em 320, 390, 768, 1000, 1366 e 1920 px. Contenção da ficha e layout protegido medidos no navegador.

A matriz responsiva complementar em [responsive-matrix.json](responsive-matrix.json) cobre os oito pavilhões nas larguras 320, 390, 768, 1000, 1100, 1366 e 1920 px: 56 cenários e 168 estados após capturas e troca de métrica, sem sobreposição nem overflow. O fluxo em bloco se limita às plantas dos pavilhões até 1100 px; os mapas externos mantêm grid. Plantas e gráficos separados são a evidência móvel principal, pois uma captura de toda a análise pode superar a altura do viewport.

### Resultados dos checks

- **196 testes distintos passaram em 20 arquivos pertinentes**. [tests.json](tests.json) contém a suíte central; [analysis-tests.json](analysis-tests.json) registra a repetição focada após o ajuste de acessibilidade. [verification-summary.json](verification-summary.json) consolida os arquivos sem contar testes repetidos duas vezes.
- **Typecheck da aplicação e build frontend passaram**, com logs em [typecheck.log](typecheck.log) e [build.log](build.log).
- **ESLint: zero erros nos 51 arquivos verificados**, abrangendo todo o diretório da dashboard e testes/harness alterados. Os arquivos alterados não apresentam avisos. Permanecem dois avisos anteriores de `react-refresh/only-export-components`, em `CommercialSalesOrdersSection.tsx:11` e `SaleLotsEditAction.tsx:11`, ambos fora do diff. [lint.json](lint.json).
- **Browser: três telas × oito pavilhões**, com asserções de interação, hashes e layout protegido, sem pageerrors nem tentativas de Supabase. Os resultados estão nos três JSONs `after-*.json` de [evidence](evidence).
- **Auditoria de escopo e `git diff --check` passaram**. Nenhuma mudança foi aplicada ao backend nem publicada em produção.

## Auditoria do escopo

[scope-proof.json](scope-proof.json), gerado por `pavilion-inspection-scope-proof.cjs`, verifica a lista permitida de dez arquivos de produção e os hashes de 24 arquivos protegidos. Também compara integralmente o gráfico financeiro e os helpers compartilhados de geometria.

Nenhum arquivo de banco, migration, RPC, RLS, configuração/integração do Supabase, rota, tipos comerciais, consultas, preços, referência oficial, renderer 3D ou mecanismo de atualização foi alterado. Os cards superiores da PR #189, Área comercial, Vendas e contratos, Sojinha e seletores são protegidos por hashes. Seus limites de layout são comparados antes/depois. O mapa externo continua com a variante padrão do minimapa; o novo overlay é optativo para pavilhões.

O checkout principal foi preservado, incluindo sua alteração preexistente em `package-lock.json` e diretório `.worktrees/`. A implementação foi realizada em worktree separado.

## Comandos

```powershell
# Vinte arquivos pertinentes: dashboard, progresso, serviço e seção de vendas.
$taskTests = @(Get-ChildItem src/test -File -Filter 'commercialDashboard*.test.*' | ForEach-Object FullName)
$taskTests += (Resolve-Path src/test/commercialSalesProgress.test.ts).Path
$taskTests += (Resolve-Path src/test/commercialSalesOrdersService.test.ts).Path
$taskTests += (Resolve-Path src/test/commercialSalesOrdersSection.test.tsx).Path
node node_modules/vitest/vitest.mjs run @taskTests --maxWorkers=1 --minWorkers=1 --testTimeout=15000 --reporter=json --outputFile=docs/validation/dashboard-pavilion-inspection/tests.json
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.app.json
node node_modules/vite/bin/vite.js build --config scripts/dashboard/presentation.build.config.ts
node scripts/dashboard/pavilion-inspection-scope-proof.cjs
git diff --check
```

O build usa a configuração frontend da aplicação com o gerador MCP de função Supabase excluído, conforme o harness já existente, para não produzir alterações fora do escopo. O lint é limitado aos arquivos TypeScript/TSX alterados; o lint global do repositório não é certificado por esta entrega. Advertências de Browserslist desatualizado e tamanho de chunks são registradas no log do build, sem alterações de dependências.
