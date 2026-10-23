# Product Design QA — Ecossistema, Dashboard e Bot FENASOJA

Data: 23/10/2026. **final result: passed**

## Alvo, estado e comparação

O alvo é a identidade das capturas fornecidas pelo proprietário, com as correções de composição especificadas na conversa: cadeia vertical centralizada e conectada, sem cards especiais; nomes completos legíveis; famílias inferiores acessíveis; filtros discretos abaixo da marca; bot nos cabeçalhos; Vendas e contratos mais largo e sem crescer além de Área comercial no desktop. Não é uma clonagem das posições antigas.

Fonte controlada: main `9e8e35b4ef235131059f3a6fd3c1caa0a5951b5c`, materializada por `scripts/prepare-ecosystem-qa.mjs`. Implementação: branch `codex/ecosystem-hierarchy-fit`. Mesma fixture diagnóstica, com 41 pessoas e 33 unidades inferiores, sem sessão, dados de compradores ou chamadas de escrita. Contagens não são hardcoded no produto. Estado: visão geral ao terminar a apresentação, sem seleção, tema azul/dourado existente.

- Fonte visual: [before-1440x900.png](docs/validation/ecosystem-fit/before-1440x900.webp).
- Implementação renderizada: [after-1440x900.png](docs/validation/ecosystem-fit/after-1440x900.webp).
- Comparação conjunta inspecionada: [comparison-desktop.png](docs/validation/ecosystem-fit/comparison-desktop.webp), 2880×932 px, duas capturas de 1440×900 CSS/pixels e legenda externa de 32 px.
- Região superior: [comparison-upper.png](docs/validation/ecosystem-fit/comparison-upper.webp), dois recortes de 560×280 px, mesma escala 1:1.
- Tipografia/nomenclaturas: [comparison-names.png](docs/validation/ecosystem-fit/comparison-names.webp), dois recortes de 580×370 px, mesma escala 1:1. O recorte lateral limita o quadro, não o nome no produto; a tela completa permite conferir todas as células.
- Cards comerciais: [comparison-dashboard-region.png](docs/validation/ecosystem-fit/comparison-dashboard-region.webp), dois recortes de 2030×280 pixels físicos, mesmo viewport de 1440×900 CSS, zoom de 90% e escala de prévia idênticos. Os valores são fictícios e iguais.

As evidências foram exportadas em WebP de qualidade 92 para reduzir o peso da PR; os PNGs originais ficam no diretório local ignorado `artifacts/ecosystem-fit.local/evidence-png`. As capturas da matriz foram normalizadas para a dimensão CSS indicada; uma linha extra de rasterização foi removida quando presente. Os recortes do Chrome excluem abas, favoritos e informações externas à interface. As imagens de `chrome/` incluem a prévia de QA escalada para caber na janela; as medidas registradas são do iframe na dimensão CSS real, não da miniatura externa. Não se usa a miniatura para alegar leitura em escala 1:1. A captura direta de zoom 200% é do Chrome, sem o iframe de revisão.

## Histórico de revisão

1. **P1, hierarquia e enquadramento — blocked.** A main mostrava CCPF e presidente como raízes pares e impunha exploração vertical no celular. Correção: relações canônicas em cadeia, faixas distintas, fit pelas duas dimensões e grupos de apresentação quando necessário. Evidência antes/depois na comparação conjunta e matriz abaixo.
2. **P2, acabamento superior — blocked.** O proprietário rejeitou zigue-zague e cartões especiais. Correção: um eixo comum, medalhões discretamente diferentes, legendas à direita, distâncias regulares e conectores entre níveis. Evidência posterior: `comparison-upper.webp` e centros medidos abaixo.
3. **P2, espaço e densidade — blocked.** A barra de filtros ocupava largura importante; a faixa comercial inferior precisava favorecer Vendas e contratos. Correção: seis ícones abaixo da marca, Área comercial menor, métricas com espaço superior menor e alinhamento sem stretch. Evidência: captura final e `comparison-dashboard-region.webp`.
4. **P2, conexão em paisagem — blocked.** Na primeira conferência compacta, a aresta de Assessorias atravessava o rótulo de Comissões. Correção: aproximação pelo topo dos ícones compactos, mantendo ramificações independentes. Nova captura [844×390](docs/validation/ecosystem-fit/after-844x390.webp) e [medição final](docs/validation/ecosystem-fit/chrome-measurements.json): zero cruzamentos de conectores com legendas, por amostragem SVG a cada três unidades.
5. **Revisão final — passed.** Comparação conjunta e recortes inspecionados após as correções; nenhum P0/P1/P2 acionável permanece no escopo visual solicitado. Lacunas de ambiente estão explicitadas abaixo.

## Matriz mensurável do ecossistema

