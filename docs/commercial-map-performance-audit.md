# Auditoria técnica de estabilidade do Mapa Comercial

## Contexto e escopo

- Base de comparação: `4711d4d9276c38a901db50c6b709a8e4441f43ab` (`origin/main` no início da intervenção).
- Implementação: branch `codex/commercial-map-interaction-stability`.
- A reprodução inicial usou a rota autenticada e dados reais: **1.725 entidades e 1.577 lotes**. Não foi usado um mapa fictício para estabelecer a causa.
- O escopo é o ciclo de vida e a interação do renderer compartilhado pelo mapa completo e pelos segmentos. Geometria oficial, IDs, regras comerciais, autenticação, consultas e persistência não são substituídos.
- A persistência descrita neste relatório vale enquanto o módulo do Mapa Comercial está montado. Sair efetivamente do módulo continua permitindo seu descarte normal.
- Este documento distingue defeito observado, causa sustentada por inspeção/experimento diferencial, risco estrutural e hipótese não demonstrada. As medições finais consolidadas abaixo são de **build DEV com mobile emulado em desktop**; não certificam dispositivos móveis físicos nem todos os critérios de aceitação.

**Causa primária comprovada:** `useCurrentOrg` tratava `isFetching` de uma consulta de vínculo organizacional já resolvida e com dados válidos como carregamento inicial. `OrgGuard` recebia `isLoading=true` e substituía todos os filhos por `OrgLoading`, desmontando a página e o Canvas. A seleção podia disparar esse caminho ao montar um novo consumidor do hook depois dos 60 segundos de `staleTime`. A causa central não é uma Promise de `Suspense` identificada, nem perda espontânea da GPU.

**Causas adicionais confirmadas:** havia disputa de propriedade de `scene.fog`/`scene.background` entre os attaches JSX do exterior e o cleanup dos interiores, recriação de controles nas trocas de cena e descarte incompleto dos passes pelo wrapper de pós-processamento. A correção preserva os mesmos efeitos e materiais; trata lifecycle, estado global do renderer e compilação das variantes reais. Os resets deixaram de ocorrer nas amostras finais, mas o stress ainda registrou tarefas acima de 100 ms, descritas sem ocultação neste relatório.

## Reprodução e medições anteriores à correção

Os tempos abaixo são amostras da sessão de diagnóstico, não médias estatísticas nem resultados de dispositivos físicos. Os eventos de remoção/adição do Canvas foram observados no DOM. As latências de estado e de reinserção têm como referência a interação; uma latência de estado não equivale, por si só, a feedback visual exibido.

| Cenário baseline | Estado de seleção | Canvas removido | Novo Canvas adicionado | `webglcontextlost` | Tarefas longas observadas | Maior intervalo de frame |
| --- | ---: | ---: | ---: | ---: | --- | ---: |
| Desktop, interface aquecida | 9,1 ms | 99 ms | 1.893 ms | 635 ms | 53 / 392 / 53 ms | 383,2 ms |
| Desktop, caminho frio | Não consolidado | 95 ms | Aproximadamente 1.700 ms | Não consolidado | 106 / 488 / 54 / 5.568 / 2.941 ms | Não consolidado |
| Mobile emulado, efetivo 480 × 844 | 147,7 ms | 147,5 ms | 3.907 ms | 679,5 ms | 96 / 412 / 2.292 / 288 / 176 ms | 2.583,2 ms |

Condições registradas do desktop: viewport da janela **2.560 × 1.440**, Canvas CSS **2.477 × 1.352**, `window.devicePixelRatio = 0,5` e DPR do renderer **1**. Essas condições são reportadas como medidas; não representam um desktop físico com DPR nativo 1.

O snapshot baseline registrou **472 geometrias, 121 texturas e 156 programas**. O valor de **138 draw calls** era do último passe do renderer. Ele **não deve ser comparado diretamente** com os novos contadores agregados, que abrangem todos os passes do frame, inclusive sombras e pós-processamento.

### Confirmação causal: refetch de vínculo desmontava o mapa

O encadeamento foi rastreado no código e reproduzido com um **refetch somente leitura** da consulta ativa `my-org-membership`:

