# Portal, preparação e paridade de qualidade

Esta revisão integra o aperfeiçoamento de desempenho solicitado durante a implementação do Modo Visita. A definição final de qualidade preserva o conteúdo canônico em todos os perfis: vegetação, infraestrutura, arquitetura, materiais, efeitos e ações não dependem da capacidade do hardware. DPR, resolução de sombras, cadência e agendamento permanecem adaptativos. O controle manual de camadas e os escopos autorizados continuam independentes dessa política.

## Fluxo e propriedade

O Portal admite trabalho somente após resolver autenticação, organização e `map.view`, com oportunidade de apresentar sua própria interface. O scheduler compartilha loaders, query e worker; intenções de ponteiro, foco ou toque promovem o trabalho existente. Não há Canvas, renderer nem contexto WebGL especulativo. A consulta mantém a chave por usuário/organização/escopo, a projeção comercial, o serviço de preços e a revalidação de 30 segundos. Seu cache de 10 minutos fica somente na memória. Revogação cancela/remove a identidade exata. [Detalhes e testes](../../commercial-map-portal-prewarm.md).

Cada operação captura seu próprio recorder. `portal-prewarm:*` nunca inicia nem encerra o boot da rota. O relógio real começa na ativação da rota; o tempo desde a navegação do documento é publicado separadamente. Uma conclusão antiga não encerra o boot seguinte. Um cleanup da página anterior também não pode encerrar o boot de uma rota lazy recém-iniciada.

O renderer é criado somente no mapa. O warmup mantém a barreira real de apresentação: deduplica programas por material e atributos relevantes, preserva variantes de instancing/morph/cor e espera todos os programas de materiais compartilhados. A reflexão de uniforms/atributos é preparada em lotes que cedem a thread; as texturas são inicializadas em pequenos lotes **depois** do linking, incluindo uniforms compilados por `onBeforeCompile`. A cena original não é reparentada. Tone mapping, color space e render target são restaurados. A preparação posterior, a recuperação de contexto e o loop sob demanda permanecem no pipeline existente.

O perfil de CPU do build `7979ecaa` isolou uma sincronização de aproximadamente 5.139 ms em `setPixelRatio → setSize`: o enquadramento inicial ativava o orçamento de gesto enquanto o driver ainda preparava programas. A correção adia somente alterações adaptativas de DPR até a apresentação estar pronta e os programas terminarem. Resize real continua sob responsabilidade do R3F. O pedido mais recente é preservado e o estado de gesto é reavaliado ao aplicar; nenhum conteúdo é retirado.

Um probe GL opt-in, sem consultas adicionais ao driver, identificou seis programas novos no primeiro desenho: cinco variantes `MeshStandardMaterial` com `bumpMap` instalado por efeitos passivos de pavilhões e uma variante `LineMaterial` cuja define era adicionada depois da criação da chave de cache. A correção prepara os atributos que definem o shader antes do snapshot do warmup. Os tempos do profiler/probe são diagnósticos e ficam separados das rodadas de benchmark. A espera assíncrona de linking não equivale a tempo GPU isolado, e antecipar o trabalho não demonstra redução de latência sem a medição posterior.

O probe posterior (`b49524f3`) confirmou zero novos programas entre a preparação e o primeiro desenho, com intervalo diagnóstico de 76,9 ms. Entretanto, identificou outro bloqueio: a reflexão de um programa pronto esperava por outro ainda em linking, por 5.652,3 ms. `015939d3` exige que todos os programas capturados estejam prontos antes de começar a reflexão em lotes. O cancelamento continua liberando o contador. [Diagnóstico resumido](evidence/final/shader-first-draw-diagnostic.json).

O mesmo commit reinicia o warmup do avatar após recuperação de contexto, cancela preparações antigas e mantém a posição exterior. Imports de rotas também capturam seu recorder antes de `await`; conclusão de uma abertura antiga não publica etapas na sessão seguinte.

## Auditoria anterior

Build QA do commit `046e538f`, Chrome 153 headless, Windows, Intel UHD/ANGLE D3D11, viewport 1440×900, DPR 1, Canvas 1425×772, fixture local e navegador/contexto novo por rodada. Caches do sistema operacional e do driver não foram limpos. Não havia build nem outro ensaio GPU concorrente. Os dados abaixo não incluem autenticação ou consulta comercial remota.

| Rodada | Documento → interativo | Ativação da rota → interativo¹ | Cena | Shaders diretos | JS do compile |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 13.161 ms | 12.709 ms | 3.617 ms | 5.579 ms | 283,1 ms |
| 2 | 13.485 ms | 12.922 ms | 3.826 ms | 5.592 ms | 277,7 ms |
| 3 | 13.042 ms | 12.529 ms | 3.658 ms | 5.569 ms | 291,5 ms |

