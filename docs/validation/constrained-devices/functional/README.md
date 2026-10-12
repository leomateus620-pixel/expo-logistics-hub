# Validação funcional e preservação visual

Base servida `8f3e871010ebfeab45824ba042183127da3b15e3`; candidato de código servido `38aff99abd08261e7523a1855ca074ff1c350008`, conferidos no manifest local. Chrome/ANGLE Metal em Apple M5, HIGH fixo, DPR 1, viewport 1366 × 768. Execuções sequenciais sem builds/testes/benchmarks concorrentes. Contextos de browser novos; cache de shaders/OS não controlado. Este host saudável não representa desktop integrado antigo nem Android fraco.

O candidato concluiu 26 cenários e registrou Vendas múltiplas/escritas como indisponível na fixture; zero erros de página. A comparação está em [functional-summary.json](functional-summary.json), com os resultados individuais e seus métodos. A baseline gráfica concluída é combinada com o percurso independente de interface `base-ui` que corrigiu precondições do harness. Falhas anteriores de seletor/filtro disabled e cascata do modo lista continuam preservadas fora dos passes, em `/tmp/fenasoja-map-functional`; os originais completos não estão duplicados na PR.

A interface foi operada por UI real em busca, filtro de situação habilitado na fixture, seleção, lista→3D e abertura/fechamento da dashboard. A dashboard foi exposta pelo mesmo transform **exclusivo do QA build** nos dois lados, sobre dados read-only, sem autenticar/grant de analytics. Durante a cobertura, o contador de apresentações não avançou; retorno preservou pose e identidade. As capturas originais da dashboard nos dois lados têm SHA256 idêntico `f7a4fbc4c880e909982215e378db747a27eb810b53e936029a3275e05db52d7d` (originais locais, omitidos desta seleção para evitar duplicação).

O percurso gráfico usa actions existentes do probe/store compilado para três segmentos e todos os interiores suportados na fixture: B1/B2/B3/B4/B5/B6/B8/B10 comerciais, B9 pecuária, D3 mirante e B12 sede. Foram exercitados noite/chuva/amanhecer, entrada/teclado/saída de Visita, resize, pointercancel e perda de captura, hidden/retorno e perda/restauração de contexto exclusivamente QA. Actions programáticas não são apresentadas como UI/picking ou validação de permissões. Captura foi estabelecida explicitamente por QA porque o OrbitControls instalado usa listeners document e não a estabelece sozinho. Hidden foi emulação DOM; resize usa a mesma GPU. Nenhum telefone, gesto de toque real, freeze/thaw do SO ou sessão térmica foi certificado.

## Causa de preparação, observada no proprietário de desenho

A injeção do marcador terminal real seguida de cinco pedidos de invalidação reproduziu na base: estado `failed` ausente, path sem `suspended`, erro sem ação visível e `gl.info.render.frame` avançando. No candidato, esses quatro predicados foram corretos e nenhum render foi submetido. O contador DOM de apresentações é limitado por publicação; na segunda baseline ficou constante apesar dos draws, portanto esse contador isolado não comprova suspensão. Retry existente recuperou renderer/câmera/controles/seleção/pose. [Evidência compacta](terminal-preparation-owner.json).

Esta é uma regressão causal de admissão e saída útil: um erro terminal de preparação não pode virar frame válido. O ensaio usa marcador QA; não fabrica shader realmente inválido nem comprova a causa de todos os relatos físicos.

## Cena e inventário equivalentes

O inventário principal é a fixture **2026** `OFFICIAL_REFERENCE_DATA` com `persistedStage=1`: 1.578 entidades/1.466 lotes. Não é leitura do projeto autorizado atual da produção, cuja população e dados permanecem não observados neste ensaio. A comparação SHA256 de IDs, geometria, vínculos, status, área e preços foi idêntica nos dois lados. Arrays de geometria/index/instanceMatrix/instanceColor da cena também tiveram SHA256 idêntico na mesma pose/buffer, antes e depois das alternâncias/recuperação.

| Amostra | Hash de geometria e instâncias, idêntico nos dois lados |
|---|---|
| Overview inicial | `2f28adb6fa7f602a20952efaf9472ef315f380f294c810158657703492ba855c` |
| Overview final após modos/recuperação | `9ae576ea088aeb4be951cacc96c1f21d34d5c93da6ea90edcedd13f016cf3f96` |
| Foco Exporural 2028 separado | `600b6ca5c4b76e751f7df870ade23c6c6205545d3556777878c1cee827e956c7` |

A fixture adicional Exporural 2028 usa o parâmetro já existente: 1.586 entidades/1.471 lotes. Ambos concluíram abertura, foco e screenshot/hash; não substitui a fixture 2026 das medições temporais nem comprova contagem persistida em produção.

No overview inicial ambos conservaram 1.505 objetos, 958 meshes, 23.573 instâncias, 639 geometrias e 101 texturas scene-owned. Bytes de ArrayBuffers CPU 18.230.978; estimativa por dimensões/formato 62.930.804 bytes. Na fixture 2028 foram 24.000 instâncias, 642 geometrias, 19.233.274 bytes CPU e 74.115.612 bytes estimados de texturas. Esses valores não são VRAM: targets, upload, residência e alocações de driver/shader não foram medidos. Materiais 705/706 e programas após recuperação variam com variantes aquecidas; não são tratados como ganho.

## Imagens originais selecionadas

[Overview antes](base-canonical-overview.png) e [depois](candidate-canonical-overview.png) têm a mesma pose/buffer/hash de conteúdo. A inspeção visual preserva parque, arquitetura, árvores, materiais e labels. Bytes dos PNGs diferem em conteúdo animado; não se declara igualdade pixel a pixel desse par.

[Pavilhão 13 antes](base-interior-B5.png) e [depois](candidate-interior-B5.png) conservam numeração/legibilidade e módulo 104. **PNG original idêntico**, SHA256 `4f7607e735844ec391d056126b346e156230eaac6a830e3518bdde250a052376`.

[Erro de preparação com ação disponível](candidate-preparation-failed.png) e [mapa após restauração](candidate-context-restored.png) documentam estados reais do candidato na fixture. Manifest das seis imagens, dimensões e telemetria estão no JSON. Não há resize/recompressão das imagens entregues.

O percurso não valida Vendas/checkout/contratos/parcelas/reservas/Storage/RPCs, contas de comissão, token público ou RBAC; depende do staging isolado ainda indisponível. Também não mede fluidez, latência física input-to-photon, GPU timer, aparelhos afetados ou memória térmica de 15–30 min. Os scripts e as lacunas são descritos em [functional-harness.md](../functional-harness.md) e [local-staging.md](../local-staging.md).
