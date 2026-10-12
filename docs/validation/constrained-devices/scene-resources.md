# Auditoria da cena e dos recursos — 11/10/2026 (data local)

Base examinada no worktree isolado: `8f3e871010ebfeab45824ba042183127da3b15e3`.

## Causa confirmada e correção equivalente

`CommercialTreeInstances` (`components/canvas/CommercialTreeLayer.tsx`, `useLayoutEffect`) resolve o solo e o recebedor deslocado de sombra de cada árvore na montagem essencial. O caminho está ativo: `Scene` monta `EssentialSceneLayer id="vegetation"` no mapa autenticado; `CommercialTreeLayer` chama os mesmos helpers nos batches canônicos e em `VegetationPilotTreeLayer`/`VegetationPilotGroundLayer`, que são o caminho normal, inclusive em produção (`isVegetationPilotEnabled` só permite o caminho legado na comparação DEV).

`commercialTreeSurfaceEntityAtPosition` (`utils/treeLayer.ts`) repetia por ponto a filtragem de todo o snapshot de entidades, `pointInPolygon` para todas as superfícies, ordenação dos polígonos contendo o ponto e, no fallback mais próximo, a distância ao vencedor corrente em cada passo. `pointInPolygon` inclui a distância a cada segmento para preservar a tolerância na borda; esses testes custam CPU mesmo quando o ponto está longe do polígono. Isso se repete no commit essencial e quando o snapshot espacial muda. Não era executado em todo frame.

Microbenchmark isolado final no host darwin, Node 24.19.0: 1.595 entidades da fixture oficial apresentada + apoios existentes; 274 árvores canônicas; 548 consultas por passe (solo e sombra deslocada). 2.378 comparações exatas (inventário, bordas ±epsilon e fallback) passaram. Após dois warmups, 20 passes alternados base/candidato, contando a preparação do índice em cada passe candidato: base mediana 24,683 ms / p95 24,860 ms; candidato mediana 0,840 ms / p95 1,059 ms. Evidência: `tree-surface-benchmark.json`. O harness importa o código candidato real e os helpers anteriores como referência; um protótipo anterior confirmou o mecanismo antes da implementação. Bounds não-finitos usam o caminho de cálculo original sem rejeição espacial.

Isso confirma custo CPU evitável e equivalência do cálculo local. Não confirma que esse custo sozinho causa freezes de vários segundos em aparelhos relatados, nem quantifica boot completo, GPU ou frames. A melhora absoluta local é cerca de 24 ms por passe; seu efeito em CPU antiga exige a matriz física.

Implementação: `createCommercialTreeSurfaceResolver` prepara somente listas/bounds numéricos e um índice de identificadores pertencente à camada ativa. Não tem cache global, snapshots comerciais, objeto GPU, worker ou thread. É recriado pelo `useMemo` existente quando `surfaceEntities` muda e compartilhado entre todos os batches/piloto/solo. `pointInPolygon`, `distanceToEntity`, prioridade, epsilon, primeiro identificador duplicado, suporte especial/hole do P12, recebedor deslocado, terreno natural e clearances continuam sendo autoridades. As funções de compatibilidade preservam o caminho anterior e fornecem oracle diferencial para os testes. Nenhuma transformação, posição, material, densidade, sombra ou picking foi alterado.

Refutação: divergência numérica no inventário ou em boundaries/hole/nearest/order/scope invalida a otimização. Imagens ou transform buffers diferentes com pose/qualidade fixa também invalidam equivalência. O harness reproduzível `scripts/constrained-devices/tree-surface-benchmark.ts` usa o código final (não o protótipo) e os mesmos helpers legados.

## Outras hipóteses auditadas

| Hipótese | Evidência atual | Impacto / condição | Proposta e teste de refutação |
| --- | --- | --- | --- |
| Fila idle divide a montagem essencial | Descartada no caminho autenticado: `EssentialSceneLayer` retorna `group`; só público reconduz territorial/residential/nations/landmarks à fila. `DeferredSceneLayer.run` só admite a camada: o trabalho síncrono do commit permanece inteiro. | Muitas camadas estruturais participam do commit e barreira inicial. Relatório histórico sistêmico observou commits de 5,5–7,1 s; isso não é medição do HEAD atual. | Instrumentar spans dos construtores/commit atual. Não adiar estrutura como se readiness fosse completa. Um worker exige encontrar e medir um cálculo puro suficientemente caro. |
| Materiais/texturas openGround são sempre duplicados por lote | Descartada parcialmente: `openGroundTextureBundleForEntity` tem pool por superfície/repeat/wrap/anisotropy e referência; última referência libera 3 texturas. Sources procedurais são cacheadas por tipo e ficam pelo ciclo de vida do módulo. | Perfis diferentes têm texturas distintas por sampling; número de texturas não é VRAM. | Avaliar proprietários/perfis com coleta de recursos e tamanho/formato estimado. Não deduplicar perfis visivelmente diferentes nem dispor sources usados. |
| Árvores canônicas são meshes individuais | Descartada: legadas/internas/A-B usam 5 meshes instanciados por batch; piloto divide 3 famílias em tronco/core/detail. Há objetos residentes para todos os níveis e inventário inteiro preservado. | Reduz draws sem reduzir conteúdo; shadows/folhas alpha-test podem continuar caros em GPU antiga. | Perfil fixo e captura draws/triângulos/programas por pass e pose. Não retirar folhas/árvores/sombras como ganho equivalente. |
| Reduzir LOW/MEDIUM elimina densidade/CPU de montagem | Descartada: content policy preserva conteúdo e lobe count; preparação de árvore continua completa. Já existe política de shadow caster/folhas em perfis. | Adaptação não reduz esse cálculo de solo. | Patch numérico elimina trabalho repetido com qualquer tier, preservando qualidade. |
| Alocações massivas por frame na vegetação | Não encontradas no caminho inspecionado: buffers/vetores/materiais criados em memo/layout, callbacks usam refs. `CommercialTreeInstances` ainda cria um objeto de counts a cada avaliação periódica LOD e `direction.clone` no commit; não há evidência de impacto material. | Mudança de LOD e transição invalidam somente quando necessário. | Trace GC/CPU bounded durante navegação; sem introduzir pooling por hipótese. |
| Re-renders amplos em hover/seleção | `Scene` assina campos específicos, mas ainda mapeia entidades na seleção; meshes individuais e `CommercialTreeLayer` são memoizados. `treeSurfaceEntities` mantém referência em seleções comuns; muda ao alterar dados/visibilidade real/P12. | Consulta de recebedores não depende de selection usual. | React profiler QA e contagem de construction spans; não cachear snapshot comercial. |
| Environment recria geometria/composer em cada gesto | Não encontrado: sky/sun/reflections/materiais têm lifetime estável; o compositor é proprietário único do desenho e dimensiona pelo drawing buffer. Estados de navegação mudam orçamento/draw; não trocam Canvas. | Render targets/sombras ainda podem ser caros, dependendo de perfil/buffer/capacidades. | QA com dimensão/formato/proprietário + contexto/recovery; não dispor caminho inativo sem auditar alternâncias. |
| Cena coberta continua consumindo CPU/GPU | Corrigida na base PR #191: apresentação com `frameloop="never"`, picking/produtores decorativos/adaptação pausados. Histórico integrado reportou zero frames e long tasks coberta; CPU/GPU da sessão atual não medidos aqui. | Tem que preservar dados/listeners/identidade e retomada. | Root manter testes cobertura/retorno/contexto; nenhum arquivo dessa pausa foi modificado por este patch. |

