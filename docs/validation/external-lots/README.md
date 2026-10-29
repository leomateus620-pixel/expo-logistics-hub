# Harmonia dos lotes externos — FENASOJA

## Escopo e preservação

Mudança de apresentação para lotes externos ativos de **ExpoRural, Espaço do Automóvel e Indústria, Comércio e Serviços**. A política combina o segmento canônico, `SELLABLE_LOT`, vínculo comercial ativo, condição descoberta e ausência de identidade de módulo/pavilhão. Relações de banco ausentes ou desconhecidas não usam o identificador técnico como autorização de escopo.

Não há migração, escrita em banco, alteração de status persistido, reparcelamento ou mudança em contratos, compradores, valores, áreas, números, posições e plantas. `STATUS_CONFIG`, os fluxos de venda, as RPCs e as permissões permanecem intactos. Estados legados seguem a normalização existente. Os testes de transição operam exclusivamente sobre fixtures em memória, com backend bloqueado na prévia local.

## Solução

- Gramado fosco `#739455`, com microvariação discreta em coordenadas do mundo. O Standard privado reutiliza o detalhe de superfície já existente (cor, rugosidade e normal), sem empilhar outra textura procedural. O Basic público recebe a variação leve própria, filtrada por derivadas para evitar ruído distante. O perfil reduzido conserva a semântica e pode desligar somente o detalhe.
- Venda em aberto: moldura interna `#D8BD70`; vendido: moldura e selo `#8FB7D8`, com check `#355F82`. O último ajuste solicitado aumentou a largura nominal em **35%** e intensificou o azul, mantendo o desenho do selo.
- Recuo nominal de **0,75%** e faixa nominal de **5,4%** da menor largura útil. A largura útil é medida entre arestas estruturais com normais opostas; pequenas facetas não tornam a moldura inteira microscópica. A faixa é reduzida quando necessário para preservar o centro e passagens estreitas. Lotes regulares conservam ao menos 75% de centro gramado. Nos 100 polígonos rurais 2028 auditados, o centro livre ficou entre 79,3% e 89,7%, sem omissões; detalhes em [frame-geometry-audit.json](frame-geometry-audit.json).
- Junções collineares são consolidadas apenas na medição da largura; o offset continua usando todas as arestas e recortes originais. A menor largura relativa nos lotes rurais auditados foi de 2,47%.
- Offset verdadeiro: erosão por semiplanos para polígonos convexos; diferença de vizinhanças das arestas/vértices para concavidades e buracos. Junções limitadas, sem escala pelo centroide, aproximação por retângulo ou alteração cadastral. Entradas inválidas omitem apenas a moldura e conservam a situação contextual.
- Uma `BatchedMesh` reúne as molduras. Cor, visibilidade, matrizes e atributos de status mudam sem refazer a geometria. O selo usa geometria compartilhada de 24 triângulos e instancing; nenhuma nova luz, sombra dinâmica, animação, passe ou dependência.
- Superfície, moldura, selo e logo acompanham o mesmo deslocamento transitório. O carrinho usa indicação transitória distinta do amarelo comercial; inspeção continua independente. Molduras e marcadores não interceptam raycast.
- Logos mantêm a URL autorizada e o carregamento/descarte existente. Logo e selo menor ocupam regiões separadas do mesmo círculo interior seguro, respeitando recortes e obstáculos.
- Materiais Basic públicos e Standard privados usam variantes explícitas com hooks compostos e chaves de programa estáveis. A variante privada omite o segundo cálculo procedural em tempo de compilação; não basta zerar um uniform. O shader anterior é preservado. Bloqueados e demais estados mantêm as marcas, cores e o detalhe rural anterior. As divisórias atualizam seus buffers nas transições, sem reconstrução.
- A legenda mostra gramado/moldura/check nos externos, preenchimento nos internos e ambas as amostras em escopos mistos. Contagens, nomes oficiais, cards e tooltips mantêm a semântica anterior.

## Rótulos

`Quadra S` fica acima e `Quadra R` abaixo dos lotes, na orientação da planta. As âncoras são derivadas dos limites reais sob a extensão horizontal do texto, com teste do conteúdo visível completo — incluindo contorno e antialias. Isso permite usar a faixa livre junto à quadra sem confundir o padding transparente do atlas com texto.

