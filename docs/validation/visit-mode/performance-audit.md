# Auditoria de performance do Modo Visita

A auditoria atual inclui a orientação adicional de 22/09/2026: os perfis técnicos devem preservar integralmente o conteúdo, materiais, efeitos e funções do parque. A validação de navegador dessa revisão está pendente. Os números de navegador e bundle abaixo são históricos, anteriores à refatoração de paridade e prewarm; não certificam o estado atual.

As comparações históricas usam a baseline `8d48bb48378dfae73aae2a98dc9e1fdf367e96ce`, após as integrações #160/#161, e candidatos em builds QA de produção equivalentes. A inspeção original começou em `2c6d7917e4afedfadd54c18ecddcb52afa9bc178`; capturas exploratórias em Vite/HMR foram descartadas como comparação por preset porque um import de fonte criou uma segunda store.

## Arquitetura e orçamento

O mapa mantém Three.js 0.170, React Three Fiber 8, Drei 9 e Zustand 5, um Canvas em `frameloop="demand"`, o mesmo CameraRig/OrbitControls, dados comerciais, cenário, materiais e iluminação. A visita publica a pose para o proprietário existente da câmera; não cria outro mapa ou outro renderer. Colisores simplificados e índice espacial evitam física geral e raycasts contra a cena inteira. Movimento/câmera usam objetos mutáveis por frame; a seleção de POI roda a 10 Hz e só publica alterações relevantes.

`CommercialMapAdaptiveQuality` continua sendo o único proprietário do DPR. `VisitQualityManager` salva/restaura o orçamento anterior e associa HIGH/BALANCED/PERFORMANCE aos níveis existentes HIGH/MEDIUM/LOW, com limites de DPR 1,35/1,10/0,85. A visita começa em BALANCED, respeitando a capacidade inicial do hardware. O movimento aplica uma escala limitada uma vez na borda do gesto; uma nova decisão adaptativa fica pendente até repouso antes de realocar o alvo de sombras. O teste verifica 1,10 → 0,99 durante caminhada, sem writes repetidos, aplicação de LOW/0,85 após 650 ms em repouso e restauração do orçamento tradicional ao sair. O benchmark deve avaliar o custo dessa política durante caminhada prolongada.

`CommercialMapEnvironment` mantém o mesmo compositor ativo também durante movimento, voo e estabilização. O caminho direto permanece disponível para preparação indisponível, interiores e recuperação de erro; não é uma redução de efeitos por hardware ou caminhada. As sombras do parque continuam com `shadowMap.autoUpdate=false`, sem recalcular todas as sombras a cada passo.

`VisitFrameScheduler` encerra as invalidações próprias após dois segundos sem input, velocidade residual ou mudança de câmera. Teclado, touch, olhar, foco, câmera, dados e resize despertam o controlador. Movimento, probes e POIs suspendem em repouso/background, enquanto os sistemas ambientais preservam seus próprios pedidos de render. Os listeners são removidos e estilos de touch/tabindex restaurados ao sair.

O pipeline existente fornece árvores com InstancedMesh, recursos compartilhados, culling e LOD com histerese; terreno com texturas procedurais compartilhadas de 256 px, mipmaps e anisotropia limitada; fila de preparação de shaders e carregamento de camadas/interiores. O LOD de grandes conjuntos vegetais baseado no centro do parque continua uma possível fonte de custo ao nível do chão, sem ganho isolado medido que justifique alterá-lo.

## Conteúdo canônico e perfis técnicos atuais

A auditoria identificou dois caminhos antes parcialmente independentes: `renderQualityTier`, consumido por ambiente/chuva, e `reducedGraphics`, consumido pela arquitetura e por leitores diretos do store. Os ramos reduzidos retiravam árvores regionais e secundárias, detalhes arquitetônicos, condutores, células de solo e partículas. Conectar o tier a esses ramos teria removido conteúdo em equipamentos limitados.

