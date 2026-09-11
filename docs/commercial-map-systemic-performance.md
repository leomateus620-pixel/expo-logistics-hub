# Mapa Comercial: carregamento e continuidade da iluminação

Intervenção de 11/09/2026. Base: `6b8252839cb843b96e78ef81f0bd60ef0f4d3439`.

## Estado da entrega

A meta de mapa comercial real utilizável em até 5 s **não está comprovada nem atingida nos primeiros acessos locais à cena de referência**. Esta PR elimina dependências e serializações desnecessárias do carregamento e corrige mecanismos de descontinuidade da iluminação. O tempo de preparação inicial da cena continua sendo um gargalo material. As medições locais de fixture não certificam latência de produção, situação comercial atual, Safari ou aparelhos físicos móveis.

O checkout principal estava em `main`, igual a `origin/main` e ao commit indicado, após fetch. Já havia alterações locais no lockfile, função MCP e artefatos. Elas foram preservadas. A intervenção usa o worktree `expo-logistics-hub-performance`, branch `codex/commercial-map-systemic-performance`; a baseline reproduzível usa um worktree destacado. Nenhuma geometria oficial, cadastro, migração, regra de negócio ou dado remoto foi editado.

## Evidência, mecanismo e correção

| Achado | Classificação | Evidência e consequência | Correção / regressão |
| --- | --- | --- | --- |
| Skeleton depende da consulta inicial | Confirmado no código | `MapPageSkeleton` aguarda `isLoading`; tela anexada não identifica sozinha um problema de GPU | Mantida a exigência de dados válidos. Marcadores de dados, renderer, compilação e draw separam os estágios |
| Projeto só iniciava depois da manutenção | Confirmado no código | Duas operações independentes serializadas; lotes dependem da expiração | Projeto e RPC concorrentes; ambas observadas no mesmo `Promise.all`; leitura comercial só depois de manutenção concluída; teste com promessa controlada |
| Assinatura do raster no final das consultas | Confirmado no código | Rede adicional depois de todo o inventário, mesmo com referência oculta | Assinatura concorrente com geometrias no serviço quando solicitada. Na página, consulta independente apenas para camada ou ferramentas que usam o raster; preserva escopo, calibração e expiração da URL |
| Relações comerciais com `*` | Confirmado no código | Campos de documentos, contatos, histórico e metadados sem consumidor em `mapLot` eram transferidos | Projeção explícita das cinco relações; linha principal mantida. Preços, reserva, negociação, venda e contrato testados |
| Arquivo da página acoplado ao renderer | Confirmado no código e no build | Import estático e import indireto do profiler puxavam Three; helpers e Zustand capturados pelo chunk manual anulavam uma divisão superficial | Canvas lazy com preload durante consulta; profiler leve; painéis/editores isolados por Suspense local; helpers/estado separados do chunk gráfico; verificação transitiva do manifest |
| Física dos carrinhos no caminho inicial | Confirmado no build | Rapier contribuía com cerca de 2 MB dentro de `maps-three` | Módulo físico separado e prefetched. Modelo estacionado e modelo físico compartilham exatamente a carroceria e posições; Suspense fica dentro do parque |
| Inventário no persister síncrono | Confirmado no código | Desidratação/JSON/localStorage podiam serializar toda a cartografia a cada atualização de cache | Inventários comerciais excluídos da persistência; caches históricos filtrados antes de hidratar. QueryClient em memória e revalidação continuam funcionando; não transforma cache persistido em situação comercial confirmada |
| Sol some da lista de luzes no fim da noite | Confirmado no código; crescimento inicial de programas observado | `visible = nightBlend < .999` altera a composição de luzes/sombras. O primeiro ciclo anterior aumentou programas; nem todo programa novo foi atribuído exclusivamente ao sol | Identidade, `visible` e `castShadow` estáveis. Intensidade chega a zero; sombra solar para de atualizar no escuro e volta a ficar dirty ao amanhecer. Teste de 20 ciclos, sombra ausente e luz em movimento |
| Saltos no amanhecer após frame longo / replay | Confirmado no código | Progresso derivado do relógio absoluto avança mesmo sem desenho e recomeça abruptamente em zero | Um único playback, avanço por frames limitado a 50 ms, pausa durante compilação/aba oculta/noite. Replay parte da posição atual e retorna suavemente ao horizonte em 700 ms antes do percurso existente de 7,5 s. Em frames lentos a sequência pode durar mais |
| Sol move com sombras atualizadas em degraus | Confirmado no código | Atualização das sombras limitada por intervalos enquanto posição solar muda a cada frame | Atualiza sombra no mesmo frame em que o sol se move; deixa sombras estáticas quietas. Custo adicional durante amanhecer deve ser avaliado por dispositivo |
| Bairro acende materiais abruptamente | Confirmado no código | `useLayoutEffect` alterava emissivos integralmente no clique | Mesmas cores e intensidades finais, agora interpoladas; nenhum novo material por frame |
| Mudança real de câmera na alternância | Não reproduzida na baseline parada | 20 ciclos anteriores tiveram deltas zero de posição, quaternion, target e projeção | Handlers de iluminação continuam sem modificar câmera, seleção, preset ou sequência de navegação. Trace limitado monitora também buffer/DPR |
| Warmup bloqueia primeiro desenho | Confirmado em execução local | Há tarefa longa de montagem, chamadas JS de compile e espera separada de variantes direta/post; `compileAsync` inclui trabalho síncrono | Instrumentação separa JS de espera. Mantido warmup das variantes necessárias: remover a barreira sem reorganizar os programas causaria travamento no primeiro gesto. Preparação obsoleta não libera a barreira de um contexto novo; estado do renderer/material restaurado em `finally` |

