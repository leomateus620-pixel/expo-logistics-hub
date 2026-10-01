# Navegação e nomes no plano do mapa

## Condições e fronteira da evidência

Base: `a154d470d7669bb5bf6a8ea2e52aa741ed22a5ab`. Ensaios locais com o renderer de produção, diagnóstico opt-in e inventário de referência; não representam payload autenticado, deploy ou medição dos prints enviados. Windows, Core i5-1035G1, Intel UHD via ANGLE/D3D11, Chrome 154, WebGL2, viewport 1280×720. O Canvas medido tem CSS 1265×720. Os manifestos servidos registram revisão e hashes dos fontes executados.

As amostras começam após hidratação completa, aquecimento e repetição não medida do gesto. Só intervalos ativos de navegação/damping entram nos tempos de frame; repouso do Canvas sob demanda não vira FPS. Cada cena é fechada antes de carregar a seguinte. Gravação, wrappers de diagnóstico e CPU sampling são execuções separadas da comparação final.

## Diagnóstico dirigido

| Ensaio | DPR / buffer | Mediana / p95 ativos | CPU de submissão, média | GPU, média |
| --- | --- | --- | --- | --- |
| Base, rotação | 1 / 1265×720 | 34,0 / 40,7 ms | 29,417 ms | 32,711 ms |
| Base sem bloom | 1 / 1265×720 | 34,6 / 42,2 ms | 30,053 ms | 33,295 ms |
| Base direta, CPU sampling separado | 1 / 1265×720 | 32,2 / 39,1 ms | 25,107 ms | 31,470 ms |
| Base, diagnóstico de draws | 1,75 / 2213×1260 | 67,1 / 72,7 ms | 26,042 ms | 63,587 ms |
| Base sem recepção de sombras | 1,75 / 2213×1260 | 65,0 / 104,5 ms | 34,715 ms | 62,115 ms |
| Base direta | 1,75 / 2213×1260 | 54,6 / 60,4 ms | 20,736 ms | 52,233 ms |

CPU e GPU se sobrepõem e não devem ser somadas. Os timers assíncronos têm cauda limitada e queries pendentes; esses valores não são tempo fotônico nem a distribuição completa do gesto. O desligamento de bloom e sombras não sustentou uma melhoria que justificasse retirá-los isoladamente. Os outliers de CPU no ensaio sem sombras permanecem registrados.

No DPR 1,75, a GPU excede claramente o orçamento. O caminho direto economizou cerca de 18% do tempo GPU mantendo resolução e conteúdo, mas ainda excedeu 50 ms. O custo não está concentrado apenas no pós-processamento: a cena completa continua relevante. `WEBGL_multi_draw` está disponível e os lotes já agrupados usam um desenho por batch; não houve motivo para substituir seu pipeline ou picking.

O callback SVG territorial medido fez 233 atualizações, com média de 1,736 ms e máximo de 4,3 ms, incluindo overhead do wrapper. O CPU sampling também identificou `getComputedTextLength`. Esse trabalho de layout/projeção foi removido do movimento.

## Implementação

Os nomes permanentes usam um atlas, material e geometria compartilhados no plano XZ. Seus vértices contêm posição, orientação e dimensões no mundo; a câmera aplica a perspectiva normal. Não há billboard, cópia de quaternion, layout DOM ou medição de texto por frame. O teste de profundidade permite que construções os ocultem, e o raycast desativado preserva a seleção dos lotes.

Ruas usam a tangente do corredor próximo à âncora. O encaixe verifica o retângulo girado inteiro contra limites, buracos e obstáculos reais. Quadras conservam nomes e vínculos, destacam a letra e usam contorno discreto, sem cartão branco. Os arrays dos escopos filtrados são memoizados para que hover não reconstrua o atlas. Cartões contextuais permanecem na interface existente. A inspeção visual encontrou clipping pelo `polygonOffset -3/-2` dos lotes; o texto agora compartilha a mesma inclinação de viés, com uma unidade adicional, e mantém folga física acima do realce máximo de 0,09. As imagens finais confirmam que o lote não apaga os caracteres, conservando a oclusão pelos objetos 3D.

O controlador continua amostrando lentidão persistente enquanto a mudança pesada está pendente. DPR e recursos da cena aguardam estabilização; nenhum desconto de resolução foi ligado ao gesto.

LOW/MEDIUM executam a cena completa diretamente no framebuffer antialiased, com MSAA e ACES. HIGH/ULTRA conservam bloom, SMAA ULTRA e nitidez. O compositor fica residente; a troca barata não redimensiona targets, descarta materiais ou recompila programas. Se o driver não oferecer MSAA no contexto, o compositor com SMAA permanece ativo. O orçamento efetivamente aplicado é publicado em `commercialMapPostBudget`, também fora do diagnóstico. Upgrades esperam a cena estabilizar.

## Comparação final e validação