`utils/executionPolicy.ts` separa agora conteúdo imutável e orçamento técnico. O boundary `Scene`, os leitores de `StrategicLandmarks` e os planejadores compartilhados de árvores/acessos/solo/rede elétrica normalizam os parâmetros legados. Todos os perfis mantêm IDs, posição, escala, silhueta, materiais e ações. O plano de solo completo é igual dentro e fora da visita; o incremento histórico de triângulos de solo entre modo reduzido tradicional e visita não se aplica à nova política.

As árvores comerciais mantêm os mesmos lóbulos, contato e sombras; as regionais mantêm 840 instâncias em três lotes. A distância ainda pode selecionar LOD, com os mesmos critérios entre tiers. Chuva preserva gotas, respingos, escoamento e poças; o lançamento lunar preserva partículas e iluminação. Bloom, SMAA, nitidez e ordem dos efeitos permanecem iguais. PMREM fica em 128; luz solar, materiais e compositor não são recriados por tier.

| Perfil | Resolução de sombra | Consulta de LOD | Atualização de superfícies molhadas |
| --- | ---: | ---: | ---: |
| LOW | 1024 | 10 Hz | 20 Hz |
| MEDIUM | 1536 | 15 Hz | 30 Hz |
| HIGH | 2048 | 20 Hz | 45 Hz |
| ULTRA | 4096 | 30 Hz | 60 Hz |

O DPR de apresentação tem piso de 0,85, ou o DPR nativo quando menor. O orçamento de pixels torna-se flexível nesse piso para preservar legibilidade. Sombras mudam somente de resolução em repouso; os demais ganhos continuam vindo de instancing, consultas espaciais limitadas, caches, culling, demanda de frames, pausa em background e preparação progressiva. Preservar todo o conteúdo pode elevar o custo em relação ao antigo LOW; testes unitários não demonstram equivalência perceptual nem FPS aceitável. Detalhes em `docs/commercial-map-adaptive-parity.md`.

## Instrumentação

`VisitPerformanceManager` amostra antes do reset das estatísticas do renderer. `VisitTelemetry` limita a janela a 3.600 intervalos e 120 eventos; percentis/publicação DOM são calculados a 1 Hz, somente em DEV ou builds com diagnostics. `window.__commercialMapVisitDiagnostics` e o dataset do Canvas expõem FPS médio, p95/p99, stalls, frames apresentados, tempo até controle, draw calls, triângulos, geometrias, texturas, programas, heap disponível e saúde do renderer.

A primeira amostra após repouso/pausa é excluída. Em atividade, o tempo de frames sem apresentação acumula no próximo intervalo apresentado, sem convertê-los em FPS fictício; `unpresentedActiveFrames` e `longestPresentationGapMs` revelam congelamentos. Ao encerrar, a captura final não retém closures do renderer. Telemetria limitada não substitui uma sessão prolongada e inspeção de recursos após aquecimento.

Em builds de diagnóstico, `?qualityQa=HIGH|MEDIUM|LOW|ULTRA` fixa o perfil antes do primeiro mount. O evento do canvas `commercial-map-quality-test`, com `detail: { tier }`, alterna o perfil; `tier: null` restaura o snapshot. Produção ignora o parâmetro. `data-commercial-map-inventory` registra IDs canônicos/apresentados; `data-commercial-map-execution` publica a no máximo 1 Hz tier lógico/aplicado, DPR, resolução de sombra, política, última janela de frame time e contagens. Testes cobrem 20 alternâncias, resize e remoção do listener.

## Histórico: comparação do modo tradicional, antes da paridade

Fixture canônica local; Chrome Headless 153 no Windows, GPU real Intel UHD via ANGLE/D3D11; viewport 1440×900, Canvas 1425×772, DPR 1, qualidade HIGH. Cada janela força aproximadamente dez segundos de frames apresentados no mesmo enquadramento, após aquecimento. FPS é `1000 / média(deltaMs)` de todos os intervalos registrados; percentis usam a distribuição desses intervalos. Isso mede o renderer local, não tráfego ou carregamento de produção.

