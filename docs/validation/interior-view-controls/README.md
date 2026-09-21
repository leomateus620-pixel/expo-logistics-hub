# Controles de visualização interna — Fenasoja

Implementação sobre `eee1fc0d90db0640c003050070c9a79f0928b7a3` (`origin/main`, após as correções dos Pavilhões 3 e 14). O checkout original estava em `853ce1e7`; a integração foi revalidada na versão atual antes da edição.

## Comportamento entregue

Três botões HTML: Vertical, Horizontal e Aproximar lotes. O registro oficial define explicitamente o eixo local de leitura de cada planta, inclusive a quase quadrada B2. A orientação inicial permanece a oficial; somente um comando explícito altera a orientação. O enquadramento usa o envelope completo, o retângulo do Canvas e as obstruções reais (painel, controles e sidebar). A inspeção prioriza o lote selecionado, o alvo manual válido e o centro dos lotes, nessa ordem; calcula a distância pelas dimensões dos módulos e viewport e preserva a direção corrente.

O comando contém entidade, ação e sequência monotônica. Somente o CameraRig persistente aplica a posição, alvo e projeção, usando o protocolo InteriorCameraRequest. A última solicitação substitui a anterior; IDs incompatíveis são ignorados. Não há novo OrbitControls, Canvas, câmera, rota pública ou acesso ao Pavilhão 7. Os presets externos não são usados pelos botões. Seleção, contexto de retorno, geometrias, IDs, áreas, dados comerciais e associações de gestos são preservados.

Os rótulos são recalculados por mudança discreta de orientação, com descarte das texturas anteriores; não há atualização por frame nem cache acumulativo. A apresentação de entrada, inclusive a rotação específica do Pavilhão 14, mantém o caminho anterior. Os botões têm área mínima de 44px, foco visível, nomes acessíveis e safe areas. O contêiner permite eventos no mapa fora dos botões.

## Causas confirmadas

1. **Limite de pan mudava a direção da câmera.** O código limitava apenas o alvo, deixando a posição para trás. Reproduzido na base B6 após três arrastos, apesar de rotação desabilitada: a planta girou e saiu do enquadramento. A correção aplica o mesmo deslocamento ao alvo e à posição. O teste com OrbitControls real repete 100 deslocamentos e compara a direção. [Base](baseline-pan-same-viewport.png), [correção](candidate-pan-stable.png), [dados base](baseline-pan-performance.json), [dados novos](candidate-pan-performance.json).
2. **Identidade de objeto disparava reenquadramento.** Uma clonagem dos dados equivalentes recriava interiorFrame e iniciava outro voo. A decisão agora compara uma chave de geometria, separada de comandos e viewport. A atualização equivalente no navegador manteve a mesma sequência e pose. [Evidência](data-refresh-stability.json).
3. **Sincronização dos marcadores HTML sob demanda.** O controlador passava a pose depois dos consumidores de projeção; uma vista estabilizada podia manter marcadores na projeção anterior. A câmera agora atualiza depois do OrbitControls e antes dos rótulos, com um frame final para sincronização. As capturas finais abaixo foram revistas após essa alteração.

As transições dos atalhos interpolam raio, ângulo polar e azimute pelo menor caminho, evitando cruzar o polo da vista superior. O tratamento existente de cancelamento, damping, perda de captura e blur foi reutilizado. Não foi confirmada corrupção das matrizes dos módulos ou perda de contexto WebGL; não atribuímos os relatos a essas hipóteses.

## Evidência visual final

Capturas do Canvas de produção com fixture canônica local. Os preços da fixture são fictícios e o acesso ao backend é interceptado localmente.

| Ação | Desktop 1366 × 768 | Chromium estreito 390 × 844 |
|---|---|---|
| Vertical | [Imagem](final-desktop-vertical.png) | [Imagem](final-mobile-vertical.png) |
| Horizontal | [Imagem](final-desktop-horizontal.png) | [Imagem](final-mobile-horizontal.png) |
| Aproximar lotes | [Imagem](final-desktop-inspect.png) | [Imagem](final-mobile-inspect.png) |

Outras evidências: [seleção do lote 79 no P14](mobile-B2-selected.png), [P14 em paisagem com painel](landscape-B2-selected-horizontal.png), [aproximação em paisagem](landscape-B2-selected-inspect.png), [retorno ao parque](return-to-park.png).