A colisão considera lotes, vias efetivamente renderizadas, copas, estacionamentos, acessos, caminhos e estruturas disponíveis na cena. O caminho público usa apenas seu inventário autorizado. Fonte, tamanho, desenho, material, orientação e regras de visibilidade são reutilizados.

Ruas próximas e paralelas usam uma referência comum ao longo do eixo e uma faixa transversal consistente dentro de cada via. A posição válida mais próxima é usada quando há impedimento. A deduplicação usa identidade canônica explícita; vias distintas com o mesmo nome permanecem distintas. Curvas e diagonais mantêm a orientação local anterior.

Na fixture real, Paraguai, Bolívia, Chile, Brasil, Uruguai e Argentina compartilham `x = -3,41818`, na faixa transversal de 30% da largura útil. Montevidéu e Brasília compartilham `z = 13,37727`. Esses valores são resultados do cálculo, não âncoras gravadas no cadastro. A Alameda Mercosul usa o trecho livre mais próximo: o alinhamento comum atravessaria as copas da Quadra I. O teste com métricas reais do atlas verifica cinco faixas e 97 posições no intervalo compartilhado; nenhuma dessas posições acomoda seu texto no tamanho preservado. O nome continua dentro da própria Alameda, sem remover árvores ou diminuir a fonte para forçar o alinhamento.

Entradas de geometria, nomes e vínculos são estabilizadas: mudar somente status/preço não refaz o atlas nem busca âncoras. As posições não dependem da câmera ou da seleção.

Na fixture vigente, as âncoras finais `(x,z)` são S `(35,3456; −37,6606)` e R `(47,3847; −6,8108)`. As seis ruas horizontais equivalentes do núcleo compartilham `x=−3,41818`; Montevidéu e Brasília compartilham `z=13,37727`. A Alameda Mercosul conserva o trecho livre próprio porque o intervalo equivalente cruza oito copas existentes. As 43 identidades de texto mantiveram as mesmas âncoras entre os 14 estágios privados de câmera, seleção, filtro, clima e mobile, sem duplicações na camada.

## Arquivos principais

| Arquivo | Motivo |
| --- | --- |
| `utils/externalLotPresentation.ts` | Escopo, paleta, fases e deslocamentos compartilhados |
| `utils/externalLotFrameGeometry.ts` | Offset, validação, triangulação e cache |
| `components/canvas/ExternalLotFrames.tsx` | Batch e atualização de buffers das molduras |
| `components/canvas/CommercialMapCanvas.tsx` | Superfície, divisórias, realces, obstáculos e integração |
| `components/canvas/exporuralTurfMaterial.ts` | Grama nos dois materiais, composição e estado legado |
| `components/canvas/SoldLotLocks.tsx`, `utils/soldCheckGeometry.ts` | Confirmação instanciada e composição segura com logos |
| `utils/instancedMeshDisposal.ts` | Descarte seguro de primitivas controladas pelo R3F |
| `components/panels/ContextualMapLegend.tsx`, `public/PublicMapLegend.tsx` e CSS | Amostras específicas por escopo, com o contrato público preservado |
| `utils/territorialOrientation.ts`, `territorialOrientationInputs.ts`, `components/canvas/TerritorialOrientation.tsx` | Âncoras, alinhamento, identidade, atlas e cache |
| `src/test/*externalLot*`, testes territoriais e ExpoRural | Contenção, estados, regressões e preservação |
| `.github/workflows/commercial-map-spatial.yml` | Executar os novos testes de lotes e rótulos no CI existente |
| `scripts/external-lots/*` | Comparação reproduzível sem acesso de escrita ao backend |

## Ambiente e método

Baseline: commit `a72239afee1cb890ce1acff2f6ce2a55449826b2`, preservado em cópia imutável antes da implementação. As duas versões usam a mesma fixture oficial com estados e logo DEMO locais; `isSellable` é habilitado somente na cópia QA da prévia rural, cujo gerador original conserva o bloqueio da proposta.

Builds de produção da prévia, Chrome headless em macOS 26.6 / Apple M5, WebGL2 via ANGLE Metal. Desktop 1280×800 e viewport mobile 390×844, DPR 1. Perfis MEDIUM e LOW sem redução de resolução para compensar a mudança. As câmeras, iluminação e dados de cada par constam nos JSON das capturas.

