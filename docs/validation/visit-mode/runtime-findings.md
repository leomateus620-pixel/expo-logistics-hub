# Modo Visita — leitura das evidências de execução

Revisão de 22/09/2026, baseada nos JSONs existentes; esta revisão não executou navegador, build ou testes. `route.json`, `cycles.json` e `quality-parity-desktop.json` pertencem ao build `e444e91e`; `endurance.json` pertence ao build `7979ecaa`. Os respectivos manifests estão em `evidence/final/qa-manifest-*.json`. Os números abaixo não devem ser atribuídos automaticamente a um build posterior.

O ambiente registrado é Windows, HeadlessChrome 153, Intel UHD via ANGLE/D3D11, viewport desktop de 1.440 × 900 e área CSS do Canvas de 1.425 × 772. O harness usa a rota local de diagnóstico `__dev/commercial-map-rendering?persistedStage=1`. São cenários com dados de referência, sem evidência de autenticação, tráfego de produção, iPhone, Safari ou Android físico nestes quatro arquivos.

## Percursos regionais — e444e91e

[route.json](evidence/final/route.json) registra nove pontos iniciais independentes, seguidos de caminhada contínua dentro de cada trecho. Cada trecho contém comandos de avanço, deslocamento lateral com corrida, rotação e avanço correndo; não é uma única caminhada ininterrupta entre todas as regiões. As janelas de frames ativos cobrem aproximadamente 17,1–19,7 s por trecho. Todos os snapshots finais estão em terceira pessoa, DPR 0,9 e perfil BALANCED.

| Região | FPS médio | p95 / p99 (ms) | Maior intervalo de apresentação (ms) | Draw calls no snapshot |
| --- | ---: | ---: | ---: | ---: |
| Entrada | 43,65 | 29,4 / 35,8 | 87,3 | 769 |
| Brasília | 45,25 | 24,3 / 30,6 | 59,2 | 393 |
| Exporural | 43,24 | 24,3 / 25,5 | 164,3 | 436 |
| ICS | 43,85 | 23,9 / 26,0 | 96,0 | 346 |
| Pavilhão | 50,80 | 20,7 / 35,8 | 83,3 | 321 |
| Restaurante | 47,84 | 21,7 / 22,9 | 84,6 | 327 |
| Sede | 42,17 | 25,8 / 27,7 | 98,7 | 209 |
| Arena | 50,53 | 20,6 / 22,2 | 82,1 | 125 |
| Exterior | 56,99 | 18,8 / 26,5 | 71,9 | 162 |

A liberação de controle levou 3,72–5,02 s desde o pedido, incluindo preparação/transição. Houve 1–4 intervalos acima de 50 ms por trecho e um frame ativo sem apresentação registrado em cada trecho. Portanto, as médias acima de 30 FPS não significam ausência de picos nem cumprimento constante de 60 FPS. Os snapshots exibem 0–1 card contextual, `ready`, zero perdas de contexto e nenhum `pageerror` capturado. Os recursos variam com a região: 569–623 geometrias, 131–137 texturas e 222–227 programas; isso, isoladamente, não mede vazamento. Os apoios finais registrados são ICS 0,13, Restaurante 0,03, Sede 0,032 e trecho Brasília 0,0565; os JSONs numéricos não substituem inspeção das capturas.

## Vinte entradas e saídas — e444e91e

[cycles.json](evidence/final/cycles.json) alterna primeira/terceira pessoa, anda 1,2 s em cada visita e solicita GC explícito pelo CDP após cada saída. Em todos os 20 retornos, posição, quaternion, alvo, matriz de projeção, IDs de cena/câmera e DPR coincidem exatamente com `before`. Canvas, renderer e controles continuam com uma criação e uma instância ativa. O perfil volta a HIGH; personagem/visita ficam nulos e não resta card.

Cada retorno mantém exatamente 612 geometrias, 131 texturas, 224 programas, 686 materiais, 1.478 objetos e 375 listeners de objetos Three/OrbitControls. Os contadores CDP mantêm um documento, 561 nós DOM e 352 listeners JavaScript. As visitas curtas registram 41,58–50,06 FPS, com maior intervalo de apresentação de 68,1 ms; essas janelas incluem a transição e não equivalem a um benchmark longo de caminhada.

O heap V8 usado após GC nos ciclos 16–20 foi **60.020.672; 59.877.840; 60.261.836; 60.091.840; 59.956.684 bytes**. A janela oscila 383.996 bytes, termina 63.988 bytes abaixo do ciclo 16 e tem inclinação linear de +8.602,4 bytes/ciclo. Do ciclo 1 ao 20, o saldo é +760.628 bytes. Não há crescimento monotônico nessa amostra; tampouco ela comprova ausência de vazamento por tempo indefinido ou estabilidade de RAM/VRAM do sistema operacional. Saúde pronta, zero perdas de contexto e zero erros capturados nos 20 ciclos.