### Projeção comercial preservada

`lot_prices`: `is_active, pricing_mode, base_price, price_per_sqm, asking_price, minimum_price`.
`lot_reservations`: `status, company_name, expires_at, responsible_name`.
`lot_negotiations`: `status, company_name`.
`lot_sales`: `status, buyer_name, sale_date, salesperson_name, contract_number`.
`lot_contracts`: `is_active, contract_number`.

Todos os consumidores recebem `CommercialLot` transformado. Versões e arquivos de contratos continuam em sua consulta privada própria. Não foram adicionados filtros que descartem fluxos históricos antes da escolha feita por `mapLot`. A paginação de 1.000 linhas, ordenação e falha atômica do inventário foram preservadas; teste carrega 1.205 entidades/geometrias/lotes e rejeita segunda página incompleta. O caminho de comissão continua usando segmentação, checks de integridade, filtros de projeto/entidade e projeção próprios. Não se substitui falha de segmento por inventário completo.

## Navegação e recursos: limites do diagnóstico

| Área | Resultado |
| --- | --- |
| Canvas / renderer / controles | Instâncias persistentes já existiam. Preservadas; telemetria dos ciclos verifica identidade/lifecycle. Suspense secundário não envolve o Canvas inteiro |
| Zustand | Selectors escalares existentes preservados. A assinatura noturna saiu do grande componente Scene e passou a wrappers pequenos de ambiente/bairro |
| Geometrias / materiais / render targets | Sem mudanças em modelos, resolução, sombras, vegetação, materiais finais ou limites de qualidade. Física mantém geometria equivalente. Composer e pools existentes mantidos |
| Raycast | Camadas decorativas e instancing existentes mantidos; nenhum raycast global novo. Trace só é ativado em QA |
| Labels / busca / painéis | Índice memoizado e debounce de 140 ms existentes preservados. Editor, listas e detalhes passam a carregar localmente; latência do primeiro download desses painéis precisa de rede real |
| Gestos / transições automáticas | Controller existente cancela/respeita navegação manual. Iluminação não altera seus parâmetros. DPR de interação e caminho direto já existiam e não foram reduzidos nesta PR |
| Cena parada | Demand rendering preservado. Amanhecer invalida apenas durante playback; blends param quando assentam. Brinquedos noturnos continuam animando intencionalmente |
| Alternância direto/compositor | Ambas variantes continuam preparadas. Em r170 `compileAsync` consulta `material.currentProgram`; desenhar outra variante durante a espera não é uma otimização segura sem trabalho adicional |
| Alocações / GC | Sem novas alocações de material/geometria por frame. Trace bounded de até 1.200 frames/12 s tem custo de diagnóstico; não mede GC nem prova ausência de leak prolongado |
| Recuperação | Restauração de contexto e dirty flag global das sombras existentes preservadas. Geração do warmup impede conclusão antiga de desbloquear uma nova. Ensaios descritos nos artefatos; recuperação térmica/driver físico segue pendente |

