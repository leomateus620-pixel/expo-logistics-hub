# Linhas de status dos lotes externos — FENASOJA 2028

Implementação e escopo em [IMPLEMENTATION.md](IMPLEMENTATION.md). A validação usa o renderizador WebGL real em builds de produção da rota de diagnóstico, com inventário rural autorizado e saneado, mais controles locais de ICS/Automóvel. O backend fica em `qa.invalid`, bloqueado por CSP; o servidor de loopback aceita apenas GET/HEAD. Nenhuma venda, assinatura, preço, geometria cadastral ou contrato foi alterado para os testes.

## Comparações visuais

Baseline: `main`, commit `1fd60a8378db2f234573a917ab171371c9f262f5`, extraído com `git archive` antes das mudanças. As duas versões usam a mesma fixture, câmeras, clima, viewport e buffer. Os hashes de dados, lotes e geometrias coincidem; o [resumo comparativo](comparison.json) e o [índice SHA-256](evidence-index.json) tornam os pares auditáveis. O manifesto de cada build registra os hashes dos arquivos de apresentação utilizados.

São **33 pares**, sem erro de página ou perda de contexto. Os originais PNG estão versionados. O perfil MEDIUM conserva a adaptação de capacidade existente: notebook 1366×768 e celular 390×844 usam DPR1; desktop 1920×1080 usa o buffer 1881×1058 (DPR0,98), igual nos dois builds. Navegação não foi usada para reduzir resolução. Ambiente: macOS 26.6, Apple M5, Chrome headless, ANGLE Metal. Viewports emulados não substituem validação em aparelhos físicos.