## Permanência aproximada de cinco minutos — 7979ecaa

[endurance.json](evidence/final/endurance.json) executa avanço/recuo repetidos na região Brasília, alternando caminhada/corrida e câmeras. O último snapshot registra 311,04 s desde o pedido de entrada e 627,95 m de distância acumulada; não é uma travessia de 628 m distintos pelo parque.

| Snapshot nominal | FPS médio | p95 / p99 (ms) | Draw calls | Heap observado (bytes) |
| --- | ---: | ---: | ---: | ---: |
| Minuto 1 | 41,98 | 28,2 / 43,9 | 365 | 119.843.690 |
| Minuto 2 | 48,62 | 25,7 / 34,3 | 293 | 137.263.344 |
| Minuto 3 | 52,80 | 20,4 / 21,9 | 212 | 122.362.842 |
| Minuto 4 | 58,95 | 18,5 / 23,6 | 201 | 125.847.503 |
| Minuto 5 | 59,40 | 18,2 / 21,9 | 163 | 124.172.137 |

O sampler usa no máximo os últimos 3.600 intervalos de frames ativos: as linhas se sobrepõem e não são médias independentes de cada minuto nem a média integral de cinco minutos. Os intervalos acima de 50 ms são 15/4/3/7/3 dentro dessas janelas e não devem ser somados. O maior intervalo de apresentação da sessão é 148,4 ms, sem frames ativos não apresentados. DPR 0,85 e perfil PERFORMANCE nos cinco snapshots; geometrias/texturas/programas permanecem em **581/132/222**. A redução de draw calls acompanha mudanças de enquadramento; não demonstra ganho causal da qualidade adaptativa. Os heaps acima não são medições após GC forçado.

A saída restaura exatamente câmera, alvo, projeção, DPR e identidade das instâncias. Entretanto, `before → after` registra geometrias **557 → 577**, listeners Three **332 → 347** e programas **223 → 222**; texturas retornam a 131, materiais a 686 e objetos a 1.478. Essa primeira exploração retém recursos em relação ao estado inicial, apesar do patamar estável durante a visita. Não deve ser descrita como restauração exata de toda a memória. Não houve erro capturado ou perda de contexto.

## Paridade técnica desktop — e444e91e

[quality-parity-desktop.json](evidence/final/quality-parity-desktop.json.gz) registra 20 alternâncias HIGH/MEDIUM/LOW na mesma vista aérea, fora da caminhada. Todas passam os comparadores de inventário, UUIDs de materiais, lifecycle, tier aplicado e caminho `post`. Permanecem 1.691 entidades de origem, 376 apresentadas nessa vista, 1.579 lotes e 271/271 árvores comerciais; 686 materiais, 559 geometrias, 131 texturas, 223 programas, 813 draw calls e 672.543 triângulos nos snapshots. DPR permanece 1; resolução de sombra varia entre 2.048/1.536/1.024.

Somente as **três primeiras trocas** possuem janelas novas de aproximadamente 10 s, com frames forçados: HIGH **33,32 FPS**, MEDIUM **33,56 FPS**, LOW **33,53 FPS**; p95 **30,7/30,5/31,3 ms**, p99 **31,1/31,2/32,5 ms**, máximos **32,2/31,5/36,8 ms**. As linhas 4–20 reutilizam o último trace por desenho do harness e servem para comparar paridade/recursos, sem 17 novos benchmarks de FPS. São janelas exploratórias curtas na vista aérea; não representam FPS mobile ou teste A/B de caminhada. Não houve erro capturado ou perda de contexto. Igualdade de inventário e materiais não comprova identidade pixel a pixel.

## Revisão estática complementar

Foram relidos `VisitInputManager`, HUD, controlador, colisão, grounding, câmera e ciclo de vida. Não foi identificado novo defeito funcional reproduzível nessa leitura. Permanecem limites explícitos: colisores arquitetônicos aproximados, copas conservadoras para câmera, interiores por inspeção existente sem caminhada livre e guarda de Pointer Lock legado limitada a 5 s após teardown; solicitações baseadas em promise mantêm proteção mesmo após essa janela. Esta leitura não substitui execução de touch físico, sessões autenticadas nem validação de todos os cantos do parque.

## Touch, interior e foco — 015939d3

