# Resolução estável durante a navegação — 30/09/2026

A causa confirmada da perda global de definição é o desconto de DPR aplicado ao iniciar a navegação. A correção conserva a resolução vigente durante movimento e damping, usando o controlador adaptativo existente. Adaptações por lentidão sustentada, viewport e modo continuam disponíveis. As medições abaixo distinguem esse resultado da fluidez e dos artefatos ainda não comprovados.

## Revisões e ambiente

- Branch: `codex/commercial-map-stable-navigation-dpr`.
- Entrada: `main` em `6cd27b9182fa78b4f3cd5585fa81c868d07825bf`, com apenas `.worktrees/` não rastreado. Após fetch, a branch específica partiu de `origin/main` em `ff3bb70f`; o fetch final confirmou a mesma base remota. Alterações locais foram preservadas, sem reset destrutivo ou reescrita de histórico.
- Baseline local: `ff3bb70f`; implementação: `3de0cfd8cbe75f6b0130640d8791e137c64685ac`. A revisão histórica `6cd27b91` não foi tratada como deploy atual nem como versão comprovadamente boa.
- Builds de produção locais com `VITE_COMMERCIAL_MAP_DIAGNOSTICS=true` (flag opt-in conferida no código), em `http://127.0.0.1:4231` (A) e `http://127.0.0.1:4232` (B).
- Rota controlada: `/__dev/commercial-map-rendering?persistedStage=1&benvenutoQa=1&qualityQa=HIGH`. A fixture local não comprova dados ou comportamento de produção.
- Lockfile conferido: React/React DOM 18.3.1, Vite 5.4.19, Three.js 0.170.0, R3F 8.17.10, Drei 9.122.0, react-postprocessing 2.19.1, postprocessing 6.37.8, Zustand 5.0.11 e Supabase JS 2.96.0. Dependências não foram atualizadas.
- Notebook disponível: Intel Core i5-1035G1, 4 núcleos/4 threads reportados, 8 GB de RAM; aproximadamente 706 MB livres no levantamento. Windows 11 Home, build 10.0.26200; Intel UHD, driver 31.0.101.2141; tela a 60 Hz; conectado à energia, bateria a 100% no levantamento.
- Chrome 154.0.8037.58, conforme o relatório do harness; adaptador Intel UHD via ANGLE/D3D11. Aba visível e em foco nos ensaios. Viewport/DPR definidos pelo harness; não representam um celular físico. `visualViewport.scale=1` no ambiente registrado; zoom do navegador não foi aferido independentemente. Sem throttling; temperatura não medida.

## Proprietários do pipeline

`CommercialMapCanvas` mantém um único Canvas sob demanda e OrbitControls. O início de movimento efetivo ativa `cameraNavigating`; soltar o controle inicia settling. O sinal só termina após três frames consecutivos com deslocamentos de câmera e target inferiores a `0.00008` unidade. Esse detector e os controles não foram alterados.

`CommercialMapAdaptiveQualityController` é o único proprietário de `setDpr()`: reconcilia renderer e estado do R3F, respeita readiness e preparação de programas, mede janelas de 45 frames ativos e exige duas janelas lentas para downgrade. Mantém a última base solicitada durante atividade; a aplica após damping. Mudanças pesadas do tier da cena usam a janela idle existente de 650 ms. Esses 650 ms não são uma espera adicional de DPR.

`CommercialMapEnvironment` possui o compositor nativo e a apresentação final. Ele observa o DPR e sincroniza os buffers com o drawing buffer, inclusive quando o tamanho CSS permanece constante. Seu `composer.setSize(width, height)` recebe dimensões lógicas CSS; postprocessing 6.37.8 consulta `renderer.getDrawingBufferSize()` para dimensionar input/output e passes em pixels físicos. Passar o tamanho físico a esse contrato repetiria o DPR. A assinatura inclui tamanho CSS e drawing buffer, sem depender exclusivamente de resize CSS. Não foi criado outro proprietário de desenho, resolução ou invalidação. O mapa continua sob demanda, com invalidações de navegação/animação e recuperação de contexto preservadas.

## Causa e hipóteses