| Cenário | Antes | Depois |
| --- | --- | --- |
| ICS externo / ruas e quadras | [PNG](baseline-medium/industry-roads-top.png) | [PNG](candidate-medium/industry-roads-top.png) |
| ICS externo / aproximação | [PNG](baseline-medium/industry-close.png) | [PNG](candidate-medium/industry-close.png) |
| ExpoRural / S e R | [PNG](baseline-medium/exporural-top.png) | [PNG](candidate-medium/exporural-top.png) |
| ExpoRural / oblíqua | [PNG](baseline-medium/exporural-oblique.png) | [PNG](candidate-medium/exporural-oblique.png) |
| Vista geral intermediária | [PNG](baseline-medium/overview.png) | [PNG](candidate-medium/overview.png) |
| Vista distante | [PNG](baseline-medium/distant.png) | [PNG](candidate-medium/distant.png) |
| Azul / logo e confirmação separados | [PNG](baseline-medium/r59-close.png) | [PNG](candidate-medium/r59-close.png) |
| Amarelo / aproximação | [PNG](baseline-medium/yellow-close.png) | [PNG](candidate-medium/yellow-close.png) |
| Espaço do Automóvel | [PNG](baseline-medium/automotive-top.png) | [PNG](candidate-medium/automotive-top.png) |
| Recortes e cantos | [PNG](baseline-medium/exporural-cutouts-close.png) | [PNG](candidate-medium/exporural-cutouts-close.png) |
| Parcela irregular R21 | [PNG](baseline-medium/r21-close.png) | [PNG](candidate-medium/r21-close.png) |
| Disponível R40 / controle | [PNG](baseline-medium/r40-control.png) | [PNG](candidate-medium/r40-control.png) |
| Seleção por clique | [PNG](baseline-medium/selection.png) | [PNG](candidate-medium/selection.png) |
| Após fechar seleção | [PNG](baseline-medium/selection-closed.png) | [PNG](candidate-medium/selection-closed.png) |
| Filtro | [PNG](baseline-medium/filtered.png) | [PNG](candidate-medium/filtered.png) |
| Noite | [PNG](baseline-medium/exporural-night.png) | [PNG](candidate-medium/exporural-night.png) |
| Chuva | [PNG](baseline-medium/exporural-rain.png) | [PNG](candidate-medium/exporural-rain.png) |
| ExpoRural / celular | [PNG](baseline-medium/exporural-mobile.png) | [PNG](candidate-medium/exporural-mobile.png) |
| ICS / celular | [PNG](baseline-medium/industry-mobile.png) | [PNG](candidate-medium/industry-mobile.png) |
| Automóvel / celular | [PNG](baseline-medium/automotive-mobile.png) | [PNG](candidate-medium/automotive-mobile.png) |
| Geral / celular | [PNG](baseline-medium/overview-mobile.png) | [PNG](candidate-medium/overview-mobile.png) |
| Distante / celular | [PNG](baseline-medium/distant-mobile.png) | [PNG](candidate-medium/distant-mobile.png) |
| Geral / desktop | [PNG](baseline-medium/overview-desktop.png) | [PNG](candidate-medium/overview-desktop.png) |
| Distante / desktop | [PNG](baseline-medium/distant-desktop.png) | [PNG](candidate-medium/distant-desktop.png) |
| ExpoRural / desktop | [PNG](baseline-medium/exporural-top-desktop.png) | [PNG](candidate-medium/exporural-top-desktop.png) |
| ICS / desktop | [PNG](baseline-medium/industry-roads-top-desktop.png) | [PNG](candidate-medium/industry-roads-top-desktop.png) |
| Automóvel / desktop | [PNG](baseline-medium/automotive-top-desktop.png) | [PNG](candidate-medium/automotive-top-desktop.png) |
| Logo e selo / desktop | [PNG](baseline-medium/r59-close-desktop.png) | [PNG](candidate-medium/r59-close-desktop.png) |
| B5 / planta interna original | [PNG](baseline-medium/pavilion-interior.png) | [PNG](candidate-medium/pavilion-interior.png) |
| B5 / corte externo original | [PNG](baseline-medium/pavilion-cut.png) | [PNG](candidate-medium/pavilion-cut.png) |
| Público / ICS | [PNG](baseline-medium/public-industry.png) | [PNG](candidate-medium/public-industry.png) |
| Público / lote R59 | [PNG](baseline-medium/public-r59.png) | [PNG](candidate-medium/public-r59.png) |
| Público / ExpoRural | [PNG](baseline-medium/public-exporural.png) | [PNG](candidate-medium/public-exporural.png) |

Nos links públicos, a normalização de três condições continua agrupando venda aberta e confirmada em azul, sem check externo que afirme assinatura. As imagens públicas são da política de cena aplicada à fixture; não representam teste de token real, revogação ou acesso autenticado em produção.

## Cobertura, transições e preservação

A expectativa independente vem de lotes ativos descobertos com entidade `SELLABLE_LOT` ativa e relação canônica nos três segmentos; não depende do predicado visual nem de nomes/prefixos. A fotografia da fixture contém **277 esperados, 277 elegíveis e 277 superfícies renderizadas**, com **128 hachuras ativas**. A contagem é resultado do teste, sem limite fixo em runtime.

| Segmento | Disponível | Venda aberta | Vendido | Hachuras renderizadas |
| --- | ---: | ---: | ---: | ---: |
| ICS externo | 39 | 39 | 39 | 78 |
| Espaço do Automóvel | 18 | 17 | 17 | 34 |
| ExpoRural | 92 | 3 | 13 | 16 |

A fixture rural mantém revisões distintas, lotes R/S, parcela sem número e `isSellable=false` recebido. Os controles de status e logo fora do inventário rural são explicitamente locais. O [relatório funcional](functional/report.json.gz) exercita os três segmentos em `AVAILABLE → SALE_OPEN → SOLD → AVAILABLE → BLOCKED → SOLD`, consulta a máscara efetivamente instalada no batch e compara identidades dos buffers. Também verifica hover, seleção, seleção fora do filtro, camada oculta, infraestrutura, cinco ciclos de status e política pública. Não usa localStorage como fonte de status nem escreve no banco.