1. `EntityDetailsPanel` monta `EntityVerificationDialog` mesmo com `open=false`.
2. `EntityVerificationDialog` chama `useMapMutations`, que chama `useCurrentOrg` e acrescenta um observer à consulta de vínculo.
3. Depois de `staleTime: 60000`, esse novo observer pode iniciar uma atualização em background. O cache ainda tem vínculo válido, `status: success` e `hasData: true`.
4. A expressão antiga de `useCurrentOrg` incluía `isFetching` em `isResolving`, devolvido publicamente como `isLoading`.
5. `OrgGuard` interpretava esse estado como indeterminação inicial e retornava `OrgLoading` em lugar dos filhos. O Canvas era desmontado, seus recursos eram descartados e depois reconstruídos.

| Evento na reprodução controlada | Relógio da captura | Desde o refetch |
| --- | ---: | ---: |
| Refetch da consulta ativa `my-org-membership` solicitado | 203.813,1 ms | 0 ms |
| Fetch iniciado, ainda `status: success` e `hasData: true` | 203.813,7 ms | 0,6 ms |
| Canvas desmontado | 203.816,5 ms | **3,4 ms** |
| Consulta concluída com sucesso | 204.468,0 ms | 654,9 ms |
| Novo Canvas montado | 207.060,5 ms | **3.247,4 ms** |

A referência DOM antiga e a nova eram diferentes, e o contador de montagens passou de **2 para 3**. Assim, uma leitura de revalidação sem troca de rota, sem revogação e com dados em cache bastou para produzir o reset. Esse teste isola o mecanismo que explica a intermitência após tempo de uso.

A correção central é distinguir **resolução inicial** de **atualização em background com vínculo conhecido** em `useCurrentOrg`. Isso não remove o guard nem seus critérios de acesso: hidratação de autenticação, ausência de dados iniciais, revogação confirmada e erro continuam protegidos. A consulta, seu `staleTime`, o refetch e a validação do servidor não são desativados para ocultar o problema.

### Outros experimentos e reclassificação da hipótese inicial

- Ao adicionar um `Suspense` local no painel, uma amostra preservou o Canvas, sem perda de contexto nem tarefa longa observada, com intervalo de aproximadamente **33 ms**. **Esse diferencial não prova que Suspense causava o reset:** o estado temporal do cache/`staleTime` era um fator de confusão. O resultado é mantido apenas como teste de isolamento/mitigação. `EntityDetailsPanel` e seus dialogs têm imports estáticos; não existe evidência de uma Promise específica emitida por eles.
- A base realmente tinha módulos lazy no Canvas e um fallback abrangendo toda a cena, além do `Suspense` de rota. Isolar/remover esses caminhos continua válido para carregamentos futuros, mas não substitui a correção comprovada em `useCurrentOrg`/`OrgGuard`.
- A entrada em interior, antes de unificar os controles, alterou a identidade de `OrbitControls` e apresentou tarefa longa de **373 ms**. O código também desmontava a composição exterior e cada interior mantinha seu próprio controlador. Esse é um problema adicional de lifecycle, separado do reset causado pelo refetch de vínculo.
- No retorno do interior, os attaches JSX de `color`/`fog` do exterior competiam com o cleanup do interior. A cena terminava com **`fog = null` e background ausente**, alterando as variantes de shaders: foram observados **pelo menos 27 programas novos e uma tarefa de 4.420 ms**. `CommercialMapSceneEnvironment` passa a adquirir essas propriedades em `useLayoutEffect`, depois das mutations de attach/detach do R3F, e só restaura propriedades ainda pertencentes à mesma instância. Na amostra final de retorno, fog e background estavam presentes.
- A inspeção do wrapper instalado de pós-processamento confirmou cleanup de `EffectPass` por `removePass` **sem `dispose`** quando seus filhos mudavam. Além disso, `NoToneMapping` permanecia no renderer quando o composer era desativado para o interior. O stack agora tem propriedade explícita de passes/efeitos/targets e restaura os estados globais do renderer; ordem, Bloom, tone mapping ACES e parâmetros visuais foram preservados.
- O warmup genérico no framebuffer padrão não compilava as mesmas variantes de highlight usadas no target HDR do composer. O warmup de seleção usa agora esse target real e restaura o target anterior. As **sete variantes observadas do interior** são preparadas com `compileAsync`, sem renderizar uma cópia do modelo; a primeira entrada medida criou **zero programas novos**.

## Matriz da auditoria