## Matriz dos oito pavilhões

`C` = comando executado na cena real e pose registrada em desktop/retrato; `U` = teste automatizado de geometria, projeção e invariantes. A matriz não representa testes físicos em celulares. As imagens `desktop-B*-*` e `mobile-B*-*` são capturas intermediárias; algumas foram limitadas pelo retângulo de captura do navegador. Para inspeção visual final, usar as seis imagens `final-*` acima.

| Pavilhão | ID oficial | Eixo local | Entrada igual à base (desktop) | Vertical D/M | Horizontal D/M | Aproximar D/M | Geometria/seleção/retorno |
|---|---|---|---|---|---|---|---|
| 1 | B1 | z | quaternion igual | C/U | C/U | C/U | U |
| 3 | B6 | z | quaternion igual | C/U | C/U | C/U | U + gestos reais |
| 5 | B8 | z | quaternion igual | C/U | C/U | C/U | U |
| 7 | B10 | x | quaternion igual | C/U | C/U | C/U | U; acesso existente |
| 8 | B4 | z | quaternion igual | C/U | C/U | C/U | U |
| 12 | B3 | x | quaternion igual | C/U | C/U | C/U | U |
| 13 | B5 | z | quaternion igual | C/U | C/U | C/U | U |
| 14 | B2 | z explícito | quaternion igual | C/U | C/U | C/U | U + seleção/painel reais |

[64 registros de entrada e ações](visual-matrix.json), [oito entradas do commit-base](baseline-entries.json). Os testes de enquadramento cobrem desktop, retrato e paisagem nos oito IDs; verificam cantos dentro da área útil, eixo correto, repetibilidade e geometria inalterada. A seleção e o contexto de retorno têm testes de estado; seleção real com painel foi exercitada no P14, não em cada lote dos oito pavilhões.

## Estresse e recuperação

- B6: 20 ciclos completos Vertical → Horizontal → Aproximar, total 60 ações após três de aquecimento. Nenhum erro de contexto, pose não finita ou controle retido nas amostras. [Registro](desktop-B6-stress.json).
- Interrupção em voo: fixture observou `running`, enviou wheel ao Canvas e blur; resultado `cancelled`, mesma orientação, controles habilitados, `cameraNavigating=false`, um controle ativo e um renderer. É um evento sintético pela fixture, além dos arrastos reais executados no navegador. [Registro](in-flight-cancellation.json).
- Troca rápida B1 → B6: alvo final B6 e controles liberados. [Registro](rapid-switch.json).
- Atualização dos dados equivalentes não reiniciou a câmera. [Registro](data-refresh-stability.json).
- Abrir painel, selecionar lote, orientar/aproximar e alternar retrato/paisagem: P14, com lote 79 preservado.
- Sair: interior nulo, barra ausente, controle habilitado e transição `interior-return` concluída. [Registro](return-to-park.json).
- Cancelamento de ponteiro, liberação fora do Canvas e blur: cobertura da suíte existente de transições. Não se afirma validação física multitouch ou sequência real de troca de aba em todos os oito interiores.

## Desempenho medido

Mesmo computador Windows, Intel i5-1035G1, aproximadamente 8 GB RAM, Intel UHD, Chrome/ANGLE D3D11 WebGL2, Three r170. Servidores Vite locais, recursos aquecidos, componentes reais e dados canônicos da fixture. Não são medições de produção, tráfego real ou cold start. O Windows indicou `prefers-reduced-motion: reduce`; a duração programada dos atalhos foi 120ms (limite normal 320ms).

Comparação pareada: B6, viewport 1366 × 768, Canvas CSS 1351 × 724, framebuffer 972 × 521, DPR efetivo 0,72; três arrastos iguais (700,300 → 1100,480).

| Métrica | Base | Alteração |
|---|---:|---:|
| Frames amostrados | 28 | 28 |
| Intervalo médio entre frames | 1013,31ms | 1013,99ms |
| p95 do intervalo | 1017,0ms | 1017,5ms |
| Intervalos acima de 250ms | 28 | 28 |
| Commits React registrados | 11 | 10 |
| Geometrias/texturas ao final | 6 / 3 | 6 / 3 |
| Direção após arrastos | girou indevidamente | preservada |