O [controle dedicado de pavilhão](pavilion-controls/report.json.gz) põe **um módulo B5 em SALE_OPEN e outro em SOLD**, exclusivamente na cópia de memória de cada build. Compara byte hashes de matrizes e cores dos módulos, geometria/cores/matrizes dos cadeados e propriedades dos materiais. Os resultados de antes/depois são iguais na planta e no corte, sem atributo de hachura externa nos módulos. Pares: [planta antes](pavilion-controls/baseline-interior.png), [planta depois](pavilion-controls/candidate-interior.png), [corte antes](pavilion-controls/baseline-cut.png), [corte depois](pavilion-controls/candidate-cut.png).

Os [controles geométricos separados](geometry/report.json.gz) acrescentam seis parcelas sintéticas fora do parque apenas com `statusGeometryQa=1`: retângulo rotacionado, trapézio, concavidade, furo, faixa estreita e chanfros. A mesma superfície real é exercitada em [vista superior](geometry/candidate-top.png), [oblíqua](geometry/candidate-oblique.png) e [câmera rotacionada](geometry/candidate-rotated-camera.png), com os equivalentes baseline na mesma pasta. Furos e reentrâncias ficam livres; trechos de uma mesma diagonal permanecem separados pelo polígono. A fase e a orientação ficam presas ao terreno.

## Limites visuais observados

As linhas e bordas intensas são distinguíveis nas vistas médias, onde o contraste anterior se perdia na grama. Nas aproximações macro de R59, os traços chegam a aproximadamente **6–8 pixels CSS**, acima das metas iniciais de 1,5–3 px para linhas e 2–4 px para bordas; o limite de cobertura preserva intervalos verdes maiores. Essa calibração prioriza o espaço verde e a distribuição relativa ao lote. As metas não são alegadas como cumpridas em todos os zooms.

Na vista distante e em parcelas estreitas, a filtragem analítica converge para uma presença cromática média dentro da área projetada. Linhas individuais deixam de ser resolvíveis quando seus intervalos ocupam poucos pixels; lotes subpixel não ganham área aparente nem detalhes inventados. As capturas não demonstram legibilidade de números ou checks abaixo da resolução. A alternância de câmera não refaz geometrias ou gira o padrão com a tela.

## Desempenho

Os números finais são apresentados no [resumo comparativo](comparison.json), com todos os samples preservados em [performance/report.json.gz](performance/report.json.gz). O ensaio alterna seis contextos isolados (`A B B A A B`), **três aberturas por versão e por caminho privado/público**, dois gestos de aquecimento e três giros medidos por abertura. Cada gesto conserva até 240 frames ativos do diagnóstico existente. Ociosidade é excluída; mediana convencional e p95 nearest-rank são calculados sobre as amostras completas.

`documentToInteractiveMs` é o marcador de prontidão da cena (controles e frames apresentados), sem incluir autenticação/dados remotos. A sonda de interação mede mudança de hover até dois `requestAnimationFrame`; não mede conclusão de uma venda ou tempo completo de tarefa. Frames de navegação são intervalos de rAF sincronizados ao monitor (~60 Hz); a mesma mediana pode esconder diferenças de custo GPU que ainda cabem no orçamento do frame. O timer GPU separado não foi habilitado nesta rodada, portanto não se infere custo GPU zero. Draw calls incluem todos os passes, como no diagnóstico existente. A sonda de sombra conta `renderBufferDirect` durante `shadowMap.render`; recursos registram geometrias, texturas, programas e materiais únicos presentes na cena. Requisições são entradas Resource Timing da prévia local.