| Preset | FPS baseline | FPS candidato | p95 baseline / candidato (ms) | Draw calls, ambos |
| --- | ---: | ---: | ---: | ---: |
| Geral | 33,09 | 32,94 | 32,6 / 31,8 | 811 |
| Close-up | 33,43 | 28,94 | 31,2 / 52,6 | 813 |
| Oblíqua | 34,66 | 33,04 | 37,0 / 42,1 | 810 |
| Superior | 32,38 | 32,65 | 32,2 / 31,1 | 797 |

Fontes: `evidence/baseline-traditional.json` e `evidence/candidate-traditional.json`. Posição, orientação, projeção e draw calls conferem por preset. Os quatro pares mantêm 223 programas e 130 texturas. No primeiro Close-up, o candidato teve 16 intervalos acima de 50 ms e máximo de 173,4 ms; a baseline não teve intervalos acima de 50 ms. A diferença exigiu repetição, mesmo sem aumento de draw calls.

| Repetição Close-up | FPS baseline | FPS candidato | p95 baseline / candidato (ms) | Máximo baseline / candidato (ms) |
| --- | ---: | ---: | ---: | ---: |
| 1 | 33,32 | 33,10 | 30,6 / 31,4 | 32,1 / 35,9 |
| 2 | 32,94 | 31,99 | 31,9 / 33,0 | 41,8 / 61,8 |
| 3 | 33,31 | 33,03 | 30,9 / 31,6 | 48,9 / 49,5 |

Fontes: `evidence/baseline-close-repeat-traditional.json` e `evidence/candidate-close-repeat-traditional.json`, três janelas por build. A faixa repetida foi 32,94–33,32 FPS na baseline e 31,99–33,10 no candidato, mantendo 813 draw calls, 672.543 triângulos, 559 geometrias, 130 texturas e 223 programas. Um intervalo do candidato atingiu 61,8 ms. A queda inicial para 28,94 FPS não se repetiu nessas janelas; isso não demonstra causalidade, ausência de regressão ou cumprimento de 60 FPS. A cena tradicional já ficou perto de 33 FPS nesta GPU, e ainda houve diferenças de frame time entre execuções.

## Histórico: shader stall e smoke de visita

O primeiro smoke de desenvolvimento detectou um congelamento de 12.894,8 ms durante a troca para terceira pessoa e MEDIUM → LOW, com 221 → 290 programas. Esse resultado foi rejeitado. No Three r170, a dimensão do PMREM participa da chave/defines dos shaders PBR: trocar a reflexão de 128 para 64 durante a caminhada pode invalidar programas de todo o cenário. A correção inicial preservou a dimensão preparada durante a visita; a política atual mantém 128 em todos os perfis também fora dela. O personagem utiliza a fila existente de warm-up antes da liberação dos controles.

O smoke diagnóstico corrigido, entrando pelo portão e olhando para dentro do parque, está em `evidence/smoke.json`. Esta captura antecede o ajuste final de grounding/solo canônico do commit `046e538f`; não representa a validação final desse commit:

| Captura | FPS médio | p95 / p99 (ms) | Maior intervalo (ms) | Draw calls | Programas |
| --- | ---: | ---: | ---: | ---: | ---: |
| Primeira pessoa, janela inicial | 45,65 | 31,5 / 43,1 | 57,8 | 743 | 224 |
| Acumulada após corrida e troca para terceira pessoa | 44,15 | 31,0 / 48,2 | 109,0 | 680 | 224 |

A segunda captura é acumulada, não um benchmark isolado de terceira pessoa. Foram 986 intervalos ativos, nove acima de 50 ms, BALANCED/MEDIUM com DPR 1 e controle liberado em 4.618 ms. O stall de 12,9 segundos não reapareceu nessa execução; não há isolamento experimental suficiente para atribuir todo o resultado a uma única correção. O renderer reportou zero perdas de contexto/erros, um único Canvas/renderer/OrbitControls e restauração exata da câmera anterior. A captura anterior olhando para fora do parque não é usada como estimativa representativa.

