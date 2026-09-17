# Mapa Comercial — estabilidade por dispositivo, 17/09/2026

## Escopo e estado de aceitação

Correções de navegação interrompida, amostragem adaptativa e fallback WebGL, sem alteração de dados comerciais, geometrias, posições, materiais ou texturas. Esta entrega **não comprova 5 s de carregamento, 60 FPS sustentados, equivalência entre GPUs ou ausência universal do congelamento relatado**. A cena foi realmente usada em WebGL 2 acelerado, em produção e na fixture local. As pendências abaixo permanecem explícitas.

- Base: `3c81b943c4b5871ff5dd6adea42f9ab28efee5c3`, obtida de `origin/main`. A identidade com o deploy de produção não foi demonstrada.
- Branch: `codex/commercial-map-device-performance`; implementação `71c422ad73158422af6e0ddd2e4658a41e810f1a`. O commit seguinte contém somente este relatório/evidências; `provenance.json` relaciona código e builds locais.
- Worktree isolado. As alterações preexistentes no checkout principal foram preservadas. O arquivo MCP regenerado pelo build está fora da entrega.
- npm é o gerenciador canônico, seguindo os scripts/CI existentes. Node 24.15.0, npm 11.12.1 nesta máquina. `npm ci` falhava por ausência de `@testing-library/user-event@14.6.7` no lock. Correção restrita a essa entrada; instalação limpa passou, sem atualização gráfica em massa.

## Máquina e condições realmente observadas

Windows, Intel Core i5-1035G1, aproximadamente 8 GB RAM, Intel UHD Graphics, driver 31.0.101.2141. O renderer informou `ANGLE (Intel, Intel(R) UHD Graphics (0x00008A56) Direct3D11 vs_5_0 ps_5_0, D3D11)`. Chromium embarcado 153.0.0.0, conforme user agent. Nenhum renderer por software foi habilitado. Não foram alterados energia, aceleração ou seleção de GPU no sistema; alimentação, temperatura, clocks e pressão de outros aplicativos não foram controlados.

