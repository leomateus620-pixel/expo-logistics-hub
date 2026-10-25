# Integração e validação — ciclo da soja e correções da ExpoRural

Registro técnico da implementação de 25/10/2026. Este documento descreve o código e as verificações direcionadas executadas. A consolidação final de build, suíte completa, capturas, vídeo e medições comparativas pertence ao relatório principal desta pasta; não há números de desempenho inferidos dos testes unitários.

## Base espacial e dados preservados

A base Git investigada foi `d1490efe58f130d107faaec1affc6e008182bcd1`. A implantação usa a revisão cadastral **`2028-exporural-2026-10-20.1`**, presente em `scripts/exporural/official-2026-10-20/replay-data.json`. O metadado histórico `source_revision: 2026.4` não substitui essa revisão vigente. A referência `OFFICIAL_REFERENCE_DATA` contém polígonos antigos da ExpoRural e não foi tratada como a geometria atual dos lotes.

A leitura pelo conector Lovable no projeto FENASOJA `756eeb64-0d44-4171-b445-f8a60f0492c0` foi somente de conferência. O [registro persistido consultado](persisted-placement-reference.json) conserva IDs, número, área, geometria e alturas de apoio; não contém compradores, vendas ou preços. Q-R-01 e Q-R-34 coincidiram com o replay de outubro. A área de Q-R-01 continua **896,85 m²** e a de Q-R-34 continua **447,55 m²**.

As revisões novas são de apresentação: `2026-10-25-exporural-scene.1` e `2026-10-25-soy-presentation.1`. Não há migração, banco paralelo, reparcelamento, gravação de preços ou alteração de vendas, contratos, permissões e estados comerciais. Os polígonos cadastrais, o inventário elétrico de origem e seus IDs são preservados; um adaptador local resolve a apresentação dos terminais afetados.

As coordenadas estão no referencial local x/z existente. As dimensões de copa, equipamento e lavoura são aproximações de modelagem registradas sobre as superfícies da cena, sem alegação de precisão topográfica. Consulte [implantação permanente](permanent-placement.md), [planta dos apoios e árvore](implantacao-permanente.svg), [implantação agrícola e fontes](soy-layout-and-assets.md) e [planta da lavoura e acesso](soy-layout-topview.svg).

## Separação de responsabilidades

| Módulo | Responsabilidade e fronteira |
| --- | --- |
| `data/exporuralSceneCorrections.ts` | Identidade, origem, confiança, pontos e envelope da árvore e do conjunto elétrico. |
| `data/electricalPresentation.ts` e resolvedor elétrico | Substituição local dos elementos renderizados, ajuste de terminais e preservação do grafo fora do trecho. |
| `data/soyHarvestLayout.ts` | Polígono plantável, cabeceiras, apoio, escala, faixa de saída e composição final; nenhum lote novo. |
| `SoyFieldStaticLayer.tsx` | Lavoura verde inicial, fileiras instanciadas, órgãos da planta, LOD e piso. Não importa modelos de máquinas. |
| `SoyHarvestLayer.tsx` | Fronteira de importação dinâmica e erro local. Monta o runtime somente após início explícito ou enquanto mantém a composição final daquela sessão. |
| `soyHarvestTimeline.ts` | Funções puras de fases, relógio, caminhos, poses, elipses e progresso por faixa. |
| `useSoyHarvestStore.ts` | Comandos e estados discretos. Relógio e dados compactos das máscaras ficam fora do estado React por frame. |
| `SoyHarvestExperience.tsx` e `SoyHarvestScene.tsx` | Preparação local, amostragem do relógio, máquinas, articulações, aplicação e descarga. |
| `SoyHarvestCamera.ts` e `useSoyHarvestCameraLease.ts` | Protocolo numérico de poses, captura/restauração e posse temporária aplicada pelo CameraRig existente. |
| `useSoyHarvestLifecycle.ts` | Contexto de interface, disponibilidade, mudanças de escopo/modo e limpeza na saída da rota. |
| `SoyHarvestButton.tsx` e `SoyHarvestOverlay.tsx` | Comando acessível, motivo de indisponibilidade, etapa, progresso, pausa, saída, repetição e informação complementar. |