Este smoke valida apenas seu percurso curto; não certifica todas as regiões, sessão prolongada, 20 ciclos ou desempenho físico mobile. Esses critérios e os resultados de rota/mobile pertencem ao relatório geral da implementação.

## Auditoria atual de shaders e limite da meta de startup

O baseline de startup anterior ao prewarm, no build `046e538f`, registrou aproximadamente 13,04 / 13,16 / 13,49 s em três rodadas, incluindo cerca de 0,45–0,56 s anteriores ao antigo marco de rota. A cena levou 3,62–3,83 s e o span `compile-direct` 5,57–5,59 s, enquanto a chamada JavaScript de compile levou 0,278–0,292 s. A primeira apresentação ocorreu cerca de 1,8 s depois do fim desse span. Fonte histórica: `evidence/startup-before-prewarm.json`. O intervalo assíncrono inclui espera do driver/link e polling/agendamento; não equivale a uma medição isolada de tempo GPU.

A revisão atual deduplica representantes de materiais/geometria sem descartar variantes reais e prepara reflexão de programas e texturas de forma limitada no renderer autorizado, depois do linking. O prewarm do portal pode antecipar código, dados e recursos, sem criar Canvas ou contexto GL especulativo. Portanto o primeiro renderer ainda precisa realizar trabalho de driver; os números históricos não sustentam uma meta cumprida de 3 s. O perfil posterior localizou a mudança adaptativa de DPR durante a preparação e variantes de shader instaladas tarde; evidência e correções estão em [startup-and-quality.md](startup-and-quality.md).

A auditoria de `customProgramCacheKey`/`onBeforeCompile` não encontrou multiplicação ampla por IDs de lotes/entidades ou valores de uniforms. Three compartilha programas de materiais PBR com cores, roughness e metalness diferentes quando seus recursos de shader coincidem; reduzir o número de objetos `MeshStandardMaterial` não implica reduzir programas GPU. Instancing, atributos, mapas, lados, iluminação, tone mapping e PMREM podem exigir variantes legítimas.

Foram identificadas duas oportunidades localizadas, **não implementadas e sem ganho medido**:

- `utils/lateralResidentialAssets.ts:112–121`: `district-surface-hipRoof-v1` e `district-surface-gableRoof-v1` têm chaves distintas, mas injetam o mesmo GLSL (`grid` 24,18; `mix` 0,80/1,0), defines e opções PBR. Compartilhar apenas essa chave pode eliminar uma variante por combinação efetiva de renderer/geometria. Solar usa 8,12 e 1,3/0,85, portanto deve permanecer separado.
- `components/canvas/interiorGroundMaterial.ts:40–115`: o bloco com `interiorSegmentDistance`/`interiorOwned` e seis polígonos é incluído em todos os scopes, mas apenas `internal-base` o chama. `all` usa máscara constante e `access-grass` usa atributo. Injetar o bloco somente onde utilizado preservaria os cálculos executados; pode reduzir texto/análise GLSL, sem garantir menos programas ou ganho relevante, pois o driver pode eliminar código morto.

As chaves de terreno/superfície combinam versão fixa e hook anterior, deixando variação em uniforms. Foliagem `detail/grass`, terreno exterior `instanced`, contato da sede `wall/sampled` e escopos de solo alteram efetivamente o GLSL; não devem ser unificados às cegas. Qualquer otimização adicional requer teste do shader gerado e comparação visual, mantendo warm-up e todos os materiais/efeitos.

## Histórico: bundle anterior ao prewarm e à paridade