## Medições e critérios

Código final medido: `dac865ea` (mais scripts de observação do preview). Build padrão de produção, mesmo lock, sem flag de QA, analisado por manifest:

| JavaScript minificado | Baseline | Depois |
| --- | ---: | ---: |
| Fechamento transitivo estático antes da consulta, incluindo dependências compartilhadas da aplicação | 6.203.939 bytes | 1.706.233 bytes |
| Soma gzip desses arquivos (estimativa de build, não tráfego de produção) | 2.003.298 bytes | 487.767 bytes |
| Chunk principal da feature CommercialMapPage, bytes reais do arquivo | 1.637.335 bytes | 540.747 bytes |
| maps-three | 3.249,39 kB | 1.161,92 kB |
| Física separada | embutida | 2.081,49 kB, carregada concorrentemente sem bloquear início da consulta |

O build com QA tem repartição diferente dos chunks (por compartilhar a cena com a rota de diagnóstico). Por isso a redução do arquivo da página de QA para cerca de 95 kB não é usada como resultado do build normal. A asserção do manifest normal confirma ausência de Three, física e PDF como dependências estáticas obrigatórias da página.

Três navegações/reloads por versão, no navegador embutido Chromium 152/Windows, Intel UHD/ANGLE D3D11, viewport 1366×768, DPR 1, rede localhost sem throttling configurado:

| Primeira oportunidade de apresentação, fixture | Baseline | Depois |
| --- | ---: | ---: |
| Execução 1 | 16.901,3 ms | 10.055,9 ms |
| Execução 2 | 16.813,9 ms | 9.891,2 ms |
| Execução 3 | 7.573,3 ms | 7.494,3 ms |
| p50 observado | 16.813,9 ms | 9.891,2 ms |
| p95 por nearest rank, n=3 (apenas o máximo) | 16.901,3 ms | 10.055,9 ms |

Cache HTTP e cache de shaders do driver não foram isolados. A terceira execução aquecida praticamente empata. A diferença entre medianas é uma observação deste pequeno conjunto, não prova de ganho causal de 41% nem estimativa de p95 de produção. Permanecem tarefas longas de montagem de aproximadamente 5,5–7,1 s no build final. Em um primeiro acesso anterior ao ajuste final de replay, o probe mediu 458,5 ms no JS da compilação direta, 244,5 ms no JS da compilação post e 13,85 s no total das duas esperas; isso inclui agendamento/polling, não é tempo puro de GPU. Interiores reportaram 6,33 s de preparação, concorrente. Upload de texturas e linkedição ainda não foram isolados por recurso.

### Iluminação: 20 ciclos antes/depois

Cada rodada realizou 40 transições, com 3,5 s de noite e 8,5 s para o amanhecer. As duas rodadas finais mantiveram documento visível/focado, buffer 1351×467, DPR 1, câmera, target e projeção iguais. A referência contém 1.690 entidades/1.577 lotes na interface; são dados de teste locais, sem situação comercial confirmada.

| Resultado | Baseline | Depois |
| --- | ---: | ---: |
| Programas durante os ciclos | 270 → 278 | 204 em todas as transições |
| Primeira noite | 2 amostras; intervalo de 8.387,9 ms | 156 amostras; p50 21,8 / p95 28,8 / p99 42,3 ms |
| Noites aquecidas: mediana dos p50 / p95 / p99 de cada transição | 21,4 / 30,0 / 33,8 ms | 24,5 / 27,0 / 29,4 ms |
| Amanheceres aquecidos: mediana dos p50 / p95 / p99 de cada transição | 23,6 / 32,1 / 38,1 ms | 27,5 / 31,9 / 36,9 ms |
| Maior delta de câmera / quaternion / target / projeção | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |
| Montagens Canvas / renderer / controles | 1 / 1 / 1 | 1 / 1 / 1 |
| Geometrias / texturas ao longo dos ciclos | 590 / 146 | 590 / 146 |
| Perdas de contexto / erros residuais | 0 / 0 | 0 / 0 |

