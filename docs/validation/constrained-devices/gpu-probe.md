# Sondagem GPU amostrada, somente QA

`scripts/constrained-devices/gpu-scene-probe.cjs` exporta `installSampledGpuSceneProbe`, para `page.evaluate` depois de `commercialMapReady=true` **e** `commercialMapHydration=complete`. Ele instala somente um wrapper temporário de `renderer.render` no renderer já admitido. Não pertence ao runtime da aplicação, não cria Canvas, renderer, controller, rota, worker, dependency, draw ou invalidação.

A medição cobre uma chamada existente de `renderer.render(mainScene, mainCamera)` durante navegação. Inclui o trabalho de sombras interno a essa chamada e **exclui** os passes posteriores de bloom/SMAA/sharpen/tone mapping. Não é tempo GPU de frame completo. CPU mede somente submissão JavaScript em torno daquela chamada, excluindo a criação/encerramento da query; não é React, processamento completo da entrada ou input-to-photon. CPU/GPU podem sobrepor-se e não são somados.

O probe admite até 40 amostras, no máximo uma por 20 draws elegíveis existentes e até oito queries pendentes. `EXT_disjoint_timer_query_webgl2` e `CURRENT_QUERY` são consultados uma vez na instalação depois da hidratação. A consulta `GPU_DISJOINT_EXT`, a disponibilidade e o resultado têm dono em uma tarefa de polling de 100 ms, somente enquanto há queries pendentes. O resultado é pedido apenas depois de disponível. Amostras disjoint, resultados inválidos e queries ainda pendentes após cinco segundos são descartados. Não há `getError`, `getParameter`, `getQuery`, `getQueryParameter` ou `readPixels` por frame. A navegação/pause/preparation alteram apenas elegibilidade, sem decisões de qualidade.

A instalação recusa: rota fora de QA, cena não preparada/hidratada, contexto perdido, foco/visibilidade inválidos, profiler existente ligado, estado desse profiler desconhecido, query externa já ativa ou outro probe instalado. Ausência da extensão é `unavailable`; falha de leitura das capacidades/ownership é `refused` com motivo `query-capability-unknown`. Outro profiler deve permanecer desativado durante a sessão isolada. Ligar a caixa de medição existente cancela o probe. Context loss/cancelamento restaura o wrapper e limpa timers/queries próprias; handles de contexto perdido não são consultados nem descartados via GL. O fim da medição restaura o wrapper imediatamente e conserva o listener de perda de contexto somente até terminar a drenagem bounded. Nenhuma conclusão de GPU é extrapolada de uma amostra indisponível.

`scripts/constrained-devices/gpu-navigation.cjs` executa uma rodada descritiva em overview por revisão, sequencialmente, em cenas separadas. Utiliza a fixture read-only, HIGH fixo, mesma pose e o mesmo aquecimento temporal de gesto. A câmera estabiliza antes da medição. Entrada down/up nativa e movimentos temporais despachados exercitam OrbitControls; eventos `start`/`change` são registrados. Esse percurso não certifica toque físico. O servidor QA impede backend comercial. O resultado JSON mantém amostras brutas, medianas, suporte/indisponibilidade, descartes, viewport/DPR/buffer/qualidade, identidade, contagens e manifesto de build, sem compradores, contratos ou tokens.

Esse diagnóstico deve rodar **separadamente** das comparações limpas de frames/boot. Os wrappers e queries acrescentam overhead. Uma rodada por revisão oferece suporte descritivo de CPU/GPU, sem p95 populacional, termal ou comprovação de aparelho antigo/Android. O browser compartilha cache de shaders do driver entre as revisões; ele não é controlado.

```sh
node --test scripts/constrained-devices/gpu-scene-probe.test.cjs
PLAYWRIGHT_MODULE=<caminho instalado> MAP_BASE_URL=http://127.0.0.1:4241 MAP_CANDIDATE_URL=http://127.0.0.1:4242 GPU_SCENE_WIDTH=1280 GPU_SCENE_HEIGHT=720 GPU_SCENE_DPR=1 GPU_SCENE_OUTPUT=/tmp/gpu-main-scene.json node scripts/constrained-devices/gpu-navigation.cjs
```

`GPU_SCENE_HEADLESS=1` habilita execução headless explícita; por padrão usa Chrome visível. `GPU_SCENE_DURATION_MS` aceita 1–15 segundos (padrão cinco). O resultado registra a duração real do percurso, número de moves e hardware informado pelo snapshot existente. `cancel()` deve ser chamado no cleanup do harness e a propriedade `window.__constrainedGpuSceneProbe` removida depois de consumir o resultado. Os testes de ownership, limites, polling, disjoint/timeout e cancelamento não certificam comportamento físico do driver.

## Resultado descritivo observado

Execução sequencial exclusiva no mesmo Chrome headless/ANGLE Metal Apple M5 utilizado na validação local saudável. Base `8f3e871010ebfeab45824ba042183127da3b15e3`; candidato `38aff99abd08261e7523a1855ca074ff1c350008`, confirmados pelo manifesto servido. Fixture oficial, HIGH/HIGH/HIGH fixo, post, DPR 1, viewport 1280×720 e buffer 1280×592 (a interface de QA ocupa parte da altura). Uma rodada overview por revisão, com aquecimento e pose iguais; nenhuma tarefa de build/test/outro benchmark concorreu. JSON completo e bounded: [gpu-main-scene.json](gpu-main-scene.json).

| Métrica descritiva | Base | Candidato |
| --- | ---: | ---: |
| Amostras GPU válidas | 18 | 18 |
| Mediana GPU do render da cena principal | 4,099 ms | 3,859 ms |
| Mediana CPU de submissão da cena principal | 4,2 ms | 4,4 ms |
| Chamadas elegíveis de render / amostras | 362 / 18 | 362 / 18 |
| Queries pendentes no final / disjoint / descartes | 0 / 0 / 0 | 0 / 0 / 0 |
| Geometrias / texturas / programas, antes e depois | 574 / 137 / 244 | 574 / 137 / 244 |
| Moves de entrada / start / change dos controles | 301 / 1 / 648 | 301 / 1 / 648 |
| Context losses / erros da aplicação | 0 / 0 | 0 / 0 |

As diferenças de mediana não comprovam ganho ou regressão GPU: uma rodada e 18 amostras são suporte descritivo nesse host saudável. Não estimam margem de GPU antiga, Android, tempo de frame completo ou percentis populacionais. CPU e GPU continuam separados. As 362 chamadas elegíveis são invocações de `renderer.render`, **não** draw calls GL. Counters instantâneos de draws/triângulos não foram capturados por este probe; as comparações limpas NAV registram esses counters separadamente. A quantidade de texturas não é VRAM em bytes.

As duas medições terminaram `disposed=true`, sem queries pendentes, foco inválido ou mudança de DPR/buffer/tier/path; o harness fechou ambos os contextos e o browser no `finally`. Sete testes bounded/lifecycle passaram em cerca de 41 ms e os checks de sintaxe dos dois scripts passaram antes do diagnóstico. Nenhuma tentativa inválida ocorreu nesta execução. O código de produção medido não foi modificado para essa sondagem.