| Caminho | Abertura mediana (ms) | Hover até 2 frames (ms) | Frame mediano (ms) | p95 de frame (ms) | Draw calls medianas |
| --- | ---: | ---: | ---: | ---: | ---: |
| Privado, antes → depois | 4.007 → 3.941 | 31,0 → 30,7 | 16,7 → 16,7 | 16,9 → 17,7 | 662 → 662 |
| Público, antes → depois | 2.317 → 2.318 | 30,9 → 30,4 | 16,7 → 16,7 | 17,4 → 17,3 | 605 → 605 |

Foram **36 gestos válidos e 8.640 amostras de frame**, com zero frame acima de 50 ms (máximo 18,7 ms). Cada grupo contém 2.160 amostras, nove gestos e três aberturas independentes. O p95 privado aumentou **0,8 ms (~4,7%)**; a mediana permaneceu estável. Não houve regressão repetida acima de 5% na mediana neste ensaio. As pequenas diferenças de abertura/interação ficam dentro da variação de apenas três mounts, sem atribuir ganho causal ao shader.

| Recurso durante navegação | Privado, antes → depois | Público, antes → depois |
| --- | ---: | ---: |
| Geometrias | 606 → 606 | 543 → 543 |
| Texturas | 117 → 117 | 100 → 100 |
| Programas | **262 → 264** | 125 → 125 |
| Materiais únicos na cena | 742 → 742 | 673 → 673 |
| Recursos de rede por abertura | 54 → 54 | 47 → 47 |
| Passes de sombra por gesto medido | 1 → 1 | 0 → 0 |
| Draw calls de sombra por gesto medido | 326 → 326 | 0 → 0 |
| Triângulos medianos por frame amostrado | 735.522 → 735.522 | 371.795 → 371.795 |

Há custo real de dois programas adicionais observados no privado e dos atributos de vértice do tema. A integração reutiliza o batch e não acrescentou draw calls medianas, geometrias, materiais, texturas, requisições ou passes de sombra no ensaio. O teste de cinco ciclos reteve recursos após aquecimento. Esses números descrevem este ambiente e não garantem custo GPU zero ou resultado idêntico em celulares físicos. O DPR permaneceu 1 durante todos os gestos medidos.


## Verificação e reprodução

Os comandos de instalação, typecheck, build e testes e a comparação das falhas existentes estão em [checks.json](checks.json). Não houve publicação em produção nesta tarefa.

```sh
# Node e npm disponíveis no PATH; instalar conforme AGENTS.md.
npm install
npm run typecheck
npm run build
npm test

# Mesmo node_modules compartilhado na baseline extraída via git archive.
MAP_QA_ROOT=/tmp/status-lines-baseline MAP_QA_OUT=/tmp/status-lines-baseline-dist MAP_QA_REVISION=1fd60a8378db2f234573a917ab171371c9f262f5 node node_modules/vite/bin/vite.js build --config scripts/external-status-lines/qa.vite.config.ts
MAP_QA_OUT=/tmp/status-lines-candidate-dist node node_modules/vite/bin/vite.js build --config scripts/external-status-lines/qa.vite.config.ts
MAP_QA_PORT=4261 node scripts/constrained-devices/serve.cjs /tmp/status-lines-baseline-dist
MAP_QA_PORT=4262 node scripts/constrained-devices/serve.cjs /tmp/status-lines-candidate-dist

# Playwright resolvível, ou PLAYWRIGHT_MODULE=/caminho/para/playwright.
LOT_QA_LABEL=baseline LOT_QA_URL=http://127.0.0.1:4261 node scripts/external-status-lines/visual.cjs
LOT_QA_LABEL=candidate LOT_QA_URL=http://127.0.0.1:4262 node scripts/external-status-lines/visual.cjs
node scripts/external-status-lines/geometry.cjs
node scripts/external-status-lines/pavilion-controls.cjs
node scripts/external-status-lines/functional.cjs
# Executar isolado: nenhum outro browser QA, build ou suite de testes.
node scripts/external-status-lines/performance.cjs
node scripts/external-status-lines/summarize.cjs
```