Na reprodução inicial com DPR de dispositivo 2, CSS do Canvas `1265 × 592` e perfil HIGH, iniciar o movimento mudou DPR efetivo de `1.75` para `1.35` e drawing buffer de `2213 × 1036` para `1707 × 799`. Tier HIGH e caminho `post` permaneceram iguais. O desconto remove aproximadamente 40,5% dos pixels teóricos no mesmo viewport; essa proporção não é uma estimativa de economia de CPU/GPU ou ganho de FPS.

O código aplicava o desconto uma vez na borda de atividade e congelava o valor durante o gesto; não o alterava a cada frame. Na última amostra da reprodução inicial, 3,5 s após soltar, a câmera ainda estava em damping. Essa execução não comprova a restauração em repouso; o retorno anterior é comprovado pelo código e seus testes, e deve ser separado das amostras finais abaixo.

O desconto já existia em `20d9319d`/`5d388942`, de 04/09. `a4e5dbf5`, de 22/09, relaxou escala/cap anteriores de 0,72/1 para 0,9/1,35. Não foi encontrada referência anterior comprovadamente boa.

A auditoria descartou buffers obsoletos ou DPR aplicado duas vezes como causa desta transição: o compositor nativo já trata alterações de DPR. A correção citada em [react-postprocessing 3.1.3](https://github.com/pmndrs/react-postprocessing/releases/tag/v3.1.3) é uma pista de auditoria, não uma necessidade de atualização da stack instalada.

SMAA, sharpen 0,16, iluminação, sombras, materiais, vegetação, geometria e caminho de apresentação foram preservados. A/B mantém esses fatores constantes e altera apenas a política de DPR. C/D com sharpen desligado não foram executados: o defeito prioritário foi isolado pelo DPR, sem evidência adicional que justificasse expandir a intervenção. Cintilação residual independente da resolução permanece inconclusiva até comparação visual válida.

## Alterações e evidência associada

| Arquivo | Alteração | Evidência/limite |
| --- | --- | --- |
| `src/features/commercial-map/utils/adaptiveQualityRuntime.ts` | Retira escala/cap de interação; conserva `effectiveDpr` durante atividade e aplica a base mais recente ao parar. | Queda live de DPR/buffer coincide com início do movimento; testes verificam zero writes por bordas e base pendente. |
| `src/features/commercial-map/utils/viewport.ts` | Corrige comentário de recuperação conservadora após navegação. | Não muda thresholds, orçamento ou histerese. |
| `src/test/commercialMapAdaptiveQualityRuntime.test.ts` | Cobre budgets existentes, gestos repetidos e atualização da base. | Seis valores de DPR, 20 ciclos por valor, sem desconto ou writes redundantes. |
| `src/test/commercialMapAdaptiveQualityController.test.tsx` | Cobre atividade/damping, latest reduced, resize/orientação, Visita e adaptação sustentada. | Mantém gates de compilação/readiness, stalls ativos, exclusão de idle e isolamento entre modos. |
| `src/test/commercialMapPostProcessing.test.tsx` | Verifica propagação de mudanças de DPR aos buffers de pós-processamento. | Auditoria do compositor instalado; não altera apresentação visual de produção. |
| `scripts/commercial-map-performance/navigation-resolution.cjs` | Harness opt-in para probe, comparação serial, captura visual e navegação sustentada em loopback. | Não escreve dados comerciais nem consulta o driver de forma síncrona por frame. |
| `AGENTS.md` | Acrescenta princípio duradouro de resolução estável durante navegação/damping. | Prova runtime e testes; todas as regras comerciais anteriores mantidas. |

## Método e resultados antes/depois

O orçamento de referência definido antes da comparação final foi 33,3 ms por frame ativo, p95 com tolerância de 50 ms e engasgo estritamente acima de 50 ms, igual em A/B. Esses valores são metas deste ensaio, não garantias para todo hardware. Mediana e p95 excluem repouso legítimo sob demanda; não se usa FPS em repouso nem se somam janelas sobrepostas.

O harness usou contextos novos e uma única cena carregada por vez, alternando **A1/B1/B2/A2/A3/B3**; seis trials e 20 cenários concluíram com foco/visibilidade válidos e sem erros de página. Cache do navegador/driver foi compartilhado entre trials. Cada cenário aguardou hydration completa, readiness, mais 6 s e aquecimento não medido com a mesma trajetória. Perfil HIGH fixo e DPR de dispositivo emulado 1 isolam a política de movimento; o ensaio adaptativo sustentado é separado abaixo. Foram concluídas rotação contínua, movimentos curtos e zoom/pan, na visão geral e aproximação.

As poses usam pontos do PDF oficial `overview=[3000,2850]` e `close=[2580,3800]`, convertidos por `officialPdfPointToLocal`; offsets e tolerâncias da câmera são unidades locais da cena, não metragens cadastrais. Os deslocamentos de ponteiro são pixels CSS e os intervalos são milissegundos. A rotação contínua percorre 5 s, +160 px na horizontal e ±24 px na vertical; a curta usa três drags de 350 ms, +28 px/±5 px. O zoom dura 900 ms e envia wheel ao mudar `floor(t×8)`: índices 0 a 8 permitem até nove eventos, mas baixa cadência pode saltar índices; `deltaY` é −35 nos índices 0–3 e +35 nos demais. Depois de estabilizar, o pan dura 1,7 s, +45 px/±20 px. O replay conserva a trajetória temporal; não promete uma quantidade fixa de eventos por frame. Rotação contínua repete em todos os trials; movimentos curtos e zoom/pan rodam uma vez por revisão, no primeiro trial.

| Rotação contínua, três repetições | Faixa de medianas | Faixa de p95 | Engasgos R1/R2/R3 | Resizes R1/R2/R3 |
| --- | --- | --- | --- | --- |
| Geral A | 31,3–39,5 ms | 37,9–60,4 ms | 0/13/26 | 2/2/2 |
| Geral B | 34,2–36,2 ms | 40,4–59,9 ms | 3/0/24 | 0/0/0 |
| Aproximação A | 25,2–31,1 ms | 28,2–35,9 ms | 0/3/0 | 2/2/2 |
| Aproximação B | 26,9–34,7 ms | 31,2–40,3 ms | 0/0/1 | 0/0/0 |

A variou DPR `1→0,9→1` e buffer `1265×720→1138×648→1265×720`. B manteve DPR 1 e `1265×720`, sem `setSize`, `setPixelRatio` ou resize efetivo nos dez cenários. Perfil HIGH e caminho `post` permaneceram iguais; identidade de Canvas/renderer/controles, seleção e inventário foram invariantes nos 20 cenários. Na rotação geral R1, todas as capturas em movimento mostram buffers do compositor e SMAA em `1138×648` para A e `1265×720` para B; ambos terminaram em `1265×720`.

Em movimentos curtos, A fez seis resizes e B zero em ambas as poses. Em zoom/pan, A fez dez na visão geral e vinte na aproximação; B zero. As tabelas com todas as medianas/p95/max, contagens e amostras de cada repetição estão em [metrics.md](metrics.md). No geral, A2/A3 e B3 ultrapassaram p95 de 50 ms; todas as medianas de B no geral ficaram acima de 33,3 ms. A aproximação B2 também excedeu a meta de mediana. A candidata elimina a mudança de definição por gesto, mas não sustenta a meta de 30 FPS em todas as execuções deste notebook. As medianas de aproximação são maiores com resolução estável; isso é um custo medido, não um ganho de FPS.

| Recursos da rotação contínua, antes→depois | Draw calls | Triângulos | Geometrias | Texturas/programas |
| --- | --- | --- | --- | --- |
| Geral A, todas as repetições | 814→816 | 656.670→685.712 | 579→579 | 136/242 constantes |
| Geral B | 814→816 | 656.670→685.712 | 579→579 em B1/B2; 587→587 em B3 | 136/242 constantes |
| Aproximação A | 268→252 | 502.983→461.071 | 606→608/607/607 | 141/243 constantes |
| Aproximação B | 630→252 em B1/B2; 268→252 em B3 | 899.618→461.071 em B1/B2; 502.983→461.071 em B3 | 606→608/607; 614→615 | 141/243 constantes |

As contagens instantâneas da aproximação diferem antes do gesto; não comprovam workload idêntico em todos os frames. Há variação inicial entre contextos e acréscimo de uma ou duas geometrias na aproximação em ambas as revisões. Contagens do renderer não medem tempo GPU nem memória em bytes.

Na execução candidata com política adaptativa completa, houve um gesto de 120 s, com janela ativa incluindo damping de aproximadamente 121,6 s: 3.388 amostras, mediana 34,2 ms, p95 44,3 ms, 96 engasgos acima de 50 ms e máximo 805,5 ms; 64 tarefas longas. DPR 1/buffer `1265×720`, caminho `post` e identidade/inventário/seleção permaneceram constantes; zero resizes. Nas 1.217 capturas periódicas, geometrias/texturas/programas ficaram em 579/136/242. Isso sustenta ausência de crescimento desses recursos durante esse gesto, sem certificar estabilidade térmica ou memória em bytes.

A cena sustentada começou MEDIUM. A lentidão medida solicitou LOW, conservando scene tier MEDIUM durante movimento; o commit LOW/LOW ocorreu na pausa de 650 ms e foi registrado antes do smoke. Base e DPR efetivo continuaram em 1: não havia mudança de DPR necessária nessa configuração. As métricas do gesto medem MEDIUM; não medem a fluidez de LOW após o commit. Não houve oscilação recorrente de tier.

O opt-in CPU/GPU desse ensaio usou queries assíncronas: GPU suportada, 227 amostras, média 34,514 ms e p95 38,494 ms; CPU 240 amostras, média 31,663 ms e p95 40,6 ms. São caudas limitadas a 240 amostras, não estatísticas dos 120 s completos. CPU mede submissão de render, não todo o processamento da interação. Houve 34 queries GPU descartadas, zero disjoint e quatro pendentes no snapshot. CPU e GPU podem se sobrepor e não foram somadas. A medição sustentada foi salva antes de o smoke falhar posteriormente por capturar `beforeLoss` com navegação ainda ativa; a falha foi preservada, sem atribuí-la a uma regressão de câmera. A repetição corrigida passou, como descrito abaixo.

Na captura visual separada, DPR de dispositivo emulado 2, CSS `1265×720`, zoom 1 e perfil HIGH, A fez `1,75→1,35→1,75`, com drawing buffer `2213×1260→1707×972→2213×1260`. B manteve `1,75` e `2213×1260` no repouso, no movimento e depois do damping. As duas amostras que delimitam cada PNG de movimento tinham `cameraNavigating=true`; as de repouso/parada tinham false. Tier HIGH e caminho post permaneceram iguais. Os PNGs iniciais de repouso de A/B têm o mesmo SHA-256: `fbcbb59a8691121625361d2d8d9890883ac95930cf66deecfe811b3ad17088bb`.

| Captura separada, mesma pose inicial e trajetória | A | B |
| --- | --- | --- |
| Vídeo do Canvas | [Antes](evidence/baseline-HIGH-dpr2-close.webm), 11,24 s/13.713.501 bytes | [Depois](evidence/candidate-HIGH-dpr2-close.webm), 14,07 s/6.385.618 bytes |
| PNG em movimento | [Antes](evidence/baseline-HIGH-dpr2-close-moving.png) | [Depois](evidence/candidate-HIGH-dpr2-close-moving.png) |
| PNG em repouso | [Antes](evidence/baseline-HIGH-dpr2-close-rest.png) | [Depois](evidence/candidate-HIGH-dpr2-close-rest.png) |
| PNG após damping | [Antes](evidence/baseline-HIGH-dpr2-close-settled.png) | [Depois](evidence/candidate-HIGH-dpr2-close-settled.png) |

Os PNGs são lossless em escala de dispositivo, `2560×1440`, sem redução do arquivo. O vídeo usa o stream nativo do Canvas, VP9/WebM, bitrate solicitado de 40 Mbps e cadência solicitada de 60 Hz; isso não significa que o renderer atingiu 60 FPS. A codificação continua lossy. Metadados adjacentes preservam dimensões físicas, câmera, timestamps e estado de navegação. Screenshots têm janelas de captura de 2,2–3,2 s durante movimento, com poses diferentes dentro da mesma trajetória; não foram usados para um diff pixel a pixel. As durações dos vídeos incluem captura, damping e pausa, e não entram nas métricas. A inspeção confirma a definição adicional sem mudança da aparência em repouso; não estabelece uma redução quantitativa da cintilação subpixel independente do DPR. O cenário HIGH/DPR 2 é uma comparação visual, não uma certificação de fluidez nesse orçamento.

O smoke repetido com precondição correta passou: câmera e target estáveis por 2 s, navegação false, seleção `reference:2026:q-r-01` preservada; viewport `720×1280` produziu buffer `1233×2240`, retornando a `1280×720`/`2213×1260`, sempre DPR 1,75. A perda de contexto foi intencional e separada das métricas. Recuperou o caminho post, readiness, câmera/target (tolerância `0,0001`), seleção e a mesma identidade de Canvas/renderer/controles. Evidência: [smoke final](evidence/candidate-HIGH-dpr2-trial1-smoke.json) e [resumo visual](evidence/visual-HIGH-dpr2-summary.json). A tentativa anterior permanece documentada: não satisfazia a precondição de câmera parada e foi rejeitada como verificação de preservação da pose.

A primeira tentativa comparável esgotou 240 s antes de hydration completa e foi rejeitada, sem antecipar readiness. O timeout do harness foi ampliado para 600 s sem alterar o aplicativo. Uma segunda tentativa carregou dois contextos WebGL simultaneamente: seus tempos foram excluídos de evidência de desempenho e preservados em `excluded-dual-context/`, somente como diagnóstico. Nela, zero resizes por gesto na candidata sustenta a transição do controlador; não sustenta ganho de fluidez.

Os 38 traces brutos/diagnósticos de boot, quatro resumos originais e oito logs estão em [raw-traces.zip](evidence/raw-traces.zip), com paths relativos a este relatório. O ZIP foi validado por CRC e comparação byte a byte com cada trace/log original; não houve alteração dos dados. Os resumos JSON diretamente acessíveis usam formatação compacta com igualdade de dados verificada; PNG/vídeos permanecem originais. A tentativa sustentada retornou exit 1 pela precondição inválida do smoke posterior; as métricas já salvas foram verificadas separadamente. A comparação serial e a captura visual/smoke corrigido retornaram exit 0.

## Reprodução

Nos checkouts isolados das duas revisões, gerar builds com `$env:VITE_COMMERCIAL_MAP_DIAGNOSTICS='true'; npm run build -- --outDir <diretório-absoluto>` e servir cada diretório com `node scripts/commercial-map-performance/serve-public-preview.cjs <diretório> 4231` (A) ou `4232` (B). A flag é opt-in local, não foi usada para deploy. O build também gera arquivo MCP fora desta correção; esse efeito local foi preservado e excluído da PR.

No PowerShell, usar a instalação existente do Playwright, sem acrescentar dependência:

```powershell
$env:PLAYWRIGHT_MODULE='C:/Users/Leonardo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'
$env:NAV_PHASE='compare'
$env:NAV_QUALITY='HIGH'
$env:NAV_DEVICE_DPR='1'
node scripts/commercial-map-performance/navigation-resolution.cjs
```

Para o ensaio adaptativo, em outro processo sem outro mapa carregado: `NAV_PHASE=sustained`, `NAV_QUALITY=adaptive`, `NAV_DEVICE_DPR=1`, `NAV_SUSTAINED_MS=120000`, `NAV_RENDER_TIMING=1`. Para a captura separada: `NAV_PHASE=visual`, `NAV_QUALITY=HIGH`, `NAV_DEVICE_DPR=2`, `NAV_VIEWS=close`, `NAV_VIDEO=1`, `NAV_SMOKE=1`. Usar `NAV_OUTPUT` para evitar sobrescrever evidências anteriores, e `NAV_BASELINE_REVISION`/`NAV_CANDIDATE_REVISION` para registrar as revisões. O harness aceita apenas endpoints loopback; a aba deve permanecer em foco. A resolução e os cenários emulados não identificam a capacidade de um celular físico.

## Checks automatizados

| Comando/check | Resultado |
| --- | --- |
| `npm test -- src/test/commercialMapViewport.test.ts src/test/commercialMapAdaptiveQualityRuntime.test.ts src/test/commercialMapAdaptiveQualityController.test.tsx` | 60/60 passaram. |
| `npm test -- src/test/commercialMapPostProcessing.test.tsx src/test/commercialMapRendererHealth.test.tsx src/test/commercialMapRenderTiming.test.ts` | 23 + 9 + 6 passaram nas execuções pertinentes; total pertinente 98/98. |
| `npm run typecheck` | Passou na revisão final. |
| ESLint restrito aos arquivos alterados e harness | Passou. |
| `git diff --check` | Passou. |
| Builds A/B de produção | Passaram; durações de 2m33s/8m24s sob carga de CLI não são FPS nem benchmark gráfico. |
| Lint do projeto, excluindo somente `.worktrees/` | 1.031 erros/88 avisos: 980/68 em arquivos rastreados e 51/20 em caches locais. Nenhum nos arquivos alterados. |

Os testes amplos de estabilidade encontraram ausência de `MapPanels.setEditingLot` preexistente: o blob afetado é idêntico em `ff3bb70f` e HEAD. Timeouts de paridade sob carga ficaram inconclusivos; não foram convertidos em sucesso. O primeiro teste novo de runtime atingiu timeout com muitas assertions sob carga: agrupou-se a verificação mantendo seis budgets e todos os 20 ciclos, sem ampliar timeout ou enfraquecer critérios; a rodada final passou.

Alteração local gerada em `supabase/functions/mcp/index.ts` foi preservada e excluída da PR. Não houve mudanças em preços, status, IDs, vendas, contratos, permissões, RLS, rotas ou organização espacial oficial.

## AGENTS.md, limitações e reversão

Todas as orientações originais do AGENTS foram consideradas compatíveis com a arquitetura e mantidas: rastreabilidade/arquivamento, precificação, identidade persistida, imagens privadas, espaços sem número, numeração contextual, fases comerciais, escopo público e capabilities. Nenhuma orientação obsoleta, contraditória ou excessivamente prescritiva foi encontrada. O único acréscimo registra que navegação/damping não devem, por si só, diminuir DPR; hipóteses e métricas ficam neste relatório.

Faltam Android físico, iPhone/iPad e Safari, GPU dedicada e outro notebook, toque/trackpad físico, temperatura e consumo de bateria. Não há certificação multiplataforma, térmica ou de memória por viewport emulado. Links públicos com tokens reais e fluxos comerciais de produção não foram acessados; os testes locais não certificam esses ambientes. Mouse/rotação, wheel/zoom, pan, seleção pela store da fixture, resize/orientação e recuperação de contexto foram exercitados localmente. Picking por clique, pavilhões internos, filtros, noite, hidrologia, Modo Visita e retorno de aba em segundo plano não foram certificados por esta reprodução curta; testes existentes de controlador preservam o isolamento de Visita/lunar e readiness. Não foram ampliados ensaios sem relação com a causa confirmada.

Esta PR elimina a queda de definição provocada pelo início de movimento nos cenários reproduzidos. O compromisso observado no notebook ficou próximo de 30 FPS em mediana, com engasgos remanescentes e variação registrada; o orçamento HIGH fixo não foi aprovado universalmente e LOW pós-adaptação não recebeu uma medição independente. Build ou teste unitário aprovado não certifica ausência de cintilação nem 30/60 FPS. Não houve deploy, merge, transações comerciais ou integração de serviços externos.

Reversão: aplicar `git revert 3de0cfd8cbe75f6b0130640d8791e137c64685ac` em uma branch de correção e revisar eventuais conflitos com commits posteriores. Isso repõe a política anterior e seus testes, sem migração de dados ou alteração comercial. A documentação/AGENTS acrescentada posteriormente pode ser revertida por seus próprios commits, preservando as regras comerciais anteriores.