Os modelos procedurais, partículas e preparação de shaders estão atrás de `import('./SoyHarvestExperience')`. Não há prefetch do runtime, participação na prontidão obrigatória da cena nem aquecimento global desses modelos. O único cache de código é a promessa de importação; uma falha de importação permite nova tentativa. As máquinas não usam cache global de geometrias.

A experiência usa o Canvas e o renderer existentes, com `frameloop="demand"`. A lavoura estática atualiza uniforms e LOD quando a cena já renderiza, sem solicitar um loop contínuo. O runtime invalida enquanto reproduz; pausa e conclusão interrompem suas invalidações contínuas. O retorno da câmera pode invalidar durante seus 650 ms. Nenhuma mudança foi feita na política global de DPR, inclusive durante navegação e damping.

## Estados, tempo e retorno

O estado inicial é `idle`, com soja verde adulta. `requestStart` é idempotente enquanto está carregando, reproduzindo, pausado ou retornando. O estado `loading` começa no clique; os **48 segundos** só passam a contar depois da preparação local. O identificador de sessão impede uma conclusão antiga de carregamento de iniciar outra sessão.

| Tempo de reprodução | Fase |
| --- | --- |
| 0–6 s | Plantio |
| 6–16 s | Nascimento e crescimento |
| 16–21 s | Manejo da lavoura |
| 21–27 s | Maturação |
| 27–37 s | Colheita |
| 37–44 s | Descarga |
| 44–48 s | Transporte e encerramento |

O relógio usa deltas monotônicos de `performance.now()`. Pausar limpa a referência de tempo anterior; continuar estabelece uma referência nova. Ocultar a aba pausa e não retoma automaticamente. Os percursos e máscaras são amostrados do mesmo tempo; as elipses agrícolas e suas dissoluções estão descritas na [nota dos modelos](soy-layout-and-assets.md). O avanço de cada faixa acompanha o ponto de trabalho do implemento, sem sumir com toda a lavoura no começo da colheita.

Na descarga, a saída é obtida pela transformação mundial do tubo articulado. O volume da caçamba, sua altura de grãos e o fluxo obedecem ao mesmo intervalo; o fluxo termina antes de recolher o tubo e liberar o caminhão. Partículas usam pool fixo de 160 instâncias. Pausar conserva a amostra visual sem avançar a emissão.

`cancel`/Esc devolvem o campo verde e entram em `restoring`; `completed` conserva o campo colhido e a colheitadeira parada. “Voltar ao mapa” restaura a câmera mantendo essa composição; “Restaurar lavoura” a desmonta; “Rever ciclo” revalida a disponibilidade e inicia uma única sessão. Não existe persistência de reprodução em banco, `localStorage` ou `sessionStorage`. Recarregar a página começa verde.

## Posse da câmera e proteção da navegação

O CameraRig continua sendo o único componente que aplica a câmera. A cena agrícola publica números; não monta outro OrbitControls. O lease registra uma captura anterior ao início: `requestStart` a invoca depois de validar a disponibilidade, **antes de publicar qualquer mudança no store**. Isso impede que um subscriber anterior reconcilie outra raiz React, esconda o dock e desabilite os controles antes do snapshot. A captura guarda posição, quaternion, vetor superior, alvo, FOV, near/far, zoom, view offset e limites/flags dos controles. O descarte do damping pendente preserva a pose visível; a remoção do callback confere a identidade do registrante para não limpar um host posterior.

A posse inclui `enabled`, `restoring` e o snapshot ainda capturado. Isso fecha o intervalo entre uma falha síncrona do store e a restauração no layout effect. Visita e foguete não podem iniciar nesse intervalo. O botão, a repetição e a nova tentativa também revalidam visita, foguete, interior, estacionamento, rede hidrológica, apresentação de vendas, modo 3D e escopo.