## Evidência histórica lida e limites

Foram consultados `docs/commercial-map-systemic-performance.md`, README/artefatos de `device-performance`, `progressive-rain`, `navigation-resolution` e `dashboard-interaction-performance`. São experimentos antigos, principalmente fixture no notebook Intel UHD/Windows e emulação de viewport móvel. O sistêmico documenta tempo inicial de montagem/preparação remanescente. Device documenta lacunas de pointercancel e stalls na amostragem já corrigidas. Progressive documenta trabalho de shader/primeiro draw e recursos estáveis após warmup. Navigation separa qualidade/DPR de melhoria equivalente e mostra que 30 FPS não foi sustentado em todas execuções. Dashboard documenta pausa da cena coberta e reserva as lacunas físicas/autenticadas. Nenhuma dessas medições foi apresentada como atual ou como deploy observado.

Harnesses úteis: `startup-probe.cjs`, `startup-matrix.cjs`, `navigation-resolution.cjs`, `quality-parity.cjs`, `gl-program-probe.cjs`, `boot-readiness.cjs` e os harnesses integrados de dashboard. Alguns scripts históricos forçam `--use-angle=d3d11`, adequado ao Windows registrado, não ao host macOS atual; precisam de adaptação de plataforma para nova execução. Instrumentação e rotas devem permanecer QA opt-in.

Validação física, staging autorizado e identidade do deploy permanecem pendentes nesta auditoria; as evidências gerais da intervenção são registradas no relatório principal. Não foram executados writes comerciais ou testes de vendas nesta auditoria. O patch local não muda plantas, IDs, compras, permissões, queries, RLS, parâmetros de qualidade ou render loop.

## Validação executada

- 7 arquivos / 53 testes aprovados, execução sequencial com um worker. Inclui os sete novos casos do resolver, árvores canônicas, controles, P12/Visita, piloto/solo, LOD e escopo da vegetação. Avisos de múltiplas instâncias Three e Browserslist antigo foram registrados; não houve falha.
- O benchmark final terminou depois dos testes, sem build, outros benchmarks ou navegador medindo ao mesmo tempo. Não usa limiar de tempo como teste de unidade.
- O teste diferencial cobre três snapshots existentes, árvore/sombra, epsilon, concavidade, prioridade/ordem, identificadores duplicados, fallback mais próximo, holes do P12, mudança de geometria/escopo e dados/points não-finitos. Ele não substitui QA visual/funcional completo.

Reprodução fora do build normal:

```sh
node node_modules/esbuild/bin/esbuild scripts/constrained-devices/tree-surface-benchmark.ts --bundle --platform=node --format=esm --outfile=/tmp/tree-surface-benchmark.mjs --define:import.meta.env.DEV=false --define:import.meta.env.VITE_COMMERCIAL_MAP_DIAGNOSTICS=false
TREE_SURFACE_BASE_SHA=<base> TREE_SURFACE_CANDIDATE_SHA=<candidato> TREE_SURFACE_OUTPUT=/tmp/tree-surface-benchmark.json node /tmp/tree-surface-benchmark.mjs
node node_modules/vitest/vitest.mjs run src/test/commercialMapTreeSurfaceResolver.test.ts src/test/commercialMapTrees.test.ts src/test/commercialMapTreeControls.test.tsx src/test/commercialMapPavilion12FrontTrees.test.ts src/test/commercialMapVegetationPilot.test.ts src/test/commercialMapVegetationLod.test.ts src/test/commercialMapInternalVegetationScope.test.ts --maxWorkers=1 --fileParallelism=false
```

O JSON registra candidato não commitado no momento da medição. O relatório principal liga o conteúdo medido ao SHA candidato final, sem presumir identidade com deploy.