| Área investigada | Resultado e evidência | Correção ou conclusão |
| --- | --- | --- |
| Vínculo organizacional e guard | **Causa primária comprovada:** `useCurrentOrg` convertia `isFetching` com cache válido em `isLoading`; `OrgGuard` substituía os filhos. Refetch somente leitura reproduziu unmount em 3,4 ms e novo Canvas em 3.247,4 ms, apesar de a consulta permanecer com dados e terminar com sucesso. | Correção mínima no hook: separar resolução inicial de refetch com vínculo conhecido. Preservar fail-closed na hidratação/autenticação, ausência inicial, revogação confirmada e erro; não desativar a revalidação. |
| Canvas/renderer na seleção e painel | **Confirmado em execução:** remoção e reinserção do Canvas, perda de contexto e trabalho longo. A montagem do dialog de verificação, via `useMapMutations`/`useCurrentOrg`, pode criar o observer que dispara a revalidação após o `staleTime`. | Corrigir o sinal de carregamento consumido pelo guard é indispensável. Boundaries locais de painel isolam futuras suspensões/erros, mas não resolvem por si mesmos esse unmount do ancestral. |
| Keys e modos de workspace | **Confirmado no código:** os modos lista/criação/edição eram ramos alternativos ao Canvas. O painel tinha `key` dependente da seleção. Não havia key de seleção no Canvas atual da base. | Canvas permanece no mesmo ramo; os outros workspaces têm camada própria. Removida a key do painel completo. IDs estáveis de entidades e rótulos permanecem. |
| Rotas e query string | **Troca de rota descartada como requisito da reprodução:** o refetch reproduziu o reset sem navegação. A substituição ocorreu no `OrgGuard`, ancestral da página. A hipótese inicial de uma suspensão de detalhes propagada à rota não foi comprovada. | Preservados caminhos e critérios de acesso; corrigida a classificação de loading no hook consumido pelo guard. Estado e área atualizam a composição compartilhada, sem key de rota no Canvas. |
| Fallback cinza dentro do Canvas | **Risco estrutural confirmado no código, não causa primária da captura:** um boundary abrangia toda a `Scene` e mostrava `CanvasLoader`; módulos internos lazy podiam alcançar esse boundary. | Removido o fallback global da cena. Módulos críticos são importados antes da interação; assets opcionais mantêm boundaries locais. O único skeleton novo está dentro do painel. |
| Falha de sincronização após dados válidos | **Risco estrutural confirmado:** `mapQuery.isError` substituía toda a página mesmo com o último conjunto de dados disponível. | Dados válidos permanecem renderizados com aviso local de atualização. Sem dados iniciais, os estados legítimos de carregamento/erro continuam existindo; não há bypass de autenticação nem base paralela. |
| Descarte de instancing lunar | **Confirmado em execução:** `plume.current?.dispose is not a function` durante teardown. O nó tinha `dispose={null}` aplicado pelo R3F. | Descarte via `disposeInstancedMesh`, que chama a implementação de `THREE.InstancedMesh.prototype`, sem depender do método sobrescrito na instância. Teste reproduz `dispose = null`. |
| Cena exterior e interiores | **Confirmado:** troca de controlador e reconstrução da composição exterior ao entrar/sair dos interiores; posicionamentos iniciais imperativos em cada interior. | Exterior permanece montado e é ocultado somente durante a inspeção interior. Os quatro interiores descrevem uma pose; o único `CameraRig` persistente executa a transição. |
| Competição de câmera/controles | **Confirmado no código:** interpolação exponencial de posição/target coexistia com damping de `OrbitControls`; FOV e clipping eram aplicados imediatamente; interiores mantinham animações próprias. | Controlador cancelável com pose de origem/destino, quaternion, lente, duração limitada e fonte da solicitação. A navegação manual cancela a transição na captura de `pointerdown`/wheel antes de devolver o gesto aos controles. |
| DPR, resize e configuração inicial | **Risco estrutural confirmado; oscilação contínua de DPR não atribuída como causa primária observada:** observer customizado mais listeners de janela/visual viewport recalculavam DPR e configuração inicial. O R3F já observa dimensões. | DPR e configuração inicial de câmera/renderer fixados por sessão. Removido o observer duplicado; mudanças reais de tamanho permanecem sob o mecanismo do R3F. Não há redução de resolução ao iniciar um gesto. |
| Background/fog na troca de cena | **Causa adicional confirmada:** attaches JSX do exterior disputavam propriedades globais com o cleanup do interior; retorno deixava `fog=null` e background ausente, com pelo menos 27 programas novos e tarefa de 4.420 ms. | `CommercialMapSceneEnvironment` assume background/fog/environment em layout effect após mutations R3F. Cleanup verifica identidade de propriedade antes de restaurar. Retorno final confirmou fog/background presentes. |
| Pós-processamento/render targets | **Defeitos de propriedade confirmados:** o wrapper instalado removia `EffectPass` sem descartá-lo ao trocar filhos; `NoToneMapping` permanecia ativo com composer desabilitado. Não foi demonstrada recriação a cada render React. | Stack fixo com propriedade explícita de composer, passes, efeitos e targets; descarte único e idempotente. Desativar para o interior preserva recursos e restaura tone mapping/autoClear. Mantidos os mesmos passes, ordem, parâmetros e qualidade. |
| Shaders, texturas e GLTF | **Recompilação confirmada** pelo reset e pela mudança indevida de fog/background; warmup de seleção no framebuffer padrão não cobria a saída HDR. Recarga universal de assets por clique não demonstrada; a base já tinha caches. | Renderer, materiais e caches preservados. Highlight pré-compilado no target HDR real do composer; sete variantes de interior com `compileAsync`, mantendo materiais durante o lifecycle do Canvas. Primeira entrada final: zero programas novos. Assets opcionais falham localmente. |
| Raycasting e hover | **Risco confirmado no caminho de eventos:** movimento pode gerar vários processamentos por frame; cena exterior preservada não deve receber picking enquanto está oculta. | Um hover por frame, com último evento pendente; clique/down/up continuam imediatos. Picking separa camada ativa interior/exterior e rejeita ancestrais invisíveis. Nós decorativos com `NO_RAYCAST` permanecem não interativos. |
| Tap, arraste, pinch e cancelamento | **Lacuna confirmada:** a tolerância `event.delta` isolada não registra a duração nem que o gesto se tornou multitoque. | Gate único do Canvas registra ponteiros, deslocamento máximo, duração e cancelamento; qualquer gesto multitoque é inelegível para seleção. A tolerância original do clique R3F continua aplicada. |
| React/state e alocações por frame | **Não demonstrado rebuild integral de geometrias por seleção comum:** há memoização e lotes batched. Permaneciam alocações transitórias em atualizações de cor/matriz e notificações amplas nas bordas da navegação. | Scratch objects reutilizados; movimento da câmera segue por refs/atualizações imperativas. Estado React sinaliza transições discretas, não posições a cada frame. |
| Labels | **Hipótese de todos os rótulos sempre montados descartada na base inspecionada:** já há `useContextualMapLabel`. | Preservado o comportamento contextual; exterior não exibe rótulos no interior. Nenhuma remoção generalizada de informação para ganhar desempenho. |
| Loop sob demanda | **Não demonstrada ausência geral de `invalidate`:** a base já invalidava durante mudanças. Interrupção do subtree/renderer explicava a pausa observada. | Mantido `frameloop="demand"`; transições e settling invalidam até estabilizar. Retorno de background, `pageshow` e contexto restaurado solicitam novo frame. Tempo oculto não avança abruptamente a transição. |
| Near/far e z-fighting | **Não confirmados como causa primária desta reprodução:** a base já contém near proporcional à distância, far derivado do enquadramento e correções de superfícies. | Preservadas geometria e soluções de profundidade. Propriedades de lente passam pelo controlador para evitar saltos entre modos; não foram usados fades para esconder conflitos de profundidade. |
| Context loss e memória | **Perda de contexto baseline após remoção do Canvas**, sem prova de GPU/OOM espontâneo. Nas amostras finais: uma montagem, zero perdas de contexto; contagens de recursos estabilizaram em 30 seleções e 10 ciclos de interior. Heap de seleção variou sem crescimento monotônico. | Telemetria limitada e descarte de recursos com proprietário definido. Heap sem GC forçado e contagens WebGL não certificam toda a memória GPU. Stress ainda teve tarefas acima de 100 ms; presença de GC no perfil não atribui causalidade a cada tarefa. |

