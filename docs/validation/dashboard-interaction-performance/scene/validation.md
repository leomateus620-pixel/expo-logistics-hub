# Dashboard sobre a cena 3D

O cenário integrado usa `CommercialMapPage` com o inventário oficial de leitura da rota `/__dev/commercial-map-interface`. O harness de medição libera a dashboard nessa rota, sem alterar a disponibilidade de produção. Requisições de autenticação e REST são interceptadas. Não foram exercitadas operações comerciais autenticadas nesse cenário.

As medições deste documento foram preservadas no commit `7aff263d`, anterior à integração da `main` `9f2ee996` na PR #191. A integração dos novos layouts e inspeção é verificada separadamente no relatório principal; não houve novo benchmark integrado dessa revisão. Logs publicados usam `.log.gz` com os bytes originais.

## Condições

- Windows, Chrome 154 headless, ANGLE/D3D11, Intel UHD Graphics; `hardwareConcurrency=4`, `deviceMemory=8`.
- Viewport 1366 × 768, DPR 1; os registros guardam o DPR e o buffer reais.
- Inventário da fixture: 1.578 entidades, 1.466 lotes, 273 árvores comerciais.
- Prontidão exigida: `commercialMapReady=true`, apresentação saudável no caminho `post`, estágio `critical-post:end` concluído. O marcador de hidratação completa estava ausente nesse gate em ambos os lados; aparece posteriormente nos registros. O gate não foi apresentado como hidratação completa.
- Contexto novo do navegador, servidor Vite aquecido, caches do driver/sistema preservados. Sem limitação artificial de CPU nesta avaliação da cena.
- O par integrado final fixa `qualityQa=HIGH`. Os primeiros arquivos `before-*` usaram `quality=fixed`, parâmetro ignorado pela rota, e são observações exploratórias: a qualidade observada permaneceu HIGH/post. Não devem ser misturados com o par final para comparar latências.

## Causa observada antes da alteração

Na referência válida, a dashboard cobria o mapa, mas a cena continuava apresentando frames completos: 265 frames em 11,52 s no estado seco e 312 em 11,29 s com chuva. A cena visível seca apresentou 276 em 11,46 s. O Canvas sob demanda continuava recebendo invalidações do intervalo dos personagens executivos; a chuva também varria materiais/luminárias periodicamente, inclusive seca. Esses registros demonstram trabalho ao fundo, mas não demonstram uma interrupção de três segundos.

A intervenção conserva o Canvas, cena, câmera, controles, recursos e listeners de recuperação. A cobertura pausa a apresentação R3F, o agendador explícito, picking, amostragem adaptativa, intervalos decorativos, varreduras de chuva e a timeline GSAP. O retorno invalida a apresentação, preserva a fase do relógio e o DPR canônico e compensa apenas o período oculto de cada transição de câmera. O snapshot e a atualização dos dados continuam ativos.

## Comparação integrada concluída

O par válido é `before-integrated-retry-*` / `after-integrated-*`; `comparison.json` contém as distribuições completas geradas por `scripts/dashboard/scene-performance-compare.cjs`. O percurso tem 90 ações em três repetições: visão de todos os externos na abertura/reabertura, três mudanças para áreas individuais, oito pavilhões, hover/foco/seleção, métricas, destaques, preço A → B → A e fechar/reabrir.

Tempos abaixo incluem o atraso de despacho do evento, antes do handler. A oportunidade de feedback continua sendo a aproximação de dois rAF, não uma medição física de pintura. Cada célula é mediana / p95, em milissegundos.

| Interação | Evento → feedback antes | Depois | Evento → conteúdo consistente antes | Depois |
| --- | ---: | ---: | ---: | ---: |
| Área externa | 161,0 / 209,1 | 30,3 / 31,9 | 161,0 / 209,1 | 30,3 / 31,9 |
| Pavilhão | 217,0 / 313,1 | 42,0 / 65,2 | 220,3 / 467,5 | 42,4 / 69,6 |
| Seleção de lote | 186,3 / 242,7 | 28,9 / 43,5 | 186,3 / 242,7 | 28,9 / 43,5 |
| Etapa de preço | 173,8 / 301,7 | 29,3 / 33,8 | 173,8 / 301,8 | 29,3 / 33,8 |
| Fechar dashboard | 261,4 / 264,0 | 78,5 / 90,5 | 261,4 / 264,0 | 78,5 / 90,5 |
| Reabrir dashboard | 351,7 / 426,2 | 165,3 / 204,5 | 351,7 / 426,2 | 165,3 / 204,5 |

O pior evento → conteúdo de pavilhão caiu de 953,0 para 114,3 ms nesse percurso. A pausa relatada de aproximadamente três segundos não foi reproduzida; não se declara sua eliminação universal.

O React Profiler, filtrado pelo início real do evento, também reduziu a mediana da fronteira inclusiva `CommercialDashboard`: pavilhão 51,2 → 16,2 ms, seleção 21,8 → 3,7 ms, preço 50,4 → 14,7 ms, reabertura 92,0 → 40,8 ms. Não se somam fronteiras aninhadas. O trabalho geométrico instrumentado na troca de preço caiu de mediana 11,6 ms para zero; reabertura de 11,8 ms para zero. Essas medições abrangem os builders instrumentados, não todo o JavaScript.

| Intervalo | Antes | Depois |
| --- | --- | --- |
| Coberto, seco | 265 frames / 11,52 s; 42 tarefas longas | 0 frames / 10,07 s; 0 tarefas longas |
| Coberto, chuva ativada | 312 frames / 11,29 s; 15 tarefas longas | 0 frames / 10,07 s; 0 tarefas longas |
| Visível após fechar, chuva | 263 frames / 10,62 s | 314 frames / 10,41 s |