As rotinas comuns do CameraRig respeitam essa posse: início/cancelamento de transições, ajuste de limites por viewport, redimensionamento do view offset, cancelamento de gestos por blur/aba oculta/pointercancel e handlers de OrbitControls. Cliques em entidades, hover e `onPointerMissed` não alteram a seleção durante o ciclo ou retorno. O painel anterior é restaurado pelo lifecycle; os componentes comerciais preservam seu estado montado.

O retorno normal dura 650 ms; redução de movimento e erro restauram imediatamente. A câmera restaura o snapshot e remove movimento residual antes de liberar a posse. Um intervalo de 300 ms evita uma nova animação automática de seleção logo após a devolução. O teste de redimensionamento conserva o aspect atual e restaura explicitamente o view offset e os limites capturados. O enquadramento cinematográfico possui uma composição mais aberta para portrait; isso não altera DPR.

A reabertura do dock pode publicar um resize depois da devolução. Um trace no navegador confirmou que o snapshot já estava restaurado, mas a debounce criava uma nova transição `panel-layout` e voltava a desligar os controles. O agendamento, a execução do timer e o evento do painel agora descartam esse refit durante a posse e pelos 650 ms da janela de estabilização já usada pela navegação. Não há atribuição incondicional de `enabled=true`: os valores restaurados continuam vindo do snapshot.

Com redução de movimento, a câmera utiliza um plano estável e a interface oferece navegação por etapas. Mudanças de segmento, escopo, filtro, visibilidade de camadas, modo de trabalho, interior ou apresentação cancelam a execução ativa. Cobrir a apresentação com a Dashboard pausa; sair da rota desmonta e limpa a sessão.

## Falhas e propriedade dos recursos

`prepareSoyHarvestResources` compila somente o grupo agrícola com as luzes da cena. A espera de shaders usa um timer local cancelável, limite de 15 segundos e diagnóstico temporário de erros; restaura os callbacks do renderer em `finally`. Desmontar cancela o timer antes de liberar os materiais. Nenhuma preparação abandonada pode chamar `ready` na sessão seguinte.

As fronteiras React locais isolam falhas de importação/construção. A lavoura estática fica fora da fronteira dos modelos. Durante a execução, `registerSoyHarvestContextLoss` encerra o ciclo em `error`, limpa o relógio e restaura o campo. O evento WebGL continua disponível para a recuperação global existente do mapa; a funcionalidade não cria outro contexto nem tenta recuperar o renderer por conta própria. A restauração gráfica não reinicia automaticamente o ciclo. O listener é removido ao desmontar.

| Recurso | Proprietário e liberação |
| --- | --- |
| Folhagem/tronco da árvore | Caminho compartilhado existente; a nova árvore acrescenta um registro e uma variação local. |
| Transformador especial | Componente possui suas geometrias mescladas; materiais pertencem à camada elétrica e não são descartados pelo componente. |
| Lavoura estática | Camada possui geometrias de folhas/caules/vagens, variante distante, piso, materiais e buffers instanciados; descarte explícito ao desmontar. |
| Frota | Cada construção possui geometrias, materiais e textura da inscrição; `fleet.dispose()` libera os recursos daquela frota. |
| Dissolução das elipses | Runtime possui variantes locais dos materiais e restaura/descarta essas variantes antes de liberar a frota. |
| Grãos, fluxo, névoa e sementes | Runtime possui pools e geometrias/materiais dos efeitos; sementes compartilham recursos de grãos dentro do mesmo proprietário. |
| Composição final | Pode manter a frota estática enquanto estiver visível; restaurar lavoura ou sair da rota desmonta os objetos. |

Os testes verificam construção/descarte repetidos e igualdade de contagens entre frotas. Isso não é uma medição de memória GPU no navegador; cache intencional de módulos e estabilização real de recursos são avaliados separadamente no relatório de desempenho.

## Escopo e autorização