## Implementação e componentes modificados

| Grupo | Arquivos principais | Responsabilidade |
| --- | --- | --- |
| Correção da causa primária no vínculo | `src/hooks/useCurrentOrg.ts`; consumidor preservado: `src/components/OrgGuard.tsx` | Não sinalizar resolução inicial durante refetch com vínculo conhecido; preservar o guard e os casos de autenticação/indeterminação/revogação/erro. |
| Persistência da página e painel | `CommercialMapPage.tsx`, `commercial-map.css`, `components/panels/MapPanelBoundary.tsx`, `components/panels/MapPanels.tsx` | Separar lifecycle do Canvas dos detalhes/workspaces; skeleton/falha limitados ao painel; preservar dados válidos após falha de refetch. Painel sem key de seleção; reset discreto de UI e keys prefixadas apenas nos formulários impedem drafts ou modais de outra entidade. |
| Cena e controlador único | `components/canvas/CommercialMapCanvas.tsx`, `hooks/useInteriorCameraRequest.ts`, `utils/cameraTransition.ts`, `store/useCommercialMapStore.ts` | Canvas/câmera/controles persistentes, exterior preservado, requests de interior, transição determinística, cancelamento sem salto na entrega aos controles, restauração e instrumentação. |
| Interiores | `components/canvas/CommercialPavilionInteriorScene.tsx`, `components/canvas/LivestockPavilionInteriorScene.tsx`, `components/canvas/MiranteInteriorScene.tsx`, `components/canvas/HeadquartersInteriorScene.tsx` | Remover controles/animações concorrentes; fornecer enquadramento e limites ao controlador compartilhado. |
| Ambiente e recursos | `components/canvas/CommercialMapEnvironment.tsx`, `components/canvas/LunarRocketLaunchEffects.tsx`, `components/canvas/CommercialMapInteriorShaderWarmup.tsx` | Propriedade pós-mutation de fog/background; stack explícito de pós-processamento e descarte; warmup no target/lente/saída corretos; correção do plume instanciado. |
| Eventos e seleção | `components/canvas/commercialMapEvents.ts`, `utils/interaction.ts`; componentes Canvas `CommercialHydrologicalInfrastructureLayer.tsx`, `CommercialPavilionModuleLayer.tsx`, `RearParkRoadNetwork.tsx`, `RearParkingLayer.tsx`, `StrategicLandmarks.tsx` | Coalescer apenas hover, preservar timing de clique, propagar evento nativo ao gate de gesto e impedir picking da composição inativa. |
| Diagnóstico | `utils/runtimeDiagnostics.ts` | React Profiler, identidade e contagem de Canvas/renderer/scene/camera/controls, contexto WebGL, tarefas longas, frame times e `WebGLRenderer.info`. |
| Regressão | `currentOrgRouteStability.test.tsx`, `commercialMapPanelSelection.test.tsx`, `commercialMapRuntimeStability.test.ts`, `commercialMapPanelStability.test.tsx`, `commercialMapEventScheduling.test.ts`, `commercialMapInteraction.test.ts`, `commercialMapCameraTransition.test.ts`, `commercialMapSceneEnvironment.test.tsx`, `commercialMapPostProcessing.test.tsx`, `commercialMapSelectionShaderWarmup.test.tsx`, `commercialMapInteriorShaderWarmup.test.tsx` e contratos existentes atualizados | Cobrir cache válido/fail-closed, drafts reais sem backend, identidade e isolamento, gestos, entrega da câmera aos controles, propriedade/descarte e variantes de shader. |