Versões instaladas: Three 0.170.0, React Three Fiber 8.17.10, drei 9.122.0, three-stdlib 2.36.1, React 18.3.1 e postprocessing 6.37.8. A documentação de [renderização por demanda do R3F 8.17.10](https://github.com/pmndrs/react-three-fiber/blob/v8.17.10/docs/advanced/scaling-performance.mdx) foi conferida junto ao código instalado.

O navegador Chrome autenticado também renderizou o parque e o interior. A conexão de automação com esse navegador ficou indisponível durante o retorno ao parque; o resultado dessa última ação não é certificado. Não foram armazenados credenciais, cookies, tokens nem capturas dos dados privados. Nenhuma venda, reserva ou escrita de teste foi realizada em produção.

Fixture local: build Vite de produção com `VITE_COMMERCIAL_MAP_DIAGNOSTICS=true`, servido por loopback, sem throttling. Dados oficiais da fixture, sem autenticação e consultas comerciais. Antes em porta 4191; depois em 4192. O probe `scripts/commercial-map-performance/instrument-preview.cjs` foi aplicado igualmente aos dois builds. A rota de QA não existe no build normal.

## Evidências e causas

| Evidência | Conclusão e ação |
| --- | --- |
| OrbitControls real nos testes de cancelamento | A perda inesperada de captura e a soltura fora do elemento não encerravam a lista privada de ponteiros. A nova ponte envia o caminho normal de `pointercancel`, libera o gesto e conserva câmera/alvo. Soltura normal não cancela duas vezes. Isso confirma uma lacuna; não prova que todos os relatos de clique para destravar têm essa origem. |
| Janelas reais das funções adaptativas | Intervalos ativos acima de 250 ms deixavam de produzir decisões. Agora o limite da atividade/visibilidade/preparação define a amostra; o primeiro intervalo da nova atividade é ignorado, os seguintes stalls são conservados. O coletor separado de diagnóstico já conservava stalls e continua assim. |
| Câmera parada, amanhecer, chuva e brinquedos | A adaptação passa a observar pedidos explícitos de continuidade e frames efetivamente submetidos. Separa caminho direto/compositor, interior, DPR e tier aplicado; não encadeia decisões sobre qualidade ainda pendente. |
| CPU/RAM não identificam GPU | Perfil inicial no máximo HIGH; ULTRA exige recuperação medida em runtime. Ausência de pistas não significa hardware fraco. O teto de alocação continua separado da qualidade inicial. |
| Recuperação em 60/90/120 Hz | Calibração limitada a 48 RAFs em repouso, sem draws extras; histerese, oito ou mais janelas estáveis, uma promoção por vez, cooldown e histórico de quedas preservado. RAF mede cadência do navegador, **não headroom da GPU**. A promoção é uma experiência limitada, seguida da medição da carga nova. Calibração física e medição independente de margem GPU continuam pendentes. |
| Vendas elevava LOW/MEDIUM para HIGH | O orçamento de efeitos agora conserva o tier medido. Estruturas não consumiam esse tier. A vegetação mantém HIGH no modo normal; somente o modo reduzido explícito simplifica suas variantes. |
| Teto ambiental guardado na montagem | A resolução ambiental deriva da política central e do tamanho atual do Canvas; o limite existente para Canvas pequeno é recalculado em resize/orientação. |
| Fallback imutável e preload incondicional | Sondagem WebGL descartável, até três retries explícitos, sem loop de contextos. Ausência de suporte impede preload do Canvas. Tabela abre detalhes sem voo/entrada em interior; Vendas múltiplas explica a necessidade do 3D. |

O frame owner único, `frameloop="demand"`, Canvas persistente, compilação com proteção de geração, worker da sede B12, preparação de hidrologia, barreira de estrutura essencial e preparação posterior do compositor foram preservados. Não foram adicionados watchdogs, reloads automáticos ou renderização permanente.

## Carregamento antes/depois

`reloads.json` contém **20 reloads aquecidos por condição**, todos visíveis e com foco na primeira oportunidade de apresentação. Viewport CSS 1366×768, Canvas/buffer 1351×640, DPR 1, câmera geral e fixture iguais. Depois: `?quality=fixed`, opção exclusiva da rota QA, impede adaptação por desempenho para comparar o perfil inicial HIGH com a baseline HIGH. A rotina recarrega e observa prontidão; não fabrica frames nem ignora amostras lentas.

| Marco existente `first-interactive` | Antes | Depois, qualidade fixa |
| --- | ---: | ---: |
| n | 20 | 20 |
| Mediana | 7.065,5 ms | 6.688,5 ms |
| p95 amostral, nearest rank | 7.873 ms | 9.629 ms |
| Máximo / p99 amostral | 11.284 ms | 10.881 ms |
| Mediana da construção da cena | 4.339 ms | 4.085,5 ms |
| Mediana da preparação direta | 388 ms | 356,5 ms |

A mediana caiu aproximadamente 5%, mas o p95 amostral piorou; execução sequencial, caches de driver e estado térmico não controlados impedem atribuição causal. **Não se declara melhoria de carregamento comprovada.** O custo dominante continua na construção/montagem CPU da cena essencial. Não foi trocada a barreira por estruturas aparecendo aos pedaços. Otimizar essa montagem exige um próximo trace de componentes/geometrias com equivalência visual.

Primeira visita sem cache não foi controlada. A visita inicial de cada servidor, recargas exploratórias e o caso inicial sem foco ficaram fora da série. `after-first-local-visit.json` é observação adicional, não cold start. Autenticação, rede de produção, banco/RLS, uploads de textura e render targets não têm medições independentes completas nesta fixture. Não foram propostos índices ou alteradas consultas sem EXPLAIN.

Prontidão interativa e conclusão visual/hidratação são marcos distintos. A série encerra a leitura após prontidão, portanto `hydrationMs: null` nessa série significa marco posterior ainda não observado. Os snapshots estabilizados `baseline-initial.json` e `after-overview.json` registram separadamente a hidratação completa. Próximo RAF é oportunidade do navegador; não é input-to-photon físico. `1000/p99` foi renomeado para aproximação e não representa a média do pior 1%.

## Comparação visual e atividade

`baseline-overview.png` / `after-overview.png`: mesma pose, HIGH, ambiente balanced pelo tamanho do Canvas, compositor, buffer 1351×394. Capturas feitas fora do benchmark. Em ambas: 796 draws, 598.423 triângulos, 209 programas, 149 texturas e 554 geometrias no snapshot. Inspeção visual conserva arquitetura, ruas, árvores, lotes e iluminação; não é teste pixel a pixel e não certifica outros enquadramentos.

`baseline-lighting.json`: 20 ciclos, 40 transições noite/amanhecer; todas as linhas registram primeiro plano, ready/post, zero perda de contexto e erro residual nulo. Câmera/alvo permaneceram estáveis. Há intervalos longos, incluindo cerca de 4.025 ms em uma janela: a baseline não demonstra fluidez constante. Houve uma mudança de foco/visibilidade exploratória fora da amostragem; metadados não devem ser interpretados como sessão de laboratório isolada. O array de long tasks do probe histórico é compartilhado entre linhas; não somar como se cada linha fosse uma lista independente.

`after-lighting-fixed.json`: outras 40 transições na mesma qualidade/buffer/câmera, todas em primeiro plano, ready/post, sem erro residual nem perdas de contexto. Ambos os ensaios conservaram 560 geometrias, 149 texturas, 209 programas e uma criação de Canvas/renderer/controles. Não há crescimento desses contadores durante os ciclos; VRAM em bytes e recursos do driver não foram medidos.

| Mediana entre 20 janelas de cada modo (ms) | Antes p50 / p95 / p99 | Depois fixo p50 / p95 / p99 |
| --- | ---: | ---: |
| Noite | 24,80 / 33,25 / 41,35 | 19,95 / 23,20 / 28,35 |
| Amanhecer | 29,10 / 39,85 / 73,75 | 22,80 / 27,60 / 32,65 |

Esses números são **medianas de percentis por janela**, não percentis de todos os frames reunidos. A execução corrigida foi mais rápida nesta sessão, mas a mudança de qualidade estava desativada e nenhuma grande otimização do desenho foi introduzida; deriva térmica/caches/carga externa e a interrupção da sessão de baseline impedem atribuir a diferença ao patch. Nem este resultado atende 60 FPS sustentados. `summary.json` é reproduzível com `node docs/validation/device-performance/summarize.cjs` e mantém a distribuição de cada conjunto.

Perda de contexto forçada **fora** dos benchmarks: `after-context-recovery.json` registra ready/post → context-lost → ready/direct → ready/post; câmera/alvo iguais e retorno sem usar “Recuperar mapa” ou clicar na cena. O aviso de falha apareceu transitoriamente durante a recuperação: essa experiência intermediária permanece como limitação, apesar da recuperação final. `after-context-night.png` comprova a imagem restaurada. A perda intencional não deve ser misturada às zero perdas espontâneas dos ciclos anteriores.

Os dois novos casos de regressão de ponteiro falham na implementação original e passam na corrigida (`pointer-regression-before.json`): os outros 12 testes de cancelamento passaram na baseline. A prova utiliza a implementação real de OrbitControls em DOM de teste, não simula desempenho físico nem demonstra a causa de todos os freezes de produção.

`after-lighting-adaptive.json`: mais 20 ciclos/40 transições com adaptação habilitada. Todas as janelas registram primeiro plano, ready/post, erro nulo e zero perdas de contexto, com câmera/alvo estáveis. O controlador reduziu HIGH → MEDIUM → LOW; o aviso de compatibilidade ficou visível. Isso é uma redução explícita de resolução/efeitos e **não** uma melhoria mantendo qualidade equivalente. Programas passaram de 209 para 273/274, geometrias de 560 para 559 e texturas de 149 para 151; do ciclo 6 ao 20 os contadores ficaram constantes. São variantes aquecidas e caches observados, não uma medida de VRAM nem prova ilimitada contra vazamentos. Houve um evento de perda de foco, sem ocultação, fora das janelas; um timeout da ferramenta não foi classificado como freeze da aplicação. A recuperação de tier foi exercitada nos testes de cadência, não comprovada fisicamente nesta série.

Os pares `baseline-lot.png`/`after-lot.png`, `baseline-pavilion.png`/`after-pavilion.png` e `baseline-interior.png`/`after-interior.png` mostram respectivamente Q-R-01, B10/Pavilhão 7 selecionado e seu interior B10-M001. `visual-pairs.json` confirma posição, alvo e orientação idênticos, DPR 1 e buffers iguais: 1285×682 fora e 1069×682 dentro. Ambos conservam HIGH; o caminho final é post fora e direto dentro. A inspeção visual não identificou alteração nessas três vistas. Os snapshots de renderer dessas seleções podem refletir um frame anterior de gesto; por isso não foram usados como benchmark de draws. A captura do pavilhão é o enquadramento de retorno ao parque, não uma auditoria de todos os seus detalhes arquitetônicos.

| Vista | Antes | Depois |
| --- | --- | --- |
| Parque | [Imagem](baseline-overview.png) | [Imagem](after-overview.png) |
| Q-R-01 | [Imagem](baseline-lot.png) | [Imagem](after-lot.png) |
| Pavilhão B10 | [Imagem](baseline-pavilion.png) | [Imagem](after-pavilion.png) |
| Interior B10-M001 | [Imagem](baseline-interior.png) | [Imagem](after-interior.png) |

## Roteiro executado e pendências

Produção, antes das correções: vista geral/superior, zoom e rotação por arraste, busca Q-R-01, lista → seleção/voo → detalhes, seleção do Pavilhão 09, busca B10-M001 → interior do Pavilhão 7, zoom/rotação interna. A imagem real do parque e do interior foi observada. O tempo das ferramentas não foi apresentado como latência da aplicação.

Fixture corrigida: busca/seleção B10-M001, interior e retorno ao parque, painel do pavilhão, busca/seleção Q-R-01, painel do lote e fechamento, lista/3D, zoom por wheel para aproximar/afastar, rotação por arraste e vista superior. `after-navigation.json` registra um Canvas, frames progredindo, controles liberados e retorno direto → post ao repousar. Durante o arraste a decisão MEDIUM foi adiada até o fim do gesto; a vegetação normal permaneceu preservada. Também foram exercitados chuva, noite e replay em sequência (`after-rain-closeup.*`); essa captura não comprova alcance do limite mínimo de zoom nem serve como benchmark.

Resize CSS 390×844 → 844×390 conservou ready/post, controles disponíveis e zero perdas de contexto (`after-mobile-viewport.png`, `after-navigation.json`). É o mesmo Chromium/Intel; **não** é iPhone/Safari, Android físico nem gesto multitoque. O enquadramento é recalculado pelo comportamento existente de resize. Pan com botão secundário, extremos mínimo/máximo por gestos, cancelamento pelo SO e comparação visual de cada frame inicial/final de gestos permanecem pendentes.

Fallback forçado **somente em QA** (`/__dev/commercial-map-interface?webgl=unavailable`): zero canvases, busca B10-M001 retorna um resultado, “Ver detalhes” abre o painel sobre a tabela sem entrar no interior. Três cliques explícitos de verificação esgotam o limite e desabilitam o botão; o aviso informa 3/3. O cabeçalho mantém a explicação mesmo com detalhes abertos (`after-fallback-details.png`, `after-fallback-retry.json`). O teste unitário separado comprova recuperação quando uma sondagem posterior encontra WebGL válido. Esse fluxo forçado verifica a UI, não testa um driver sem WebGL.

Pendências físicas: Intel com 4 GB, híbrido Intel/NVIDIA, dedicada, iPhone/Safari, Android intermediário; gestos reais de pinça/trackpad, cancelamento pelo SO, minimizar/restaurar, troca de aplicativo, alimentação, monitores externos e sessão térmica de 15–30 min. Viewport mobile não substitui essas provas. Estabilidade de heap não demonstra estabilidade de VRAM.

Também permanecem sem comprovação: igualdade do SHA de produção, cold starts controlados, portal autenticado completo após correção, transações em staging, rastreamento de cada consulta, input até o frame correspondente, custos separados de raycast/React/upload/material/targets, e ausência universal do congelamento original. As evidências atuais permitem corrigir os mecanismos reproduzidos e preparar validação, não encerrar essas hipóteses.

## Verificações de código e instalação

`checks.json` e `test-baseline-comparison.json` preservam o inventário. Instalação limpa, typecheck e lint de todos os TS/TSX alterados/adicionados passaram. Build QA final passou em 44,67 s; build normal passou em aproximadamente 75 s; build normal com manifest passou em aproximadamente 65 s. Tempos de build são da ferramenta local, não carregamento do mapa. Os avisos existentes de chunks grandes e Browserslist antigo permanecem.

Os sete arquivos de regressão alterados/adicionados somam **88 testes aprovados**, incluindo OrbitControls real, fronteiras de atividade, stalls de 500 ms, cadência 60/90/120 Hz, cooldown, fallback e detalhe sem câmera. Os oito testes do arquivo novo também passaram após a última alteração de texto da lista. A asserção textual antiga sobre `invalidate()` foi atualizada para a chamada explícita de continuidade; não foi removida a verificação de animação.

Suíte completa final: **1.931 aprovados e 90 falhas, de 2.021**. Dessas falhas, 86 foram reproduzidas com os mesmos nomes na base 3c81b94, reexecutando os 36 arquivos originalmente falhos em worktree destacado. Quatro falhas adicionais apareceram em três arquivos não alterados; os 24 casos desses arquivos passaram na repetição isolada. Essa instabilidade continua registrada: **a suíte global não está verde**. Não foram modificados testes alheios para ocultar falhas, nem somadas repetições como uma nova execução completa aprovada.

`bundle.json`, gerado com `bundle-report.cjs dist --assert-independent`, confirma Three/física/PDF fora das dependências estáticas do caminho anterior à consulta. O manifest do build normal não contém as páginas de diagnóstico do mapa. A primeira tentativa de gerar esse relatório sem `--manifest` falhou por arquivo ausente; o build com manifest resolveu o pré-requisito. O relatório de bundles e `summarize.cjs` não são substitutos dos testes.

A PR é entregue como **rascunho**: a meta de 5 s não foi atingida, 60 FPS sustentados não foram comprovados e a matriz física permanece incompleta. Também falta reprodução observacional do relato original “só volta após clicar”; a prova automatizada está limitada às duas lacunas de cancelamento corrigidas. A próxima intervenção de carregamento deve partir do custo CPU de montagem já medido, preservando a mesma estrutura completa.

## Reproduzir, validar dispositivos e rollback

1. `npm ci --no-audit --no-fund`; `npm run typecheck`; `npm test`; `npm run build`. Registrar SHA, versões e falhas existentes sem alterar inventários para silenciá-las.
2. Build QA com `VITE_COMMERCIAL_MAP_DIAGNOSTICS=true`; servir localmente. Abrir `/__dev/commercial-map-rendering?quality=fixed` para comparação visual/custo fixo e sem o parâmetro para validar adaptação. Não publicar QA como deploy normal.
3. Repetir 20 vezes **por condição**, separando cache vazio e aquecido, rede, resolução nativa e buffer normalizado. Registrar GPU conhecida ou desconhecida, qualidade lógica/aplicada, caminho, câmera, dados, p50/p95/p99, stalls e long tasks. Não misturar amostras de perfis diferentes.
4. Executar o roteiro completo do pedido em cada aparelho: lotes/pavilhões/interiores, busca/filtros/painéis, Vendas em staging sem transação real, amanhecer/noite/chuva, gestos interrompidos, foco/resize/orientação, rota/lista/3D. Forçar perda de contexto somente na rota QA; verificar mesma câmera/seleção e retorno sem clique adicional na cena.
5. Sessão de 15–30 min e ciclos aquecidos por modo; registrar recursos por proprietário, plateau e alocações intencionais. Separar gravação de benchmark. Investigar regressões visuais antes de promover a PR.
6. Rollback: `git revert 71c422ad73158422af6e0ddd2e4658a41e810f1a` e reconstruir o frontend. Não há migração, dado comercial ou coordenada a desfazer. Reaplicar separadamente a entrada de user-event do lock conserva `npm ci` reproduzível após uma reversão integral. Não há merge/deploy automático nesta entrega.

Referências: [Three r170, WebGLRenderer](https://github.com/mrdoob/three.js/blob/r170/src/renderers/WebGLRenderer.js), implementação instalada de R3F/Three consultada, [MDN WebGL best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices), [atributos de getContext](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/getContext). `powerPreference: high-performance` é preferência, não garantia de uma RTX. `compileAsync` chama submissão síncrona antes de esperar; o caminho atual com guardas não foi substituído. Documentos históricos `docs/commercial-map-systemic-performance.md` e `docs/validation/systemic-performance/README.md` foram tratados como evidência anterior, não baseline atual.