O build final foi exercitado em quatro viewports com dois contatos simultâneos enviados pelo CDP. Corrida fica alternável, sem exigir terceiro dedo. `touchEnd` e `touchCancel` param o movimento; o estado de corrida permanece até encerrar a visita e é reiniciado na próxima. Todos os quatro cenários passaram. Canvas/renderer/controles mantiveram sua identidade, sem erros de página ou perda de contexto. [Dados](evidence/final/mobile.json).

| Viewport CSS | Frames amostrados | FPS médio | p95 / p99 (ms) | Maior intervalo (ms) | Draw calls |
| --- | ---: | ---: | ---: | ---: | ---: |
| 390×844 | 533 | 48,15 | 29,9 / 38,8 | 68,0 | 555 |
| 844×390 | 482 | 45,58 | 31,6 / 53,4 | 76,5 | 785 |
| 320×568 | 515 | 50,30 | 28,5 / 38,4 | 50,0 | 636 |
| 1024×768 | 418 | 37,40 | 37,6 / 48,9 | 111,1 | 689 |

DPR efetivo 0,99 durante movimento. São janelas curtas no Intel UHD, com viewport/toque Chromium emulados, **não FPS de telefone físico**. Os cards expandidos ficaram dentro do Canvas e não intersectaram botões; nas áreas baixas houve rolagem interna (199 px de conteúdo / 118 ou 78 px visíveis). A página de QA possui ferramentas acima do Canvas que restringem sua altura. O lote público de fixture não tem preço oficial resolvido: o ensaio validou nome, área de 896,85 m², situação, segmento e fallback de valor, sem inventar um total. Os valores comerciais numéricos foram verificados nos testes de integração do hook oficial, não por este ensaio autenticado inexistente.

O roteiro final de sede/interior/noite/foco também passou. Interior é aberto por ação explícita e volta ao mesmo exterior; a janela noturna ficou em **38,73 FPS**, p95 29,9 ms, p99 31,4 ms, 267 draw calls e maior intervalo de 113,5 ms. Na pausa, `document.hasFocus()` foi realmente falso e a posição ficou idêntica nas duas leituras; o retorno estava parado. O harness desativa a emulação de foco forçado do Playwright antes de abrir outra aba. Não simula `blur` nem substitui `hasFocus`. [Dados](evidence/final/checks.json).

A revisão posterior encontrou e corrigiu uma condição de recuperação durante o warmup do avatar, além da contaminação de telemetria por imports antigos; portanto a revisão estática anterior não deve ser interpretada como prova de ausência de defeitos.

## Recuperação e paridade mobile — 015939d3

Os dois ensaios de perda deliberada via `WEBGL_lose_context` passaram: durante caminhada a posição variou **zero**; durante `loading`, a preparação foi cancelada e reiniciada. Depois da restauração, movimentos novos percorreram 2,33 m e 2,55 m, respectivamente. Canvas, renderer e OrbitControls permaneceram com uma criação e uma instância ativa, sem erro de página. A recuperação observada usou o caminho direto; isso não comprova que todos os efeitos já estivessem preparados naquele instante. [Caminhada](evidence/final/context-recovery.json), [entrada](evidence/final/context-entry-recovery.json).

Uma tentativa de preparar esse ensaio excedeu **180 s aguardando hidratação**, antes da perda de contexto. A repetição com acompanhamento concluiu: aos 100,75 s estava no caminho `post`, preparando o módulo de física. A causa do timeout não foi isolada; ele permanece pendência de estabilidade do carregamento, e não foi descartado dos resultados.

As 20 trocas de qualidade em viewport mobile preservaram inventário, materiais, instâncias e efeitos, sem erros. Mantiveram 802 draw calls, 625.495 triângulos, 547 geometrias, 131 texturas e 222 programas. Nas três janelas novas de 10 s: HIGH **33,58 FPS** (DPR 1,75), MEDIUM **26,23 FPS** (1,35), LOW **33,40 FPS** (1); p95 **32,6 / 47,2 / 39,7 ms**. O resultado MEDIUM abaixo de 30 FPS é uma observação desfavorável, não aprovação de desempenho mobile. Não há base para atribuir causalidade somente ao tier em uma janela por perfil. As outras 17 linhas verificam paridade, sem novas janelas de FPS. [Paridade mobile](evidence/final/quality-parity-mobile.json.gz).

Nessa abertura mobile separada, a primeira apresentação interativa foi 13.353 ms após ativação e o span de hidratação secundária 23.860 ms. O término observado completo está preservado em [boot-complete-mobile.json](evidence/final/boot-complete-mobile.json). Os resultados mostram variabilidade importante; a PR permanece em rascunho e não certifica os limites solicitados.