Os caminhos da tabela são relativos a `src/features/commercial-map/`, exceto os que começam por `src/` e os testes, em `src/test/`. `OrgGuard.tsx` identifica o consumidor do sinal; a correção central pertence ao hook, sem remover o guard. O helper `utils/instancedMeshDisposal.ts` já existia na base e foi reutilizado. Mudanças de `supabase/functions/mcp/index.ts` são alheias a esta intervenção e ficam fora da entrega do mapa.

### Propriedades do controlador

- Uma solicitação nova substitui a transição anterior a partir da **pose corrente**, não de uma posição inicial fixa.
- Posição, target e lente são interpolados; quaternion usa slerp. A duração deriva do deslocamento e é limitada a 460–900 ms; isso é duração de animação, não atraso antes de iniciar.
- Damping residual é drenado sem mudar a pose exibida. Os controles não escrevem a câmera durante o voo automático; um novo gesto interrompe esse voo e volta a controlar a navegação imediatamente.
- Interior, retorno, seleção, busca/foco, estacionamento, preset e limites usam o mesmo proprietário de câmera. A experiência lunar mantém seu caminho determinístico e trava de exclusividade, com limpeza/retorno explícitos.
- A cortina e os timers de cobertura/revelação entre pavilhões foram removidos. Não se usa opacity, reload, tela cinza ou timeout de carregamento para disfarçar o reset.

## Instrumentação e interpretação