¹ O código anterior usava origem zero na primeira abertura. O intervalo comparável da rota foi reconstruído subtraindo sua marca `module-requested`; uma correção do relógio não é ganho de performance. Spans se sobrepõem e não devem ser somados. Cada primeira apresentação tinha 792 chamadas, 671.884 triângulos, 556 geometrias, 102 texturas e 100 programas. O primeiro draw ainda produzia uma tarefa longa de 1.789–1.848 ms após o link dos shaders. [Amostras brutas](evidence/startup-before-prewarm.json.gz).

## Método da comparação

`startup-matrix.cjs` mede abertura direta, clique imediato, preparação concluída, intenção com 1,5 s de antecedência e reabertura SPA. O ponto final exige `first-interactive` e saúde de renderização `ready`, seguido de gesto e nova verificação. O ensaio de prewarm exige zero chamadas de criação de contexto WebGL e zero Canvas antes do clique. Não antecipa a marca de prontidão nem altera o loader.

A rota de diagnóstico utiliza o scheduler, loaders, worker, controle de entrada e renderer reais, com dados públicos de fixture. O cache produtivo tem testes com QueryClient; a execução gráfica local não certifica a latência desse observer nem da rede privada. A comparação precisa ser repetida com contas autorizadas em homologação para afirmar o SLA do Portal real. Três rodadas fornecem apenas uma amostra exploratória; p95 por nearest rank com n=3 é o máximo observado, não uma estimativa da cauda de produção.

`quality-parity.cjs` fixa HIGH/MEDIUM/LOW na mesma câmera e realiza 20 trocas. Registra inventário, UUIDs de materiais, lifecycle, DPR, sombras, programas, texturas, geometrias e caminho do compositor, além de janelas de frames e capturas. Inventário de árvores comerciais e entidades é separado dos planejadores de vegetação procedural, que possuem testes próprios de IDs, poses e espécies. Mesmas contagens não substituem inspeção visual.

## Limites da certificação

Viewport touch no Chromium/Intel UHD verifica layout, gestos sintéticos e esse renderer; não representa GPU, aquecimento, Safari ou toque físico de iPhone/Android. Heap JS após GC não mede RAM do processo nem memória GPU integral. A meta de clique pré-aquecido → mapa interativo p95 ≤3 s permanece uma condição a medir, não uma consequência presumida do prewarm.

## Matriz desktop intermediária — b49524f3

Três rodadas por cenário, sem profiler nem probe GL. Valores de ativação da rota para abertura direta e de clique para os demais. O fim é a apresentação interativa inicial pelo caminho direto; a hidratação completa com pós-processamento não foi medida nestas 15 amostras.

| Cenário | Mediana | Mínimo–máximo | Maior tarefa longa registrada |
| --- | ---: | ---: | ---: |
| A: abertura direta | 12.483 ms | 12.333–14.004 ms | 696 ms |
| B: clique imediato no Portal | 12.807 ms | 12.774–13.136 ms | 725 ms |
| C: preparação concluída | 12.659 ms | 11.557–12.741 ms | 6.287 ms |
| D: intenção com 1,5 s | 11.890 ms | 11.478–12.078 ms | 678 ms |
| E: reabertura SPA | 4.963 ms | 4.867–7.426 ms | 3.537 ms |

As consultas de readiness/reflexão explicam a diferença entre C e A/B/D no diagnóstico posterior. As amostras mostram por que não se extrapola a melhora das primeiras rodadas para todos os cenários. O warmup continua necessário no renderer real; o prewarm não cumpriu três segundos nesta máquina. O catálogo completo e os efeitos permanecem ativos. [Matriz bruta](evidence/final/startup-desktop-b49524f3.json.gz).

## Repetição de C com barreira de linking — 015939d3

Três novas execuções sem profiler/probe: **11.718,5 / 11.258,3 / 12.009,9 ms** desde o clique. Mediana 11.718,5 ms e máximo/p95 amostral 12.009,9 ms. As três responderam ao gesto com mudança real de câmera. As maiores tarefas longas foram **4.052 / 4.024 / 4.096 ms**; ainda há bloqueio relevante de entrada. A cena mediu 3.629–3.708 ms, linking/preparação direta 6.202–6.920 ms e upload 790–805 ms. Spans sobrepostos não devem ser somados.

O primeiro desenho mantém 99 programas. Essas três amostras não comprovam ganho causal sobre a mediana anterior, nem p95 de produção. Demonstram que a meta de três segundos permanece não atendida e que remover recompilação tardia não remove o custo de montar/preparar o parque. [Repetição bruta](evidence/final/startup-delivery-prewarmed.json.gz).

Nos três registros, a tarefa de aproximadamente quatro segundos abrange a montagem crítica e a submissão inicial de compile, antes de `program-links-ready`. Depois dessa marca, a reflexão levou 164–190 ms de CPU no total, repartida em 49 lotes; a maior chamada/lote ainda levou 125–153 ms. Uma chamada síncrona do driver não pode ser interrompida pelo limite do scheduler. Os eventos demonstram redução do bloqueio de reflexão nesta amostra; não demonstram eliminação de toda pausa de startup.