O estado permaneceu pronto/saudável no caminho post durante a cobertura normal, sem envelhecer para falha. Ao retornar, o overlay e o loader estavam ausentes e o mapa voltou ao caminho post. Os draws visíveis conservaram as mesmas 827 chamadas e 703.516 triângulos com chuva; qualidade HIGH e DPR 1 permaneceram iguais. As diferenças de contagem de geometrias residentes após a primeira ativação da chuva não são tratadas como redução do conteúdo apresentado.

## Retorno e recursos no candidato

- Três entradas/saídas após selecionar um lote, pan e zoom reais conservaram exatamente a câmera, seleção, IDs de cena/câmera, um Canvas, um renderer e um controle. Geometrias, texturas e programas tiveram variação zero em cada ciclo.
- Heap bruto: 195,1 → 186,3 → 203,4 → 179,7 MB. Não houve crescimento monotônico observado nesses três ciclos; isso não é uma auditoria de vazamento com GC normalizado.
- DPR adaptado não inicial 1,75 e buffer 2.390 × 1.218 foram idênticos antes, coberto e após retornar (`after-integrated-adapted-dpr.json`).
- Perda de contexto foi injetada enquanto coberto. O listener recebeu perda/restauração 1/1; ao fechar, voltou a `ready/post`, `lastErrorCode=null`, com câmera, seleção e identidades preservadas e sem erro de página (`after-integrated-recovery.json`). O estado `context-lost/suspended` durante a injeção é esperado.

## Tentativas descartadas e ambiente de desenvolvimento

O primeiro sweep integrado usou uma asserção incorreta: tentava verificar o destaque de hover após já selecionar outro lote, embora a seleção tenha precedência visual. O harness foi corrigido para executar todos os hovers e focos antes das seleções; nenhum comportamento do produto foi alterado por isso. As latências desse sweep incompleto não entraram na comparação.

O benchmark de baseline corrigido terminou, mas sua auditoria posterior de ciclos foi interrompida pela otimização de dependências Vite (`@radix-ui/react-slider`, `@radix-ui/react-scroll-area`), confirmada no log do servidor com recarregamento. A primeira tentativa do candidato também recarregou ao descobrir dependências lazy de dashboard. Seus intervalos inválidos foram separados em `after-integrated-interrupted-*` e excluídos. Após aquecer a rota isolada, importar `MapPanels` e confirmar a estabilidade da navegação por cinco segundos, o candidato final terminou sem recarregar. O comparador usa somente o par válido; não afirma uma comparação de memória de ciclos baseline/candidato, pois o baseline dessa fase não terminou.

## Verificações de código

`scene-tests.log`: 179 testes aprovados em 18 arquivos; duas asserções de contrato textual falham. `scene-baseline-tests.log` reproduz as mesmas duas falhas no snapshot imutável anterior: `commercialMapRuntimeStability` espera `setEditingLot(false)` no `MapPanels`, e `commercialMapRegionalHighways` espera `expandFramingBoundsWithRegionalHighways` no Canvas. São falhas preexistentes, não corrigidas nesta otimização.

Os testes novos de apresentação passam, incluindo um teste com o reconciler R3F instalado: três coberturas/retornos conservam a identidade da cena/câmera e a montagem dos recursos, DPR adaptado 0,73, fase do relógio, estado de picking e descarte de frames pendentes. O teste de recuperação coberta mantém seus listeners ativos. A verificação no navegador real complementa esses testes; o renderer substituto do teste não certifica GPU.

ESLint dos arquivos de cena/página alterados e dos testes novos/atualizados passou sem diagnósticos (`scene-lint.log`). O script reutilizável passa em `node --check`.

## Percurso reutilizável

`scripts/dashboard/scene-performance-browser.cjs` registra intervalos secos/com chuva, visíveis/cobertos, e, com `SCENE_SWEEP=1`, três repetições dos quatro recortes externos, oito pavilhões, hover/foco/seleção, métricas, destaque de situação, preço A → B → A e fechar/reabrir. O primeiro retorno visual usa dois `requestAnimationFrame` após o evento como aproximação da oportunidade de pintura; não representa uma medição direta de fótons. O conteúdo consistente usa predicados sobre o destino real do DOM. Os eventos preservam `start` e as amostras completas do React/geometria: custos anteriores ao evento, como hover causado pelo clique automatizado, devem ser filtrados ao atribuir custo ao clique.

Após os intervalos, o harness seleciona um lote canônico localmente, executa pan com ponteiro e zoom com roda e compara câmera, seleção, identidade e recursos em três entradas/saídas. `SCENE_DPR=1` verifica cobertura com DPR não inicial; `SCENE_RECOVERY=1` injeta e restaura perda de contexto enquanto coberto. Essas verificações são separadas do benchmark.

## Limites

Os resultados locais não certificam computador físico mais limitado, iOS, driver distinto, dados/permissões de produção, vendas/contratos autenticados, sincronização remota ou retorno de aba realmente oculta/frozen. Não foi executado freeze/thaw controlado por CDP. A fixture integrada possui dados diferentes da fixture isolada de vendas. A comparação deve usar o mesmo percurso e o mesmo conjunto dentro de cada ambiente, sem combinar seus valores absolutos. O cenário integrado não capturou trace que decomponha individualmente layout, paint e composição; o React Profiler e os tempos de evento são evidência complementar, não substituem essa decomposição.