Percentis aquecidos excluem o ciclo zero e são medianas de percentis por transição, **não percentis de todos os frames agrupados**. Os 20 amanheceres finais efetivamente completaram o playback (258–358 frames cada), sem o encerramento prematuro observado no ensaio intermediário. A intensidade solar final de dia foi 2,46 nas duas versões, com a mesma posição solar. O sol final permanece visível com intensidade zero à noite. As contagens de draw calls incluem passes do frame completo (`autoReset=false`, reset antes do frame); o último frame dos ciclos teve 1.153 → 871 chamadas. Esse snapshot não é uma média: culling e a fase de sombras/animação variam.

O travamento inicial noturno da baseline foi reproduzido em primeiro plano. Não houve deslocamento geométrico involuntário parado nem antes nem depois: o mecanismo confirmado envolve variantes de iluminação e descontinuidades visuais, não um handler que move a câmera. O custo mediano aquecido **não melhorou**: atualizar sombras junto com o sol custa mais, mas evita posições de luz/sombra desencontradas. Os p50 finais equivalem a cerca de 36–41 FPS durante essas animações, sem cumprir 60 FPS de desktop. Não extrapolar para celular físico.

### Comparação visual e interface

| Estado final, mesma câmera/buffer/DPR | Antes | Depois |
| --- | --- | --- |
| Dia, playback concluído | [imagem](validation/systemic-performance/baseline-day-final.jpg) | [imagem](validation/systemic-performance/after-day-final.jpg) |
| Noite assentada | [imagem](validation/systemic-performance/baseline-night-final.jpg) | [imagem](validation/systemic-performance/after-night-final.jpg) |
| Filmagem de replay, gesto manual e noite | [WebM](validation/systemic-performance/baseline-interactions.webm) | [WebM](validation/systemic-performance/after-interactions.webm) |
| Frames extraídos da filmagem | [contato](validation/systemic-performance/baseline-video-frames.jpg) | [contato](validation/systemic-performance/after-video-frames.jpg) |

Inspeção visual dos pares mostra os mesmos prédios, ruas, vegetação, materiais e iluminação final geral. Não é uma asserção de igualdade pixel a pixel: brinquedos animam, as capturas JPEG têm compressão diferente e os vídeos usam captura a 15 FPS. As gravações são ilustrativas, com cliques manuais em tempos distintos, e foram excluídas do benchmark; a janela do gravador é 16 s, mas o stream de Canvas demand termina no último frame capturado (8,94 s na baseline, 15,02 s depois). Os frames extraídos foram inspecionados; isso não certifica ausência de todo tipo de cintilação em cada frame ou em outros drivers. A matriz física de filmagens continua necessária.

Ensaios finais da interface real com permissões de leitura e fixture:

- Busca “Pavilhão”, abertura/fechamento da lista lazy, seleção B1, painel de detalhes, entrada/saída do interior com 189 módulos: mapa recuperou `ready`, interior no caminho direto, exterior no compositor. [Interior](validation/systemic-performance/after-interior.jpg).
- Replay, interrupção por noite, retorno ao dia e três replays rápidos. Com o painel de B1 aberto, posição/quaternion/target/FOV/view offset e dimensões foram idênticos antes/depois, controles habilitados e seleção preservada.
- Seleção do segmento Exporural (95 lotes de fixture) e limpeza do segmento: `ready`, sem perda de contexto. Não exercita a RPC de comissão com dados reais.
- Perda/restauração forçada de contexto à noite: `ready/post`, uma perda intencional, nenhum erro residual, câmera preservada. Retorno ao dia, hidrologia e zoom até a distância mínima 8,7889 continuaram funcionando. A primeira ativação da hidrologia após restauração levou cerca de 4 s na ação e gerou programas novos; persiste como gargalo, sem benchmark dedicado para atribuir seu custo.
- Viewports 390×844 e 844×390, noite/amanhecer e arraste manual: controles responderam e a cena continuou `ready/post`, sem perda de contexto. [Retrato](validation/systemic-performance/after-mobile-portrait.jpg), [paisagem](validation/systemic-performance/after-mobile-landscape.jpg). É Chromium no notebook, sem emulação de CPU/GPU, sem Safari e sem multitoque.