Os cenários incluem as três áreas, vista superior e oblíqua, aproximação de recortes, lotes adjacentes, quatro estados privados, logos, dia/noite/chuva, filtro, seleção/fechamento, política pública, mobile e qualidade reduzida. Testes funcionais verificam transições, estabilidade de buffers/recursos, carrinho, inspeção, infraestrutura e opacidade.

As medições de navegação usam aquecimento, gestos de duração fixa e repetições sequenciais antes/depois/depois/antes. Frames ociosos são excluídos. A abertura é reportada pelo marcador real disponível no diagnóstico, sem equipará-lo automaticamente a login/checkout prontos.

## Checks e limitações

Os scripts existentes foram executados com os binários Node do ambiente (`tsc --noEmit -p tsconfig.app.json`, `vite build`, `vitest run`), equivalentes aos scripts `npm run typecheck`, `npm run build` e `npm test`; não foi necessária instalação de dependências.

A suíte completa de referência e a candidata apresentam **as mesmas 90 falhas**, verificadas por nome e cabeçalho do erro. Nenhuma falha nova na comparação. Há falhas históricas de snapshots/contratos, mocks e uma escrita de teste em `/opt/cursor/artifacts` indisponível neste macOS. Os detalhes e os testes dirigidos estão em [checks.json](checks.json).

**Limitação contratual do público:** a RPC vigente agrupa `SALE_OPEN` e `SOLD` em disponibilidade `SOLD` (contrato de três condições). O navegador não pode afirmar assinatura a partir desse dado. O caminho público preserva essa normalização e exibe gramado/moldura azul e logo autorizada, **sem check de confirmação** nos lotes externos ambíguos. A legenda pública mantém as três condições. Nenhuma migração, campo privado ou consulta adicional foi criada para contornar essa restrição. O privado dispõe dos quatro estados e exibe amarelo em aberto, azul e check em `SOLD`.

Não houve teste em Android/iPhone físico, sessão de produção, checkout real, contrato assinado ou acesso real por token. A prévia exercita os renderizadores e a política pública com dados locais autorizados para o teste. O resultado em outros aparelhos deve ser validado no hardware; emulação de viewport não substitui esse teste.

## Evidências comparáveis

Todos os pares usam as mesmas geometrias e dados, câmeras, viewport, buffer, iluminação e perfil. O vermelho visível é o estado **Bloqueado da fixture**, preservado da versão anterior. O logo DEMO é uma imagem local de teste.

| Cenário | Antes | Depois |
| --- | --- | --- |
| ExpoRural / Quadras S e R | [PNG](baseline-medium/exporural-top.png) | [PNG](candidate-medium/exporural-top.png) |
| ExpoRural / recortes e cantos | [PNG](baseline-medium/exporural-cutouts-close.png) | [PNG](candidate-medium/exporural-cutouts-close.png) |
| ExpoRural / oblíqua | [PNG](baseline-medium/exporural-oblique.png) | [PNG](candidate-medium/exporural-oblique.png) |
| ICS / ruas paralelas | [PNG](baseline-medium/industry-roads-top.png) | [PNG](candidate-medium/industry-roads-top.png) |
| ICS / aproximação oblíqua | [PNG](baseline-medium/industry-close.png) | [PNG](candidate-medium/industry-close.png) |
| Espaço do Automóvel | [PNG](baseline-medium/automotive-top.png) | [PNG](candidate-medium/automotive-top.png) |
| ExpoRural / mobile | [PNG](baseline-medium/exporural-mobile.png) | [PNG](candidate-medium/exporural-mobile.png) |
| Público / ICS | [PNG](baseline-medium/public-industry.png) | [PNG](candidate-medium/public-industry.png) |
| Perfil LOW / ICS mobile | [PNG](baseline-low/industry-mobile.png) | [PNG](candidate-low/industry-mobile.png) |