Em desenvolvimento, `window.__commercialMapRuntimeDiagnostics` fornece contadores de lifecycle, eventos, commits React, tarefas longas, frames e snapshots; `capture()` coleta recursos e `resetSamples()` limpa somente amostras. A identidade histórica não é apagada ao iniciar um novo ciclo de medição.

- `WebGLRenderer.info.autoReset` é desativado para a medição e resetado uma vez no início do frame R3F, para que o próximo snapshot represente os passes agregados. O valor anterior é restaurado no cleanup.
- As amostras são limitadas para a própria telemetria não crescer continuamente.
- `frameTimes` considera atividade de navegação/cinemática, evitando interpretar o repouso legítimo do loop sob demanda como FPS baixo. Não converter um único maior intervalo em FPS sustentado.
- O heap JS, quando disponível no navegador, não mede toda a memória GPU. Contagens estáveis de texturas/geometrias são necessárias, mas não suficientes, para provar ausência de vazamento.
- `webglcontextlost` durante desmontagem observada não é, isoladamente, evidência de estouro de memória; manter a ordem temporal dos eventos é essencial.
- Na revalidação de vínculo, correlacionar `fetchStatus`, `status`, presença de dados, início/fim da consulta e lifecycle do Canvas. Repetir a seleção depois dos 60 segundos de stale time: uma sequência curta com cache recém-atualizado não exercita o gatilho comprovado.
- React Profiler e diagnóstico DEV têm overhead. Comparações devem informar build, viewport efetivo, DPR, estado frio/aquecido e composição ativa.

## Testes automatizados e comparação com a base

O snapshot amplo usado para a comparação diferencial, registrado em `.qa/final-tests.json` antes das últimas adições de regressão, continha **1.290 testes: 1.254 passaram e 36 falharam**. A reexecução final, depois de todas as correções e novos testes, contém **1.326 testes: 1.290 passaram e 36 falharam**, em 163 arquivos. Portanto, a suíte completa ainda não está verde, mas não ganhou falhas.

Para distinguir dívida herdada de regressão, os **12 arquivos com falhas** foram reexecutados no worktree limpo `expo-logistics-hub-map-baseline`, em HEAD detached **`4711d4d9`**, usando as mesmas dependências por junction. O resultado está em `.qa/baseline-failing-tests.json`: **97 testes, 61 passaram, 36 falharam**.

As chaves `caminho relativo do arquivo + fullName` das falhas foram normalizadas e comparadas. O conjunto é **exatamente igual**: 36 correspondências, zero falha nova e zero falha baseline ausente nesse conjunto. Isso confirma que **as 36 falhas reportadas são herdadas**, não que toda a aplicação esteja validada. A suíte completa não foi executada no worktree baseline.

| Arquivo reexecutado no baseline | Falhas | Passaram |
| --- | ---: | ---: |
| `agendaMeetingWorkspace.test.tsx` | 4 | 0 |
| `alvoradaPortalIntegration.test.tsx` | 2 | 0 |
| `commercialMapHydrologicalInfrastructure.test.ts` | 1 | 6 |
| `commercialMapIndependence.test.ts` | 2 | 3 |
| `commercialMapPresentation.test.ts` | 2 | 5 |
| `cronogramaDashboardIntegration.test.tsx` | 1 | 1 |
| `cronogramaDataIntegrity.test.ts` | 2 | 2 |
| `cronogramaMobilePresentation.test.tsx` | 3 | 6 |
| `cronogramaRegistrationInteractions.test.tsx` | 2 | 4 |
| `cronogramaTimeline.test.tsx` | 12 | 23 |
| `eventHarvestCompletion.test.tsx` | 2 | 4 |
| `venueEventsPresentation.test.ts` | 3 | 7 |
| **Total** | **36** | **61** |

Os testes específicos de persistência e boundary incluem uma Promise controlada, resolução e erro do painel, preservando a mesma referência DOM do Canvas e sem cleanup enquanto o painel muda. Isso valida o isolamento React diante de uma suspensão simulada; **não prova que uma suspensão foi a causa do incidente real**.

As regressões adicionais efetivamente executadas incluem:

- **8/8** em `currentOrgRouteStability.test.tsx`: estabilidade da rota no refetch com vínculo em cache e proteção fail-closed nos estados de autenticação inicial, ausência de vínculo, revogação e erro.
- **5/5** em `commercialMapPanelSelection.test.tsx`: A→B mantém a identidade do `aside`, fecha modais e reinicializa os drafts dos formulários reais para a entidade B; não executa operação de backend. As keys de formulários são prefixadas por finalidade, evitando colisões entre dialogs irmãos.