`evidence/visit-bundle-boundary.json` registra os manifests históricos de QA/produção normal de 22/09/2026 às 02:23:45 / 02:24:39 UTC, após o commit de runtime `046e538f`, incluindo o grounding canônico. Nesse build, VisitMode e VisitHUD são entradas dinâmicas; VisitInputManager é compartilhado apenas entre elas. Os três ficam fora da cadeia estática da rota e somam aproximadamente 17,41 + 3,17 + 1,26 kB gzip pelos logs de build, excluindo dependências compartilhadas. A integração principal contém pontes pequenas de estado/qualidade/câmera, CSS e controles compactos de saída para loading/erro. Nenhuma dependência foi adicionada. Estes tamanhos precisam ser atualizados após o build atual.

A cadeia estática normal contém 38 chunks, 2.935.015 bytes raw / 865.736 gzip. No par QA equivalente, a soma dos imports estáticos explícitos da rota passou de 2.934.814 para 2.942.582 bytes: +7.768 (+0,265%). Como a baseline não tem manifest, essa comparação QA é aproximada; o resultado candidato confere com seus 44 chunks. Three já estava nos imports estáticos da baseline. O build QA separa helpers de spawn/mundo utilizados pelos controles de teste; seus chunks não podem ser somados ao budget de produção normal. Bytes compilados não equivalem a transferência, cache ou tempo de carregamento real.

## Cobertura atual e limites

A cobertura inclui controladores de visita, colisões, câmeras, POIs, sessão, telemetria, prewarm, orçamento adaptativo e paridade. Foram verificados repouso/wake/background, 20 ciclos de listeners/orçamento, restauração de câmera, preservação de posição após atualização de dados, percentis/stalls sem apresentação e saída mesmo se o HUD não carregar. Os testes de paridade comparam inventários completos, posições, escalas, solo e condutores; mantêm clearances e verificam efeitos ativos durante movimento. Typecheck e lint dos arquivos alterados passaram. Os builds de 54,02 / 54,50 s pertencem à revisão histórica `046e538f`, não ao código atual.

A suite ampla atual registrou 2.411 testes, com 2.317 aprovados e 94 falhas. A baseline tem 2.258 testes, com 2.164 aprovados e exatamente as mesmas 94 falhas: zero falhas adicionais e 153 casos adicionados aprovados. As expectativas incompatíveis com a nova orientação passaram a exigir igualdade de inventário e efeitos preservados, sem retirar as verificações espaciais. A comparação não transforma as falhas preexistentes em uma suite totalmente verde.

Interiores reutilizam a inspeção canônica por ação explícita; não oferecem caminhada com física interna própria. Ao sair dessa inspeção durante a visita, restaura-se primeiro a pose exterior salva e depois executa-se a rota aérea certificada. Uma rota sem passagem segura interrompe o controlador e mantém uma saída de recuperação disponível.

Não foram medidos celulares físicos neste audit. Chromium com viewport/touch emulados verifica layout/eventos, não substitui iPhone/Safari, Android intermediário, multitouch e comportamento térmico. Os números medidos nesta Intel UHD não atingem 60 FPS; a ausência de congelamento prolongado no smoke não comprova estabilidade prolongada ou aprovação de todas as regiões.

## Resultado da validação e pendências

Os percursos regionais, 20 ciclos, cinco minutos de permanência, touch em quatro viewports, interior/noite/foco, perda de contexto e 20 trocas de qualidade desktop/mobile foram executados. Resultados e atribuição de builds estão em [runtime-findings.md](runtime-findings.md), [startup-and-quality.md](startup-and-quality.md) e `evidence/final/run-provenance.json`.

Persistem condições de não aprovação: entrada pré-aquecida de 11,26–12,01 s, tarefa de montagem de aproximadamente 4 s, uma espera de hidratação que excedeu 180 s antes de uma repetição concluir e uma janela MEDIUM de qualidade mobile com 26,23 FPS. Os percursos de visita ficaram em 42,17–56,99 FPS desktop e 37,40–50,30 FPS no Chromium touch emulado. A PR permanece em rascunho; não declara cumpridos 3 s de entrada, 60 FPS desktop, desempenho físico mobile ou certificação integral de produção.