Todas as linhas terminaram sem overflow da página, com retratos e legendas dentro do retângulo útil e zero cruzamentos detectados entre conectores e legendas. Os quatro centros superiores coincidem com diferença máxima de 0,1 px por arredondamento. Escala é a da câmera interna; não é zoom do navegador.

| Viewport CSS | Apresentação final | Escala | Nós por página | Centros superiores x |
|---|---|---:|---:|---|
| 1440×900 | Unidades | 1,000 | 37 | 720 / 720 / 720 / 720 |
| 1366×768 | Unidades | 0,939 | 37 | 683 / 682,9 / 682,9 / 683 |
| 1280×720 | Unidades, 2 páginas | 1,000 | 26 na primeira | 640 / 640 / 640 / 640 |
| 1280×600 | Unidades, 3 páginas | 1,000 | 15 na primeira | 640 / 640 / 640 / 640 |
| 390×844 | Cadeia e dois grupos | 1,000 | 6 | 195 / 195 / 195 / 195 |
| 393×852 | Cadeia e dois grupos | 1,000 | 6 | 196,5 / 196,5 / 196,5 / 196,5 |
| 430×932 | Cadeia e dois grupos | 1,000 | 6 | 215 / 215 / 215 / 215 |
| 360×800 | Cadeia e dois grupos | 1,000 | 6 | 180 / 180 / 180 / 180 |
| 844×390 | Cadeia e grupos compactos | 1,000 | 6 | 422 / 422 / 422 / 422 |
| 720×450, reflow | Cadeia e grupos compactos | 1,000 | 6 | 360 / 360 / 360 / 360 |

[Medidas finais do Chrome](docs/validation/ecosystem-fit/chrome-measurements.json), [matriz anterior/intermediária detalhada](docs/validation/ecosystem-fit/measurements.json), [interações verificadas](docs/validation/ecosystem-fit/interaction-checks.json).

Capturas equivalentes antes/depois: [1366 antes](docs/validation/ecosystem-fit/before-1366x768.webp) / [depois](docs/validation/ecosystem-fit/after-1366x768.webp); [1440 antes](docs/validation/ecosystem-fit/before-1440x900.webp) / [depois](docs/validation/ecosystem-fit/after-1440x900.webp); [1280 antes](docs/validation/ecosystem-fit/before-1280x720.webp) / [depois](docs/validation/ecosystem-fit/after-1280x720.webp); [390 antes](docs/validation/ecosystem-fit/before-390x844.webp) / [depois](docs/validation/ecosystem-fit/after-390x844.webp); [393 antes](docs/validation/ecosystem-fit/before-393x852.webp) / [depois](docs/validation/ecosystem-fit/after-393x852.webp); [430 antes](docs/validation/ecosystem-fit/before-430x932.webp) / [depois](docs/validation/ecosystem-fit/after-430x932.webp); [360 antes](docs/validation/ecosystem-fit/before-360x800.webp) / [depois](docs/validation/ecosystem-fit/after-360x800.webp); [paisagem antes](docs/validation/ecosystem-fit/before-844x390.webp) / [depois](docs/validation/ecosystem-fit/after-844x390.webp).

No zoom nativo de **200%**, confirmado pelo controle do Chrome, a apresentação adotou os grupos, mantendo CCPF, presidente, vice, Central, Comissões e Assessorias visíveis: [captura](docs/validation/ecosystem-fit/chrome/ecosystem-zoom-200.webp). O zoom original de 90% do perfil foi restaurado após o teste.

## Medidas da faixa comercial

Comparação final na mesma fixture, viewport e zoom do Chrome. Largura × altura em CSS px:

| Viewport | Área comercial antes → depois | Vendas e contratos antes → depois |
|---|---|---|
| 1440×900 | 460,7×171,6 → 361,4×170,3 | 921,3×171,6 → 1020,6×163,6 |
| 1280×720 | 407,3×171,6 → 319,6×166,0 | 814,7×171,6 → 902,4×163,6 |

Vendas e contratos recuperou 8 px de altura nas duas larguras e ganhou 99,3 / 87,7 px horizontais. Ficou abaixo da altura natural de Área comercial. Os três cards financeiros continuaram com **164 px**; o início dos KPIs permaneceu em **y=530,5 px** antes/depois, sem alegar nova recuperação nessa parte já entregue na PR anterior.

As medidas anteriores tomadas a outro zoom permanecem no histórico; não foram misturadas com essa comparação final. Em 390/430 px, a assinatura passa à faixa inferior e o card cresce naturalmente, sem cortar valores ou exigir altura igual ao vizinho empilhado. A compactação financeira histórica e a navegação de caixa/assinatura já integradas permanecem documentadas no [relatório anterior](docs/validation/dashboard-compact/design-qa-previous.md).