Os relatórios completos `report.json.gz` em cada perfil preservam todos os 15 estágios, incluindo noite, chuva, vista geral, filtro, clique, fechamento e aproximação. Os scripts geram todas as capturas; as imagens acima são a seleção versionada para revisão. O [índice de evidências](evidence-index.json) registra SHA-256, tamanho e localização do arquivo local completo, inclusive capturas adicionais não incluídas na PR. A interface existente foi exercitada por controles visíveis: [ficha desktop](interface/lot-details.png), [ficha mobile](interface/lot-details-mobile.png) e [legenda mista](interface/mixed-legend.png). O [logo com selo](functional/sold-logo.png) e o [relatório funcional](functional/report.json) cobrem a composição e as transições em memória.

## Resultados finais de desempenho

Fonte final: hashes dos 17 arquivos de renderização/política coincidem entre builds, capturas e medições; o código corresponde ao commit `3a8803a273dfcaad908a8706cdac88de556c0580`. O [resumo completo](comparison.json) preserva todas as repetições e mounts, sem misturar perfis ou rodadas de investigação.

Foram **48 repetições válidas e 11.520 amostras de frame**, sem amostra acima de 50 ms. Cada grupo contém seis gestos medidos (dois mounts × três repetições); o buffer existente retém os últimos 240 frames ativos de navegação/damping por gesto. Mediana convencional; p95 nearest-rank. Ociosidade é excluída. Resolução 1280×800, DPR 1 e caminho `direct` permaneceram iguais.

| Perfil / caminho | Frame mediano antes → depois | p95 antes → depois | Draw calls medianas | Triângulos medianos |
| --- | --- | --- | --- | --- |
| MEDIUM / Privado | 16,7 → 16,7 ms | 17,7 → 17,2 ms | 619 → 620 | 745.883 → 731.111 |
| MEDIUM / Público | 16,7 → 16,7 ms | 17,2 → 17,3 ms | 573 → 573 | 377.941 → 361.473 |
| LOW / Privado | 16,7 → 16,7 ms | 17,4 → 17,5 ms | 619 → 620 | 745.883 → 731.111 |
| LOW / Público | 16,7 → 16,7 ms | 17,1 → 17,2 ms | 573 → 573 | 377.941 → 361.473 |

A mediana permaneceu estável; as diferenças de p95 nos pares finais ficaram entre −0,5 e +0,1 ms. Isso descreve este ambiente, sem garantir o mesmo comportamento em hardware móvel.

**Há custo residual de abertura.** O marcador `documentToInteractiveMs` verifica preparação essencial, controles instalados e frames apresentados; não mede autenticação, dados remotos ou conclusão de uma operação comercial. Há somente **n=2 mounts por versão/perfil/caminho**, amostra exploratória. Os tempos individuais e o acréscimo médio observado são:

| Perfil / caminho | Baseline, por mount (ms) | Candidato, por mount (ms) | Diferença entre médias |
| --- | --- | --- | --- |
| MEDIUM / Privado | 3789 / 3842 | 3966 / 3955 | +145 ms |
| MEDIUM / Público | 2115 / 2100 | 2183 / 2213 | +90,5 ms |
| LOW / Privado | 3894 / 3842 | 3954 / 3921 | +69,5 ms |
| LOW / Público | 2112 / 2117 | 2198 / 2198 | +83,5 ms |

Não se afirma ausência de regressão de abertura: os offsets e o posicionamento adicionam trabalho inicial, calculado uma vez e depois reutilizado. A investigação identificou cerca de 300–400 ms extras de preparação na primeira implementação. Broadphase de obstáculos, fallback lazy e otimização dos offsets reduziram esse custo sem mudar os resultados geométricos; veja [perfil dos rótulos](label-layout-profile.json) e [perfil das molduras](frame-build-profile.json).

### CPU e GPU medidos separadamente

Uma rodada ABBA independente, MEDIUM, habilitou o controle existente **Medir CPU/GPU (DEV)**. `EXT_disjoint_timer_query_webgl2` e `WEBGL_multi_draw` estavam disponíveis. CPU representa somente envio de comandos; GPU usa queries reais. Cada célula abaixo lista os dois mounts, sem calcular um p95 agregado a partir de p95s.

| Caminho / versão | CPU média por mount (ms) | GPU média por mount (ms) | GPU p95 por mount (ms) |
| --- | --- | --- | --- |
| Privado / baseline | 3,87 / 3,925 | 12,679 / 11,367 | 14,524 / 14,236 |
| Privado / candidate | 4,144 / 3,997 | 12,17 / 11,301 | 14,431 / 14,468 |
| Público / baseline | 3,714 / 3,774 | 4,715 / 5,092 | 7,934 / 5,169 |
| Público / candidate | 3,718 / 3,588 | 4,72 / 3,382 | 7,829 / 5,156 |