Metadados brutos: `functional-renderer.json`, `functional-interface.json`, `*-visual-state.json`. Os ensaios não mediram uma distribuição de input-to-photon nem comprovam resposta <100 ms; o probe de primeiro ponteiro mede apenas a próxima oportunidade de RAF. Sessão prolongada/aquecimento, zoom mínimo extremo, retorno de outro aplicativo e toda combinação de painel/gesto/iluminação não foram certificados.

### Build e testes

- Build normal e build de QA: passaram. TypeScript app e node: passaram. `npm ci` reproduzível e novo dry-run: passaram. `git diff --check`: passou.
- ESLint nos arquivos alterados: zero erros; um aviso de Fast Refresh no arquivo compartilhado `BumperCarModel.tsx` (componente e função de posicionamento no mesmo módulo).
- Suíte ampla do mapa no início da validação: 1.049/1.061 passaram; dez falhas de baseline e duas expectativas textuais de overlays de QA posteriormente corrigidas.
- Validação dirigida final: 109/110 passaram, com uma falha de baseline de comissão. Os sete testes do parque também foram repetidos após a inclusão do boundary local e passaram. Relatórios JSON preservados, sem editar resultados brutos.
- As onze falhas preexistentes foram reproduzidas no worktree de baseline: `commercialMap2026Reference` (2), `commercialMapElectricalInfrastructure` (2), `commercialMapExporuralArchitecture` (1), `commercialMapPavilionFourSoyKitchen` (1), `commercialMapPresentation` (2), `commercialMapSiteEnvironment` (1), `commercialMapSoyGateInfrastructure` (1), `commissionMapPortals` (1, expectativa 111 entidades versus 108). Nenhuma delas foi “corrigida” alterando o inventário desta intervenção.

O ensaio intermediário `after-lighting-before-replay-guard.json` revelou replays concluídos cedo em frames com delta zero. O guard final exige o término efetivo da fase de avanço, inclusive ao invalidar um frame sem mudança numérica do progresso. Esse caso tem regressão específica; o arquivo intermediário não é o resultado final.

Os artefatos estão em `docs/validation/systemic-performance/`. Resultados devem ser interpretados com o viewport, buffer, DPR e foco de cada execução; não agregue amostras de abas ocultas a FPS de navegação. A primeira rodada anterior com intervalos próximos de 1.000 ms sofreu throttling; foi conservada como evidência de identidade/recursos, **excluída da comparação de FPS**. A rodada anterior no Chrome teve frames normais após o primeiro ciclo, mas o probe antigo não anotava foco em cada frame. O probe atual anota.

A marca `presentationOpportunity` é o RAF após um draw confirmado pelo frame owner, corroborado por imagem; não é medição fotônica de apresentação. `canvas` não significa mapa utilizável. A rota `/__dev/commercial-map-rendering` usa a mesma referência oficial e renderer, sem autenticação nem consulta comercial. Seus tempos não incluem autenticação, permissões e dados remotos. Recarregar aquece caches HTTP/driver; não é um novo cold start. ResourceTiming com `transferSize=0` não autoriza afirmar zero bytes de rede.

Não houve acesso de diagnóstico SQL/EXPLAIN nem captura autorizada dos payloads do banco de produção. Número real de requisições paginadas, bytes de relações, latência da expiração e assinatura, planos e índices seguem pendentes de medição nesse ambiente. Não foram feitos índices ou alterações remotas por suposição.

Na verificação final das superfícies acessíveis, apenas o navegador embutido com o preview local estava exposto à automação; o Chrome do usuário não estava disponível. Por isso o aviso de que o usuário entraria no site não foi tratado como comprovação de uma sessão autenticada acessível ao teste.

## Reprodução