Primeiro candidato executado: `e5b3300a`, comparado com `a154d470`. A revisão final `82d8f12b` acrescenta a folga/viés de profundidade do texto; também inclui as correções dos gates QA. Builds diagnósticos de produção, mesmos perfis MEDIUM, DPR 1, buffer 1265×720 e inventário. A ordem principal foi A/B/B/A; uma confirmação A/B foi adicionada devido à cauda ruim da primeira execução candidata. Todos os intervalos permanecem nos arquivos, inclusive os outliers.

| Movimento | Base: mediana / p95 | Candidato: mediana / p95 | Engasgos >50 ms: base / candidato |
| --- | --- | --- | --- |
| Rotação, rodada 1 | 33,7 / 45,6 ms | 37,2 / 96,7 ms | 5 / 35 |
| Rotação, rodada 2 | 34,0 / 45,2 ms | 31,0 / 38,2 ms | 1 / 1 |
| Rotação, confirmação | 37,4 / 45,0 ms | 33,4 / 54,4 ms | 4 / 15 |
| Movimentos curtos | 33,3 / 41,0 ms | 33,1 / 47,4 ms | 4 / 6 |
| Zoom e pan | 36,4 / 47,4 ms | 33,9 / 42,4 ms | 3 / 1 |
| Rotação agregada, 615 / 607 amostras | 35,2 / 45,2 ms | 32,6 / 64,5 ms | 10 / 51 |

A mediana agregada caiu 7,4%, porém o p95 e os engasgos pioraram no conjunto. Portanto, **o ensaio não comprova melhoria consistente da cauda nem eliminação dos engasgos**. A causa dos outliers de CPU não ficou isolada: as long tasks são registradas como `unknown`, sem mudança de resolução, geometria, textura ou programa durante esses gestos. Não foram descartadas nem atribuídas ao sistema operacional sem evidência. A cena completa ainda excede o orçamento desta GPU no DPR 1,75, mesmo pelo caminho direto. A alteração reduz trabalho e corrige a resposta adaptativa, mas não é certificação de 30/60 FPS nem prova de fluidez no ambiente publicado.

A tentativa posterior A/B com o build final `82d8f12b` foi **invalidada**: a base imutável falhou em `critical-post:end` e permaneceu `ready/direct`, em vez de seu POST solicitado. O ensaio foi interrompido e não entra na tabela nem na agregação. Seus arquivos permanecem em `evidence/final-compare`, identificados como inválidos. O harness agora rejeita uma preparação crítica falha ou um caminho diferente do orçamento solicitado antes de medir. Assim, a comparação quantitativa acima é do candidato `e5b3300a`; a revisão final de profundidade tem confirmação funcional/visual e build, sem uma nova comparação quantitativa válida. O ambiente local mostrou instabilidade inclusive na base; isso não identifica sozinho a causa dos outliers anteriores.

Durante todos os movimentos da comparação, houve zero realocações do buffer e um único Canvas, renderer e OrbitControls. Os 1.578 IDs de entidades, 1.466 lotes e 273 árvores comerciais permaneceram presentes. A diferença de chamadas corresponde aos passes economizados e à única malha de texto, sem remoção de conteúdo comercial. CPU/GPU de cada execução estão nos summaries; o tempo GPU médio da confirmação foi 36,486 → 34,341 ms, enquanto a cauda de CPU permaneceu problemática.

Em um ensaio separado de navegação contínua por 30 s, a qualidade automática original HIGH foi congelada apenas para aquecimento e restaurada antes da medição; os tempos de frame não foram modificados. MEDIUM/effectTier entrou aos 7,9 s e LOW aos 13,7 s, ambos com sceneTier HIGH, DPR 1,75 e buffer 2213×1260 durante o gesto. A troca POST → DIRECT conservou 580 geometrias, 137 texturas e 244 programas. A única redução para DPR 1 aconteceu depois do damping (`cameraNavigating=false`); sceneTier LOW entrou após a pausa de 650 ms. Isso confirma que a adaptação continua medindo e reduz efeitos enquanto os recursos pesados estão pendentes. Não se atribui um ganho comparativo à posterior redução de resolução. O ensaio registrou mediana/p95 de 64,0/83,4 ms e um outlier de 1.020,9 ms ainda no trecho HIGH/POST, preservado nos dados.

Os nomes foram conferidos em seis orientações, incluindo vista superior, inclinada, oposta e rua diagonal. A Quadra M mudou 179,35° na projeção oposta e ganhou 1,98× de largura aparente ao aproximar a câmera, com o mesmo footprint, geometria e atlas. Os 14 nomes de quadras, três de segmentos e 27 de vias foram preparados uma vez. `depthTest` permaneceu ativo e o raycast da malha deu zero hits. A inspeção das capturas confirma integração ao terreno e oclusão por construções/vegetação.