Na execução final, os 11 arquivos focados de lifecycle, câmera, eventos, painel, guard, pós-processamento, ambiente e warmup somam **58/58 testes aprovados**. A rodada especializada de GPU cobriu ainda 35/35 testes em sete arquivos, incluindo 20 ciclos reais de reconciliação R3F entre ambiente e interior. Esses resultados não alteram o resultado amplo de 36 falhas herdadas.

## Consolidação final de medições

As amostras finais foram coletadas no Windows 10, Chromium 151, Intel Core i5-1035G1 e ANGLE/Intel UHD Graphics D3D11, com Vite DEV, HMR desativado, `window.devicePixelRatio=0,5` e DPR do renderer fixo em 1. “Primeiro frame” é um proxy do retorno de `gl.render` após o commit da seleção, não medição fotônica. FPS deriva somente dos intervalos ativos durante a transição, não de um benchmark prolongado. Os dados brutos selecionados estão em `docs/commercial-map-performance-samples.json`.

| Ambiente final / viewport efetivo | Build e DPR | Seleção visual / início de câmera | Pior tarefa de seleção | Frame times / FPS sustentado | Lifecycle e contexto | Recursos após ciclos | Estado |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Desktop padrão, 1.440 × 900; Canvas 1.357 × 812 | DEV; browser 0,5 / renderer 1 | C6: estado 0,3 ms; primeiro frame/câmera **58,3 ms** | Nenhuma | 27 frames ativos; média 19,88 ms (**~50,3 FPS**); máximo 76,7 ms | Mesmas cinco identidades; 1 montagem; 0 context loss | Snapshot: 453 geometrias, 103 texturas, 130 programas | Aprovado na amostra |
| Desktop amplo, 1.920 × 1.080; Canvas 1.837 × 992 | DEV; browser 0,5 / renderer 1 | C5: **137,8 ms** | Nenhuma | 37 frames; média 23,79 ms (**~42,0 FPS**); máximo 40 ms | Mesmas cinco identidades; 1 montagem; 0 context loss | Amostra anterior ao ajuste final de fog/warmup; não usada para afirmar memória | QA responsivo válido; desempenho final amplo não recapturado |
| Mobile emulado retrato, 480 × 844; Canvas 480 × 783 | DEV; browser 0,5 / renderer 1 | C6: **75,3 ms**; B1: **100,0 ms**; primeiro interior: 134,6 ms; retorno: 119,3 ms | Seleção C6: nenhuma; B1: 50 ms; interior: 59 ms; retorno: 51 ms | Seleções ~59,9/~61,5 FPS; interior ~54,0 FPS; retorno ~56,2 FPS | Mesmas cinco identidades; 1 montagem; 0 context loss; fog/background presentes | Primeira entrada: **0 programas novos** | Aprovado nas sequências; emulação, não aparelho físico |
| Mobile emulado paisagem, 844 × 480; Canvas 761 × 402 | DEV; browser 0,5 / renderer 1 | C5: estado 0,2 ms; primeiro frame/câmera **136,3 ms** | Nenhuma | 49 frames; média 17,51 ms (**~57,1 FPS**); máximo 41,5 ms | Mesmas cinco identidades; 1 montagem; 0 context loss | Snapshot: 460 geometrias, 120 texturas, 130 programas | Câmera <150 ms; proxy visual acima de ~100 ms |