A disponibilidade exige WebGL, contexto de parque/ExpoRural, segmento compatível e Q-R-01 nos dados carregados e autorizados. A camada exige as mesmas âncoras e é omitida nos modos hidrológico e de apresentação de vendas. O recorte isolado acrescenta somente o apoio visual exterior necessário e o trecho do asfalto; não libera inventário comercial de outros segmentos.

O runtime não é montado na consulta pública com `publicScenePolicy`, nas plantas 2D da Dashboard ou em cartões/miniaturas. As correções permanentes usam os seletores de apresentação existentes. A alteração não amplia RLS nem permissões de venda. Não há chamadas de consulta ou mutação comercial, polling de banco ou serviço externo para reproduzir o ciclo.

## Verificações executadas

As rodadas abaixo foram executadas durante a integração. São registros por rodada, com sobreposição de arquivos; não devem ser somados como um total de testes distintos. Alguns arquivos receberam testes adicionais depois dessas rodadas. O resultado consolidado da suíte final deve ser consultado no relatório principal.

O ambiente usou o Node fornecido pelo Codex em `/Users/leonardo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin`, acrescentado ao `PATH`. Os comandos diretos abaixo executam o mesmo Vitest e TypeScript dos scripts `npm test` e `npm run typecheck` do projeto.

**Correções permanentes e primeira rodada da câmera: 8 arquivos, 55 testes aprovados.**

```sh
node node_modules/vitest/vitest.mjs run \
  src/test/exporuralSceneCorrections.test.ts \
  src/test/commercialMapTrees.test.ts \
  src/test/commercialMapTreePresentation.test.ts \
  src/test/commercialMapTreeSurfaceResolver.test.ts \
  src/test/commercialMapTreeControls.test.tsx \
  src/test/commercialMapInternalVegetationScope.test.ts \
  src/test/commercialMapPavilion12FrontTrees.test.ts \
  src/test/commercialMapSoyHarvestCameraLease.test.tsx
```

**Runtime, recursos, implantação e interação: 7 arquivos, 44 testes aprovados naquela rodada.**

```sh
node node_modules/vitest/vitest.mjs run \
  src/test/commercialMapSoyHarvestRuntime.test.ts \
  src/test/commercialMapSoyHarvestOverlay.test.tsx \
  src/test/commercialMapSoyHarvestPreparation.test.ts \
  src/test/soyHarvestLayout.test.ts \
  src/test/commercialMapSoyHarvestMachinery.test.ts \
  src/test/soyHarvestModels.test.ts \
  src/test/commercialMapInteraction.test.ts
```

**Câmera e interrupção após os ajustes de arbitragem: 5 arquivos, 49 testes aprovados.** Inclui seis testes de lease, 14 de transição existente, dois de perda de contexto, dez do runtime e 17 de interação.

```sh
node node_modules/vitest/vitest.mjs run \
  src/test/commercialMapSoyHarvestCameraLease.test.tsx \
  src/test/commercialMapCameraTransition.test.ts \
  src/test/commercialMapSoyHarvestContextLoss.test.ts \
  src/test/commercialMapSoyHarvestRuntime.test.ts \
  src/test/commercialMapInteraction.test.ts
```

```sh
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.app.json
git diff --check
```

Ambos os últimos comandos terminaram com código zero após os ajustes de câmera e contexto. Os avisos de Browserslist desatualizado e múltiplas instâncias de Three.js apareceram em algumas rodadas e não impediram sua aprovação. Não foi necessário atualizar dependências para silenciá-los.

As verificações novas cobrem identidade e apoio da árvore, envelope do conjunto no lote vigente, preservação do poste de Q-R-38, ausência de terminais órfãos, exclusões espaciais, caminhos, duração/fases, máscaras por passagem, descarga dentro da caçamba, pausas, repetição, erro, descarte e restauração de câmera. O teste de snapshot inclui 20 repetições e desmontagem ativa. O teste de contexto confirma que um listener removido não pode interferir em sessão posterior.