```powershell
npm ci --ignore-scripts --no-audit --no-fund
npx tsc -p tsconfig.app.json --noEmit
npx tsc -p tsconfig.node.json --noEmit
npm run build -- --manifest
node scripts/commercial-map-performance/bundle-report.cjs dist --assert-independent
npm test -- src/test/commercialMapLoadingPipeline.test.ts src/test/commercialMapLightingTransition.test.ts src/test/commercialMapSceneShaderWarmup.test.ts src/test/commercialMapPanelStability.test.tsx src/test/commercialMapPostProcessing.test.tsx src/test/commercialMapEnvironment.test.ts src/test/commercialMapAmusementPark.test.ts src/test/commercialMapQuadrasABLactalis.test.ts src/test/commercialMapRearRoadNetwork.test.ts src/test/commissionMapMigration.contract.test.ts src/test/commissionMapPortals.test.ts src/test/currentOrgRouteStability.test.tsx
```

O lock anterior não permitia `npm ci`: faltavam Firebase e suas dependências já declaradas. Foi incorporada a resolução local existente, sem alterar `package.json` nem atualizar versões das bibliotecas gráficas. O lock inclui Firebase 12.19.0 dentro do intervalo existente `^12.18.0`.

Para medir um build de produção com probes, use `VITE_COMMERCIAL_MAP_DIAGNOSTICS=true` apenas no build de QA; a produção padrão não expõe essas rotas. Rode `instrument-preview.cjs <outDir>` somente sobre o preview para obter ResourceTiming/long tasks/draw/primeiro pointer response em `document.documentElement.dataset.previewPerformance`. O script não busca dados nem muda a cena. `window.__commercialMapPerformance` e o dataset homônimo expõem as etapas do carregamento real em um ambiente de QA autenticado.

`add-recording-control.cjs <outDir>` adiciona gravação opcional de Canvas somente nas rotas `/__dev/` com `?recordingQa`. Rode filmagens separadamente das medições. `summarize.cjs` recompõe `comparison.json` a partir dos JSON brutos desta entrega.

Para baseline: crie um worktree destacado em `6b825283`, rode `prepare-baseline.cjs <worktree>` uma única vez, instale com o mesmo lock e construa com a mesma flag de QA. O script aplica exclusivamente probes/rotas à base. Compare acesso direto e portal, cache frio e quente, full e comissão, mantendo revisão/inventário, browser, rede, viewport, DPR, câmera e qualidade. Faça pelo menos 20 execuções por condição para um p95 útil; os poucos reloads desta intervenção não estimam a cauda de produção.

## Matriz restante e rollback

Notebook Intel UHD/Windows com navegador acelerado: ensaios locais descritos nos JSON. Desktop com GPU dedicada, Android intermediário físico, iPhone/Safari físico, pinça multitoque, aquecimento e sessão prolongada **não certificados**. Chrome com viewport móvel só verifica layout/responsividade. Acesso direto e portal autenticados, segmentos com dados reais, edição/persistência, rede móvel fria e revogação real precisam de QA com contas e inventário apropriados. Os testes de regressão não substituem essa matriz física.

Antes de liberar: comparar filmagens de amanhecer/noite parado/em movimento e cliques rápidos nos quatro perfis físicos; pan/rotação/zoom/pinça, seleção durante transição, busca/filtros/segmentos, painéis, interiores, hidrologia, orientação, retorno da aba, contexto e uso prolongado. Registrar frame p50/p95/p99, long tasks, resposta de ponteiro, programas/texturas/geometrias e draw calls do frame completo. Critérios: dados essenciais válidos + mapa visível + gesto respondendo <=5 s, interação ~100 ms, desktop 60 FPS e celular intermediário 30 FPS; nenhum deles deve ser deduzido de spinner, screenshot ou teste unitário.

Rollback: reverter os commits desta PR e reconstruir/deployar pelo fluxo habitual; nenhuma migração ou alteração no banco precisa ser desfeita. A retirada do inventário do localStorage é segura e o mapa volta a consultá-lo. Manter o lock reproduzível se o revert da funcionalidade for feito separadamente. Não foi feito deploy, merge ou mudança no mapa publicado por esta intervenção.