| Critério / sequência final | Resultado |
| --- | --- |
| Refetch `my-org-membership` com cache válido e seleção após stale time preservam o mesmo Canvas | **Aprovado.** Refetch durou 507 ms com a mesma referência e 1 montagem. |
| Autenticação inicial, vínculo ausente, revogação confirmada e erro continuam fail-closed | **Aprovado em 8/8 regressões** com guards e provider reais. |
| Zero remounts por seleção, painel, busca, área e workspace dentro do módulo | **Aprovado nas sequências exercitadas.** Seleções C6/B1/C5, busca, `industria-comercio-servicos` e modos list/create/edit/3d mantiveram a mesma referência. |
| Ausência de cinza/blank/flash/reset nas sequências exercitadas | **Aprovado por inspeção visual e lifecycle.** Nenhum fallback substituiu o Canvas e não houve context loss. |
| Feedback visual de seleção aproximadamente ≤100 ms; início de câmera ≤150 ms | **Parcial.** Retrato 75,3–100,0 ms e desktop 58,3 ms; paisagem 136,3 ms. Todas as amostras iniciaram a câmera antes de 150 ms. |
| Nenhuma tarefa longa de seleção acima de 100 ms no ambiente representativo | **Não certificado.** Sequências finais individuais ficaram em 0–59 ms, mas o stress DEV de 30 seleções teve tarefas ocasionais de 113–322 ms; o terceiro lote não teve nenhuma. |
| Zoom mínimo/médio/máximo, pan, orbit e gestos rápidos | **Aprovado em emulação.** Scroll atingiu distâncias 8,01 (mínimo 6,5) e 144,51 (máximo 144,51), com near 0,035–0,602/far 1.200; drag/orbit não selecionou estruturas nem remontou o Canvas. |
| Pinch e rejeição de seleção após arraste/multitoque | **Aprovado por testes de PointerEvent/gate**, incluindo multitoque, duração, movimento e cancelamento. Não houve toque físico. |
| Seleção durante transição; repetição da mesma e de diferentes estruturas | **Aprovado.** C6→C5 substituiu o voo em andamento; primeiro frame 103,3 ms, nenhuma tarefa longa, destino final C5 e mesmas identidades. |
| Abertura/fechamento de painéis; foco pela busca; retorno de interiores | **Aprovado.** Busca nativa por Pavilhão 1 abriu o painel correto sem remount; cinco testes de drafts/formulários; retorno manteve fog/background e teve máximo de 51 ms. |
| Redimensionamento, orientação, background/foreground e settling do loop sob demanda | **Parcial.** Retrato, paisagem e dois desktops preservaram lifecycle/DPR; handlers de visibility/pageshow/context têm cobertura automatizada. Background/foreground real do SO não foi exercitado. |
| Recursos/heap após ciclos repetidos, sem crescimento contínuo | **Aprovado no escopo medido, não certificado globalmente.** Em 30 seleções: 471 geometrias e 147 programas estáveis; texturas 100→102 e estabilizadas; heap oscilou 921,2→933,1 / 949,3→916,6 / 911,2→938,6 MB. Em dois lotes de cinco interiores, o segundo repetiu 480/103/146 e não teve tarefa longa. |
| Mapa completo e `industria-comercio-servicos`; aparência, camadas e funcionalidades preservadas | **Aprovado em QA autenticado e inspeção responsiva.** 1.725 entidades/1.577 lotes; troca de segmento, busca, painel, interior e mapa completo sem escrita comercial. |
| TypeScript, lint focado, build e `git diff --check` | **Aprovado.** `tsconfig.app` e `tsconfig.node`, ESLint dos arquivos focados, build Vite e diff-check. Build mantém o aviso herdado de chunks >500 kB. |

## Limitações e exclusões

- **Nenhum dispositivo móvel físico foi testado neste relatório.** Mobile emulado não comprova Safari/iOS, GPU móvel, comportamento térmico nem toque/pinça físicos.
- As metas de aproximadamente 30 FPS mobile e 60 FPS desktop não estão certificadas em uso sustentado. Os intervalos ativos registrados em DEV não equivalem a benchmark de produção, nem eliminam os picos acima de 100 ms medidos no stress.
- Não houve GC forçado, certificação de heap retido ou medição integral de memória GPU. O heap oscilante e os contadores estabilizados são evidências limitadas aos ciclos executados; as amostras de GC não identificam a causa de cada tarefa longa.
- A hipótese inicial de uma Promise no painel como causa primária foi descartada como conclusão não sustentada: o diferencial de boundary tinha o stale time como fator de confusão. A causa documentada é a conversão indevida de refetch com cache válido em loading do guard, reproduzida diretamente.
- Há 36 falhas automatizadas herdadas e explicitamente comparadas. Não são mascaradas, removidas nem declaradas corrigidas por esta intervenção.
- A validação de consultas autenticadas e renderização não autoriza afirmar gravações de negócio, migrações ou persistência remota testadas; não são o objetivo da correção.
- O primeiro carregamento sem dados válidos continua dependente de autorização/rede. Preservar o último mapa só é possível depois de existir um estado válido; a correção não fabrica esse estado.
- Publicação e estado da PR devem ser registrados na entrega final após a validação. Este documento não pressupõe PR criada, merge ou checks remotos aprovados.