Na sequência de 60 comandos: resposta handler → início de transição mediana 5,7ms, p95 11,5ms, máximo 12,4ms. Isso **não é input-to-photon**. Duração observada mediana 1004,85ms, p95 1013,8ms (979,8–1059,5ms), apesar dos 120ms programados. Recursos aquecidos antes/depois: geometrias 6 → 6, texturas 3 → 3, programas 186 → 186; heap observado 158.577.114 → 155.808.367 bytes, sujeito a GC. O retorno ao parque em outra amostra levou 7671,2ms e inclui reativação da cena externa.

**Limitação material:** a sessão de navegador controlado apresentou cadência próxima de 1 Hz tanto na base quanto na alteração. Não permite certificar fluidez, tempo visual de 120–320ms ou ausência de regressão de desempenho. Os números acima são os observados; o comparativo precisa ser repetido em navegador foreground sem essa limitação e em aparelhos físicos. O plateau de recursos vale para os 20 ciclos medidos, não é prova de ausência absoluta de vazamento.

## Testes e build

- 37 testes novos de comandos, eixo, frustum, inspeção, limites, pan, transição, estado e UI: passaram.
- 14 testes existentes de transições: passaram.
- Testes de apresentação dos Pavilhões 1, 3, 5, 8, 12, 13 e 14 e enquadramento oficial: passaram.
- Rodada final ampliada: 37 arquivos, 33 passaram; **308/321 testes passaram, 13 falharam**. [Resultado detalhado](tests-final.json).
- As mesmas 13 falhas foram reproduzidas no commit-base: ContextualLegend (1, total 1577 versus 1579), PavilionFourSoyKitchen (1, limite de posição), PavilionModuleCard (9, falta QueryClientProvider), PavilionWayfinding (2, expectativas textuais do fonte, incluindo CRLF no Windows). Não foram alteradas regras comerciais para mascarar essas falhas.
- `npm run typecheck`: passou.
- ESLint nos arquivos alterados: zero erros; um aviso de Fast Refresh na entrada QA local.
- `npm run build`: passou, 55,19s; avisos de chunk acima de 500KB e Browserslist antigo já presentes.
- `git diff --check`: passou.

Para repetir: `npx vite --config scripts/interior-controls-qa.config.ts`, abrir `http://127.0.0.1:4201/scripts/pavilion-plan-qa.html?pavilion=B6`. O seletor local inclui os oito IDs. Ferramentas QA fornece atualização de dados, medição, 20 ciclos e interrupção em voo. A fixture não faz parte das rotas de produção.

## Arquivos de implementação

- `components/InteriorViewControls.tsx` e `interior-view-controls.css`: barra e observação das obstruções.
- `components/canvas/CommercialMapCanvas.tsx`: único consumidor de comandos, transições, pan e viewport.
- `components/canvas/CommercialPavilionInteriorScene.tsx`: geometria estável, registro e orientação dos rótulos.
- `components/canvas/CommercialPavilionModuleLayer.tsx`: rótulos legíveis por orientação discreta.
- `hooks/useInteriorCameraRequest.ts`: extensão compatível do protocolo.
- `state/useCommercialMapStore.ts`: comando identificado, sem limpar seleção/retorno.
- `utils/interiorView.ts`: cálculos puros e estabilização do pan/orbita.
- `utils/commercialPavilions.ts`: eixos locais explícitos.
- `utils/contextualViewport.ts`: área útil compartilhada.
- `src/test/commercialMapInteriorView.test.tsx` e `commercialMapPavilionRendering.test.ts`: cobertura comportamental e regressão.
- `scripts/pavilion-plan-qa.tsx`, `scripts/interior-controls-qa.config.ts`, `.gitignore`: reprodução local isolada.

Os caminhos abreviados de implementação acima são relativos a `src/features/commercial-map/`. Arquivos canônicos de geometria e dados comerciais não foram modificados. A alteração automática de `supabase/functions/mcp/index.ts` feita pelo plugin de build foi excluída da entrega.

## Pendências de validação

PR em rascunho para revisão do código e das evidências. Antes de liberar, repetir fluidez e duração visual sem a cadência limitada da automação; executar Safari/iPhone e Android físicos, incluindo multitouch, barras do navegador, troca real de abas e toda a matriz de seleção/retorno por pavilhão. Não houve merge nem deploy nesta tarefa.