## Cinco superfícies de fidelidade

- **Fontes e tipografia:** famílias existentes preservadas. Nomes completos sem clamp/reticências; níveis superiores e cargos distinguíveis. A grade/paginação protege tamanho de leitura. O recorte de nomes permite conferir pesos, entrelinhas e quebras. A duração da assinatura segue secundária aos três contadores; cifras permanecem tabulares.
- **Espaçamento e layout:** eixo superior comum, intervalos constantes por modo, legendas fora das linhas. Grade inferior usa a largura do notebook; grupos móveis mostram todas as relações principais. Filtros e rodapé não encobrem nós. A linha comercial cresce horizontalmente sem aumentar a altura.
- **Cores/tokens:** azul profundo, dourado, retratos e grafismos oficiais preservados. Cores semânticas azul/laranja/verde da Dashboard permanecem em `--overview-*`, no CSS local. Foco visível e estados pressionados continuam distinguíveis.
- **Imagens e ícones:** marca e fotos oficiais reais, com reserva de dimensões e fallback existente. Os quatro novos retratos usam WebP de 512 px; Jorge foi aberto no painel e a imagem carregada foi conferida. O mascote do bot usa assets existentes de olhos abertos/piscar, sem redesenho por emoji. [Portal](docs/validation/ecosystem-fit/chrome/bot-portal.webp), [Mapa](docs/validation/ecosystem-fit/chrome/bot-map.webp), [Agenda](docs/validation/ecosystem-fit/chrome/bot-agenda.webp).
- **Copy/conteúdo:** papéis canônicos de presidente e vice, nomes e quantidades dinâmicos; correção definitiva **Jonas Santos**. Nenhum texto técnico do prompt foi levado ao produto. Os rótulos dos seis filtros permanecem acessíveis embora visualmente compactos.

## Interações, estados e testes

Navegador integrado do Codex durante a matriz inicial; Chrome no perfil **Leo**, solicitado pelo proprietário, na conferência final. A visão mobile é emulação por viewport; não houve teste físico em iPhone nem sessão Safari iOS.

Foi conferido no navegador: abertura final enquadrada, seis filtros, grupos inferiores, acesso às 28 comissões e cinco assessorias da fixture, retorno à visão geral com foco no grupo, seleção de Jorge, retrato carregado, fechamento do painel com foco e câmera exatos. A entrada foi conferida com o estado final e a ação Pular; ordem, duração máxima, reduced motion, atualização e cancelamento também têm cobertura automatizada. Não foi gravado vídeo quadro a quadro.

A prévia do bot usa os componentes reais do botão/slots e do cabeçalho do Mapa/portal; a Agenda é uma representação do seu cabeçalho. Não é uma sessão autenticada de produção. Os testes do launcher real cobrem posição única por rota, bloqueio por elegibilidade, reconfirmação de senha, atalho e ausência de botão flutuante quando o slot da rota está ausente. Nenhuma consulta ao bot foi enviada para testar posicionamento.

Os estados de carregamento, falha, restrição e ausência de histórico comercial continuam no provider existente e nos testes pertinentes. Não foram alterados fetch, média, amostra, centavos ou permissões. Os testes preservam a distinção entre consulta de contratos e gestão de vendas.

- Typecheck: passou.
- Build: passou, mantendo avisos existentes de Browserslist e chunks grandes.
- Testes pertinentes: **120 passaram, zero falhas**.
- Suíte completa: **3.849 passaram e 90 falharam**. Baseline main isolada: **3.834 passaram e as mesmas 90 falharam**; nenhum nome de teste falho novo. [Resultado e lista das falhas preexistentes](docs/validation/ecosystem-fit/test-results.json).
- `git diff --check`: passou.
- A API de Chrome nativo usada forneceu interface acessível e capturas; não foi executada auditoria final de console. Essa limitação não foi substituída por uma alegação de console limpo.

## Checklist final e limites

- Hierarquia, conectores, agrupamentos e paginação usam o grafo canônico; pessoas e classificações preservadas.
- Um plano de entrada compartilhado, interrupção manual, reduced motion e cleanup.
- Foco e contexto restaurados; nomes completos e retratos com dimensões reservadas.
- Uma única média de assinatura; bot com posição única e permissões preservadas.
- Dados dos quatro retratos e nome de Jonas atualizados por IDs exatos; sem mudança de schema/RLS/capabilities.
- Capturas de demonstração sem compradores/contatos/tokens; documentação e reprodução atualizadas.
- Limites: sem validação física iOS, sem gravação da animação e sem deploy/merge da interface. Testar em Safari físico permanece acompanhamento de ambiente, não uma validação já alegada.

**final result: passed**