As distribuições GPU se sobrepõem; não foi demonstrado um aumento consistente nessa rodada. O envio CPU privado teve acréscimo médio de aproximadamente 0,17 ms. Houve zero queries disjoint e duas dropped no último baseline privado; os demais mounts tiveram zero dropped. Queries ainda pendentes (1–7 por snapshot) não entram nas distribuições resolvidas. A variação entre rodadas impede atribuir ganho causal ao detalhe do gramado apenas pela ablação de um uniform. A variante final reutiliza `ParkSurface` e elimina cálculo redundante por construção.

### Custo de recursos e integridade

O novo batch acrescenta **três texturas internas compartilhadas** do Three.js (`_matricesTexture`, `_indirectTexture`, `_colorsTexture`), sem textura ou requisição por lote. Na navegação, texturas passaram de 111→114 no privado e 97→100 no público; programas, 244→246 e 121→122. Geometrias observadas: 589→590–591 no privado, 539→540 no público. O batch contém 269 instâncias, 162 ativas na fixture e 3.198 triângulos ativos (capacidade 4.882). O acréscimo privado mediano foi um draw call; no público, a remoção dos marcadores ambíguos compensou esse draw.

Cinco ciclos de status no teste funcional conservaram as alocações de geometria/textura após aquecimento. Desligar o culling por instância não apresentou ganho causal no diagnóstico e a configuração original foi mantida. Não foram reduzidos DPR, resolução ou conteúdo para compensar a alteração.

As 60 capturas finais passaram: mesmos hashes dos dados completos, lotes e geometrias, mesmas câmeras/viewport/buffer/clima, sem erro de página ou perda de contexto. As 43 identidades de rótulo não se duplicaram nem mudaram de âncora durante os 14 estados privados. O teste funcional e o fluxo de interface também passaram.

## Reprodução local

Usar o mesmo `node_modules` nas duas versões. O arquivo `scripts/external-lots/qa.vite.config.ts` transforma apenas o build de diagnóstico; o build normal não o importa. O servidor existente aceita somente GET/HEAD e a prévia aponta para `qa.invalid`.

```sh
# Baseline extraído do commit informado em diretório separado.
MAP_QA_ROOT=/tmp/external-lot-baseline MAP_QA_OUT=/tmp/external-lot-baseline-dist MAP_QA_REVISION=a72239afee1cb890ce1acff2f6ce2a55449826b2 node node_modules/vite/bin/vite.js build --config scripts/external-lots/qa.vite.config.ts
MAP_QA_OUT=/tmp/external-lot-candidate-dist node node_modules/vite/bin/vite.js build --config scripts/external-lots/qa.vite.config.ts
# Manter cada servidor em um terminal.
MAP_QA_PORT=4241 node scripts/constrained-devices/serve.cjs /tmp/external-lot-baseline-dist
MAP_QA_PORT=4242 node scripts/constrained-devices/serve.cjs /tmp/external-lot-candidate-dist
```

Com Playwright resolvível no ambiente (ou `PLAYWRIGHT_MODULE` apontando para sua instalação) e Chrome instalado:

```sh
LOT_QA_LABEL=baseline LOT_QA_URL=http://127.0.0.1:4241 node scripts/external-lots/visual.cjs
LOT_QA_LABEL=candidate LOT_QA_URL=http://127.0.0.1:4242 node scripts/external-lots/visual.cjs
# Repetir as duas capturas com LOT_QA_QUALITY=LOW.
node scripts/external-lots/functional.cjs
node scripts/external-lots/interface.cjs
# Executar isoladamente, sem builds, testes ou outro browser QA concorrente.
node scripts/external-lots/performance.cjs
LOT_QA_QUALITY=LOW LOT_PERF_OUTPUT=docs/validation/external-lots/performance-low node scripts/external-lots/performance.cjs
# Diagnóstico CPU/GPU separado, com a medição realmente habilitada.
node scripts/external-lots/timing.cjs
node scripts/external-lots/summarize.cjs
```
