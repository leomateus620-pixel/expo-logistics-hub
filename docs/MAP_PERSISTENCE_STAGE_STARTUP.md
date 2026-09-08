# Correção de persistência, orientação Lactalis e abertura do mapa

Base: `5172b605` (PR #136, já integrada). Trabalho em `codex/map-persistence-stage-startup`.

## Por que as estruturas não apareciam

As capturas da PR #136 renderizavam a referência local. O mapa autenticado preserva os registros do banco e não substitui suas geometrias por essa referência. No Cloud do projeto Fenasoja, a revisão persistida era `2026.4`: E-07 estava arquivado pela limpeza estrutural, enquanto RES-A9 e RUA-MONTEVIDEU-COZINHA não existiam. Integrar a PR não havia aplicado a migração de infraestrutura.

A migração `20260908010000_soy_restroom_gate9_infrastructure.sql` foi ensaiada no banco real com `BEGIN`/`ROLLBACK` e depois aplicada com sucesso pelo editor SQL do Lovable em 08/09/2026. E-07 voltou ao estado ativo com geometria versão 2; a versão anterior permanece no histórico. Os dois novos registros estão ativos, não comerciais e com geometria versão 1. RES-A9 contém exatamente três reservatórios. Não houve sincronização geral da referência nem alteração de regras comerciais ou permissões.

Os hashes antes/depois de **todos os demais registros**, **suas geometrias** e **todos os lotes comerciais** permaneceram idênticos. Evidências: [antes](screenshots/map-startup/database-before.txt) e [depois](screenshots/map-startup/database-after.txt). A revisão geral do projeto não foi artificialmente promovida: outras diferenças antigas não foram sobrescritas.

A busca, a lista, a seleção e o foco foram conferidos também em `fenasojagestao.com/mapa-comercial`. As capturas reais mostram [o banheiro com as duas entradas](screenshots/map-startup/live-restroom-after.png) e [os três reservatórios ao lado do Portão 9](screenshots/map-startup/live-gate9-after.png). O grupo B28 junto à cozinha foi preservado. O histórico do Lovable exibia mensagens de build malsucedido/prévia desatualizada; a presença dos novos modelos na aplicação publicada após a correção do banco confirma que o código de infraestrutura já estava disponível. Não foi necessário substituir ou republicar o site para esses três registros reaparecerem.

## Palco: giro autorizado com âncora preservada

O usuário autorizou a redução da implantação visual de B13. A frente local é +Z, o eixo vertical é Y e o grupo pai apenas translada. O giro usa `atan2(alvo.x - centro.x, alvo.z - centro.z)`, tendo como alvo o ponto médio dos centros dos identificadores **Q-D-11 e Q-D-12 da Quadra D**, conferidos tanto na referência quanto no banco.

A referência local e o banco têm âncoras diferentes para B13. Isso passou a fazer parte dos testes e da validação visual: o renderer calcula a orientação a partir do centro efetivamente carregado. Não move o palco do banco para o centro da referência.

| Origem | Centro X/Z | Orientação |
| --- | --- | --- |
| Referência local | 16,472727 / 12,807273 | −78,296941° |
| Banco real | 16,189091 / 13,090909 | −81,235400° |
| Alvo comum D11/D12 | 11,943636 / 13,745455 | — |

A redução uniforme de largura e profundidade é calculada por contenção do envelope completo de cobertura, calhas e acesso entre a Rua Uruguai e a sede B12, mantendo a folga lateral. A redução resultou em 12,8164% na referência local e 24,7698% na geometria persistida; a altura arquitetônica permanece 1,82 unidade. Telhado, pilares, palco, fechamento, equipamentos e placa giram no mesmo grupo. Seleção, destaque e extensão de foco reutilizam o envelope resultante. A etiqueta continua vinculada à âncora da própria entidade.

O estudo anterior permanece como registro histórico na PR #136. As dimensões arquitetônicas continuam sendo interpretações configuráveis, sem alegação de levantamento cadastral. Nenhuma geometria de rua, sede, lote ou posição de árvore foi editada.

## Abertura e travadas iniciais

O perfil de CPU identificou compilação de shaders no primeiro uso como o maior bloqueio. O `<Preload all />` também tornava objetos ocultos visíveis temporariamente e renderizava **seis vistas cúbicas da cena inteira** antes da abertura. Isso gerava trabalho e variantes de shader que não correspondiam necessariamente à apresentação na tela.

A preparação agora usa `compileAsync` para as variantes reais de tela (ACES/sRGB) e composição (linear), sem renderizações cúbicas nem alteração de visibilidade. Em Three r170 as variantes são aguardadas sequencialmente porque a verificação assíncrona usa o programa corrente de cada material. O renderizador restaura imediatamente target, face, mip, tone mapping e color space; seu proprietário de frame aguarda o preparo. A interface exibe uma indicação de preparação até o primeiro frame. O aquecimento dos interiores continua compartilhado e sem duplicação por seleção. Materiais, iluminação, texturas, DPR inicial e câmera inicial permanecem iguais.

A própria telemetria DEV executava consultas síncronas de GPU durante a compilação, provocando outro bloqueio. Agora aguarda o preparo e guarda a identificação da GPU uma vez por renderer. Falhas de compilação liberam a renderização para o mecanismo existente de diagnóstico/recuperação; a restauração de contexto refaz o preparo.

### Medição controlada da abertura

Chrome headless no computador Windows, GPU Intel UHD via ANGLE/D3D11, viewport 1366 × 768, buffer 1351 × 695, DPR 1, tier HIGH, mesma câmera e dados da página DEV. Processos do navegador separados, sem build/teste concorrente no par final. O cache do driver não foi apagado. Inclui carregamento de módulos DEV e não representa o tempo de rede da aplicação de produção ou de um celular físico.

| Medida | Antes | Depois |
| --- | ---: | ---: |
| Primeiro frame confirmado | 23.294 ms | 17.933 ms |
| Maior tarefa bloqueante da abertura | 19.092 ms | 4.140 ms |
| Maior tarefa após o primeiro frame, janela de 12 s | 1.801 ms | 78 ms |
| Draw calls na mesma vista | 871 | 871 |
| Triângulos na mesma vista | 732.425 | 732.425 |
| Geometrias retidas | 622 | 565 |
| Texturas | 147 | 146 |
| Programas | 179 | 173 |
| Heap JS sem coleta forçada | 204,6 MB | 214,5 MB |

Neste par a abertura foi 23% mais rápida e o maior bloqueio caiu 78%. O heap isolado é influenciado pela coleta; a validação de retenção usa ciclos e GC separados. As tarefas residuais de montagem/compilação inicial ainda existem: não se afirma abertura instantânea nem eliminação de toda possível travada em dispositivos distintos. [Antes](screenshots/map-startup/final-before-startup.json), [depois](screenshots/map-startup/final-after-startup.json), [script de perfil](../scripts/soy-gate9/startup-profile.cjs).

## Validação

- TypeScript (`tsc --noEmit -p tsconfig.app.json`), ESLint dos arquivos TS/TSX alterados e build de produção aprovados. O build mantém os avisos conhecidos de chunks grandes e Browserslist antigo.
- 125 testes em 13 suítes passaram: implantação, orientação local/persistida, shader warmup da cena/interiores/seleção, estado de preparação/recuperação, diagnóstico, estabilidade, ambiente, composição, qualidade adaptativa e limites da câmera. Não foi declarada aprovação da suíte global.
- Fluxo desktop: busca, seleção repetida de E-07/RES-A9/B13, foco, pan, zoom nos limites, filtros, entrada e saída de interior, um único canvas, sem overflow ou escrita no backend. [Registro](screenshots/map-startup/functional-desktop.json).

- Mobile emulado em retrato/paisagem: os mesmos fluxos, inclusive pinça com dois toques sintetizados, passaram. [Registro](screenshots/map-startup/functional-mobile.json), [paisagem](screenshots/map-startup/functional-mobile-landscape.png), [seleção do palco](screenshots/map-startup/selected-mobile-B13.png).
- 40 ciclos / 80 transições entre hidrologia e qualidade passaram em 145,6 s. Os quatro grupos de configuração mantiveram geometria/textura/programa constantes entre ciclos 3 e 20, sem erros de renderização ou perda de contexto. [Relatório integral](screenshots/map-startup/stress.json).
- Três voltas de seleção/navegação entre E-07, RES-A9, B13 e visão geral, com GC entre voltas: recursos aquecidos estáveis em 613 geometrias, 147 texturas e 180 programas; heap após GC de 74,219 MB para 74,619 MB nas duas voltas aquecidas, dentro do limite de 2 MB. [Relatório](screenshots/map-startup/navigation-stress.json).
- A página DEV volta a coletar o primeiro snapshot após a compilação, habilitando os controles de stress sem depender de uma seleção manual. O script funcional verifica a seleção pela etiqueta real do DOM, também disponível no build de produção.

- Smoke test do build de produção: seleção repetida, filtros, interior/retorno, saúde WebGL, canvas único e ausência de overflow passaram. Posição da câmera/pan/pinça ficam explicitamente indisponíveis nesse registro porque a telemetria é DEV; esses gestos foram validados no ensaio instrumentado separado. [Registro do build](screenshots/map-startup/production/functional-mobile.json).

### Capturas

As capturas `before-*` usam o commit base da PR #136, em que a referência local já continha banheiro, asfalto e reservatórios. Por isso essas estruturas permanecem visualmente idênticas nessa comparação: a ausência relatada ocorria no banco publicado. As duas imagens enviadas pelo usuário documentam esse estado anterior real, mas têm enquadramento diferente das capturas novas.

| Conferência | Antes | Depois |
| --- | --- | --- |
| Infraestrutura publicada | [Banheiro ausente, imagem do usuário](screenshots/map-startup/user-restroom-before.png) | [Banheiro no sistema real](screenshots/map-startup/live-restroom-after.png) |
| Portão 9 publicado | [Sem reservatórios, imagem do usuário](screenshots/map-startup/user-gate9-before.png) | [Três reservatórios no sistema real](screenshots/map-startup/live-gate9-after.png) |
| Frente do palco, lote D11, câmera equivalente | [Antes](screenshots/map-startup/before-stageLot11.png) | [Depois](screenshots/map-startup/after-stageLot11.png) |
| Frente do palco, lote D12, câmera equivalente | [Antes](screenshots/map-startup/before-stageLot12.png) | [Depois](screenshots/map-startup/after-stageLot12.png) |
| Implantação B13, câmera equivalente | [Antes](screenshots/map-startup/before-stageTop.png) | [Depois](screenshots/map-startup/after-stageTop.png) |
| Visão geral, câmera equivalente | [Antes](screenshots/map-startup/before-overview.png) | [Depois](screenshots/map-startup/after-overview.png) |

Também foram inspecionados [banheiro/asfalto por cima](screenshots/map-startup/after-restroomTop.png), [entradas](screenshots/map-startup/after-restroomFront.png), [cozinha e grupo antigo](screenshots/map-startup/after-kitchenContext.png), [Portão 9 por cima](screenshots/map-startup/after-gate9Top.png). A fixture das coordenadas reais confirma o palco [no lote D11](screenshots/map-startup/persisted-stageLot11.png), [no lote D12](screenshots/map-startup/persisted-stageLot12.png), [por cima](screenshots/map-startup/persisted-stageTop.png) e [pelos fundos](screenshots/map-startup/persisted-stageRear.png). [Cálculo e ausência de colisões](screenshots/map-startup/persisted-desktop.json).

### Navegação medida

Mesma resolução de buffer 972 × 500, DPR 0,72, trajetória de 6 s e qualidade por cenário, Chrome/Intel UHD. O primeiro movimento frente à cozinha inclui trabalho de primeiro uso; os resultados não foram omitidos por serem menos favoráveis.

| Cenário | Tier | Média antes/depois | P95 antes/depois | Calls antes/depois |
| --- | --- | --- | --- | --- |
| Cozinha | HIGH | 16,67 / 24,69 ms | 17,1 / 21,6 ms | 312 / 312 |
| Portão 9 | HIGH | 16,85 / 16,67 ms | 17,1 / 17,2 ms | 171 / 171 |
| Palco, D11 | HIGH | 16,66 / 16,67 ms | 17,5 / 17,7 ms | 505 / 505 |
| Visão geral | MEDIUM | 26,07 / 25,00 ms | 38,1 / 35,8 ms | 876 / 876 |

[Antes](screenshots/map-startup/before-desktop.json), [depois](screenshots/map-startup/after-desktop.json). Houve um pico residual no primeiro movimento; a melhora de abertura não significa eliminar toda pausa de primeiro uso. Nas demais vistas, a carga de desenho e os tempos ficaram próximos do baseline. Não há fundamento para afirmar 60 FPS constantes em toda a cena.

### Escopo da verificação

O dispositivo realmente usado foi este computador Windows, com Chrome/ANGLE/Intel UHD. As vistas mobile foram emuladas em 390 × 844 e 844 × 390, com toque sintetizado. Não foram testados celular físico, Safari/iOS, rede móvel ou GPU de entrada diferente desta. As coordenadas reais foram reproduzidas numa fixture DEV sem copiar dados comerciais pessoais.

As correções de persistência já foram aplicadas e verificadas no site. O giro/redução do palco e o novo preparo gráfico pertencem a esta PR e só chegarão ao site após sua integração e publicação pelo fluxo do projeto.