A primeira execução visual falhou apenas no helper de seleção, que procurava exclusivamente `AVAILABLE` em um fixture composto por `BLOCKED`/`UNVALIDATED`. O helper foi corrigido para selecionar o inventário existente, sem mudar estados. A repetição focada passou: hover e clique reais selecionaram `reference:2026:q-m-09` (`BLOCKED`), no batch 171. Filtros e política pública local foram exercitados. O fixture público autorizou apenas IDs de lotes: ocultou nomes de quadras/segmentos e conservou vias contextuais, conforme a política anterior. Isso não verifica token, payload autenticado ou link público publicado.

Na revisão final, as 13 etapas do ensaio LOW/DIRECT passaram, incluindo todas as vistas, clique/hover, filtro, escopo público, viewport estreito, vídeo e uma perda/restauração intencional. A recuperação retornou `ready/direct`, preservou posição e alvo da câmera e reutilizou a malha/atlas. A inspeção das vistas inclinada/próxima confirma a correção do clipping dos nomes pelo preenchimento dos lotes.

### Evidências e reprodução

- [Comparação completa e análise agregada](evidence/comparison-analysis.json).
- [Comparação A/B/B/A](evidence/compare/compare-MEDIUM-dpr1-summary.json), [confirmação A/B](evidence/confirmation/compare-MEDIUM-dpr1-summary.json) e [adaptação contínua](evidence/adaptive/sustained-adaptive-dpr2-summary.json).
- [Resumo legível da verificação final](evidence/visual-checks-summary.json).
- Dados completos comprimidos: [perspectiva, escopo e recuperação HIGH/POST](evidence/visual/world-labels-report.json.gz), [seleção repetida](evidence/selection/world-labels-report.json.gz), [revisão final LOW/DIRECT](evidence/final-visual/world-labels-report.json.gz).
- [Vista superior final](evidence/final-visual/top.png), [quadras em perspectiva](evidence/final-visual/core-inclined.png), [aproximação](evidence/final-visual/core-close.png), [rua diagonal](evidence/final-visual/diagonal-road.png).
- [Trecho final em movimento](evidence/final-visual/world-labels-motion.webm). É captura nativa LOW/DIRECT, DPR 1, separada e comprimida; `captureStream(60)` é a cadência solicitada, não uma medição de FPS.

`navigation-resolution.cjs` usa somente URLs de loopback. Para repetir a comparação: `NAV_PHASE=compare`, `NAV_QUALITY=MEDIUM`, `NAV_DEVICE_DPR=1`, `NAV_REPEATS=2`, `NAV_VIEWS=overview`, `NAV_SCENARIOS=continuous,short,zoom-pan`, `NAV_RENDER_TIMING=1`, sem ablação, CPU profiler ou wrappers de texto/draw. Informe os dois endpoints e os hashes esperados dos manifestos em `NAV_BASELINE_REVISION`/`NAV_CANDIDATE_REVISION`. `PLAYWRIGHT_MODULE` aponta à instalação local existente.

Para observar a adaptação: `NAV_PHASE=sustained`, `NAV_QUALITY=adaptive`, `NAV_DEVICE_DPR=2`, `NAV_SUSTAINED_MS=30000`, `NAV_ADAPTIVE_WARMUP_HOLD=1`. O hold salva o tier automático corrente antes de qualquer aquecimento gestual e restaura seu estado; aborta se já estiver LOW. `world-labels.cjs` gera capturas, clique real e vídeo, aceita `WORLD_LABEL_QUALITY` e perda de contexto opt-in por `WORLD_LABEL_RECOVERY=1`. `WORLD_LABEL_SELECTION_ONLY=1` repete apenas a interação/escopo.

Os JSON brutos e o CPU profile são armazenados em `.gz`, sem remoção de amostras. O [índice de integridade](evidence/compressed-evidence-index.json) registra caminho original, bytes e SHA-256 do conteúdo descomprimido. Artefatos de diagnóstico e vídeos não entram no aplicativo.

### Checks e arquivos

Checks focados: **129 testes em oito suites passaram**, cobrindo qualidade adaptativa/controller, pós-processamento, paridade de execução, viewport, geometria territorial, política pública e gates de stress QA. TypeScript, ESLint dos 15 fontes/testes alterados e build passaram. O build registra os avisos preexistentes de chunks grandes/Browserslist; a suite de paridade registra duas instâncias de Three sem falha. O estado remoto de CI é informado na PR; não se presume verde a partir desses checks locais.

Arquivos de aplicação: `CommercialMapAdaptiveQuality.tsx`, `CommercialMapEnvironment.tsx`, `CommercialMapCanvas.tsx`, `TerritorialOrientation.tsx`, `adaptiveQualityRuntime.ts`, `executionPolicy.ts`, `territorialOrientation.ts`. O CSS da antiga camada SVG foi excluído. Também foram atualizados os testes correspondentes, a expectativa de caminho da página de diagnóstico, o helper de stress e os scripts QA de navegação, startup, paridade e rótulos. Não há migração, alteração de IDs/preços/status, nova cena ou backend comercial.

Celular físico não esteve disponível. Viewport 390×844 neste notebook é emulação de dimensões, sem certificação de GPU móvel, Safari, multitouch ou comportamento térmico.