Após a validação real identificar `enabled`/`enableDamping` ainda desativados no retorno, foi acrescentado um teste com um subscriber anterior que modifica esses flags. O teste reproduziu a falha antes da correção e passou com a captura anterior à notificação. A rodada seguinte de câmera, runtime, contexto, overlay e transição aprovou **39 testes em cinco arquivos**, já com sete casos no lease e 13 no runtime:

```sh
node node_modules/vitest/vitest.mjs run \
  src/test/commercialMapSoyHarvestCameraLease.test.tsx \
  src/test/commercialMapSoyHarvestRuntime.test.ts \
  src/test/commercialMapSoyHarvestContextLoss.test.ts \
  src/test/commercialMapSoyHarvestOverlay.test.tsx \
  src/test/commercialMapCameraTransition.test.ts
```

Após corrigir o timer de refit do dock, `commercialMapSoyHarvestCameraLease` e `commercialMapCameraTransition` aprovaram **21 testes em dois arquivos**. A regressão real foi exercitada por `scripts/exporural/soy-validation.cjs`: o comando terminou com código zero, com os detalhes por cenário em `visual-validation.json` da evidência de execução. O relatório principal conserva os resultados e capturas; essa verificação não é apresentada como medição de desempenho.

## Falhas anteriores à implementação

O `npm test` da base preservada, antes destas mudanças, terminou com:

```text
Test Files  51 failed | 411 passed (462)
Tests       90 failed | 3937 passed (4027)
```

O log de diagnóstico local é `/tmp/exporural-baseline-tests.log`; o checkout de comparação foi mantido em `/tmp/exporural-soy-baseline`. Esses caminhos são artefatos temporários da execução, não dependências do código. Os totais acima são o baseline, não o resultado final da branch.

Falhas relevantes já presentes nesse log incluem:

| Arquivo | Evidência anterior |
| --- | --- |
| `commercialMapElectricalInfrastructure.test.ts` | Duas falhas: `transformer-ref-007` na projeção de fachada e 996 ocorrências na verificação geral de folga dos fios; 13 testes desse arquivo passaram na reprodução direcionada. |
| `commercialMapExporuralCartographicFidelity.test.ts` | Contrato antigo de 95 lotes/perímetro e sete ruas. |
| `commercialMapExporuralArchitecture.test.ts` | Preservação do inventário oficial e implantação do conjunto C4/E-06. |
| `commercialMapLoadingPipeline.test.ts` | Três falhas anteriores nos contratos de paginação/leitura de relações e valores abertos. |
| `commercialMapBootLoader.test.tsx` | Duas falhas anteriores nos contratos de prontidão e spans de carregamento. |
| `commercialMapRearParking.test.ts`, `commercialMapRearRoadNetwork.test.ts`, `commercialMapRearRoadTreeClearance.test.ts` | Falhas anteriores de integração/contratos de exclusão e folga do entorno posterior. |
| `commissionMapPortals.test.ts`, `commercialMapVisitWorld.test.ts` | Falhas anteriores de recorte do inventário e contrato de vegetação do mundo de visita. |

As falhas elétricas foram comparadas com a base e não tiveram expectativas alteradas para ocultá-las. A classificação das demais acima registra sua presença no baseline; não afirma que todas tenham a mesma causa ou que estejam corrigidas. A suíte completa final deve ser comparada por nome do teste, além dos totais, para distinguir dívida anterior de regressões.

## Limites deste registro

Os testes de hook usam câmera real do Three.js e controles simulados, sem montar todo o CameraRig/R3F. A conferência real de blur, pointercancel, rotação da viewport, seleção comercial e restauração no navegador complementa esses testes. Os testes geométricos validam o referencial disponível no projeto, sem transformar fotografias em cotas oficiais.

Este documento não declara resultados de abertura, FPS, memória, draw calls medidos, duração de vídeo capturado ou publicação em produção. O relatório principal reúne os números efetivamente medidos, as condições de execução, evidências visuais, eventuais limitações restantes e o link da PR. Uma PR publicada no GitHub também não equivale a implantação em produção.
