# ExpoRural — árvore, conjunto elétrico e ciclo da soja

Implementação sobre `d1490efe58f130d107faaec1affc6e008182bcd1`, com cadastro vigente **2028-exporural-2026-10-20.1** conferido por leitura do projeto Lovable Fenasoja Log (`756eeb64-0d44-4171-b445-f8a60f0492c0`). A branch altera apresentação e interação 3D. Não executa migração, reparcelamento, atualização de preço, venda ou contrato, nem publicação em produção.

## Implantação conferida

As coordenadas são locais da cena. Os pontos e envelopes foram confrontados com as geometrias carregadas; fotos sem escala orientam a forma, sem fornecer cotas topográficas.

| Elemento | Implantação local | Referência |
| --- | --- | --- |
| Árvore `tree-exporural-r01-01` | x 8,625689; z −18,940; y 0,134 no snapshot | Dentro de Q-R-01, 896,85 m² preservados, junto à testada da Rua Gustavo Bessel e alinhada ao poste 146 do outro lado. |
| Conjunto `exporural-r34-transformer-assembly` | centro x 30,880; z −21,050; y 0,036 | Envelope inteiro em Q-R-34. Dois apoios altos e um central baixo, plataforma, transformador, isoladores e luminária. |
| Soja plantável | x 43–61; z −57,2–−51,8; y 0,024 | Subconjunto da superfície de entorno `northern-open-parcels`, fora dos lotes, estacionamento e vias protegidas. |
| Cabeceiras e acesso | envelope x 39–66,5; z −59,5–−48,4 e corredor separado | Acesso cenográfico até o trecho existente da BR-472 (`osm-431693361-0`), sem criar rua cadastral. |
| Colheitadeira final | x 62,5; z −52,7; orientação π/2 | Estacionada com tubo recolhido. |

Os marcadores elétricos de origem 134/135/136 foram identificados espacialmente, e não pelo número comercial do lote. A revisão concentra seus apoios/terminais no conjunto de Q-R-34, redireciona as ligações e conserva o poste 138 em Q-R-38. A discrepância entre as divisas indicadas nas capturas e as projeções antigas está explicitada no [registro permanente](permanent-placement.md).

- [Planta superior: árvore e conjunto elétrico](implantacao-permanente.svg)
- [Planta superior: lavoura, exclusões, cabeceiras e acesso](soy-layout-topview.svg)
- [Dados persistidos consultados, sem compradores ou preços](persisted-placement-reference.json)
- [Dimensões, fontes e condições de uso dos modelos](soy-layout-and-assets.md)

## Experiência implementada

O primeiro acesso apresenta soja verde adulta. O comando **Ver ciclo da soja** carrega as máquinas e prepara os shaders localmente; só então inicia o relógio único de 48 segundos.

| Intervalo | Ação |
| --- | --- |
| 0–6 s | Trator e plantadeira, sementes e máscara de plantio por passagem. |
| 6–16 s | Emergência, ramificação, folhas largas trifolioladas e vagens. |
| 16–21 s | Pulverizador com barras abertas e névoa discreta. |
| 21–27 s | Maturação gradual, amarelecimento e perda de folhas. |
| 27–37 s | Plataforma de soja e molinete ativos; remoção apenas nas faixas colhidas. |
| 37–44 s | Aproximação, abertura do tubo, grãos entrando na caçamba, enchimento e recolhimento. |
| 44–48 s | Saída do caminhão pelo acesso e colheitadeira estacionada em destaque. |

O tempo agrícola é comprimido: dissoluções breves ocultam o reposicionamento entre passadas, enquanto os trechos visíveis mantêm velocidade compatível com a escala. O final do transporte tem elipse depois de o caminhão sair integralmente do enquadramento; o percurso geométrico alcança o asfalto. Não é simulação de produtividade nem duração real de cultivo.

Pausa congela o relógio, veículos e partículas. Aba oculta pausa sem retomada automática. Esc/cancelamento restaura o campo verde; conclusão preserva o campo colhido e a máquina. Voltar ao mapa restitui a câmera e a seleção; rever inicia uma sessão; restaurar lavoura desmonta os modelos. Redução de movimento oferece câmera estável e navegação por etapas. Erro de carregamento permanece local e permite tentar novamente.

## Arquivos principais

Os dados leves estão em `data/exporuralSceneCorrections.ts` e `data/soyHarvestLayout.ts`. As correções permanentes usam `CommercialTreeLayer`, o adaptador de apresentação elétrica e `ExporuralTransformerAssembly`. A lavoura inicial é `SoyFieldStaticLayer`.

O diretório `harvest/` separa timeline pura, store, lifecycle, preparação local, câmera, modelos, cena e interface. `SoyHarvestLayer` delimita a importação dinâmica. O CameraRig existente aplica as poses e restaura os controles. `CommercialMapPage`, `CommercialMapTopBar` e `MapToolbar` integram o escopo e o comando. Detalhes de propriedade de recursos e arbitragem estão em [integração e validação](integration-and-validation.md).

## Validação executada

`npm run typecheck` e `npm run build` passaram no código final. A rodada direcionada final aprovou **83 testes em 14 arquivos**, incluindo câmera, seleção comercial, timeline, modelos, implantação, descarga, falha de contexto, descarte de buffers e envelopes completos na spline real. O teste espacial identificou a necessidade de ampliar o acesso para **0,96 unidade (6,4 m)** e fechar as junções do piso; o teste portrait verificou plataforma e caminhão inteiros com margem de 5% no Canvas 390×766.

A suíte completa final terminou com **3.989 testes aprovados e 90 falhas**, contra 3.937 aprovados e as mesmas 90 falhas na base. Os nomes das 90 falhas coincidem; nenhuma nova falha foi acrescentada. A comparação por nome está em [test-comparison.json](evidence/test-comparison.json); não foram alteradas expectativas para esconder essas falhas. Os avisos existentes de Browserslist e tamanho de chunks não impediram o build. Dependências e lockfile foram preservados; não foi necessário instalar ou atualizar pacotes do projeto.

## Desempenho medido

Chrome **156.0.8078.47**, Apple M5 / ANGLE Metal, viewport **1366×768**, DPR **1**, mesmo replay e navegação. Foram três pares alternados, cada um em contexto novo, com Vite e caches do sistema/GPU aquecidos. A comparação é do harness de desenvolvimento; tempos e bytes não representam uma medição em produção. [Resumo](evidence/performance-summary.json) e [amostras completas](evidence/performance-paired.json).

| Medida | Base | Implementação |
| --- | ---: | ---: |
| Tempo até interação, mediana | 4.027 ms | 4.022 ms |
| Navegação, mediana de frame | 16,7 ms | 16,7 ms |
| Navegação, mediana dos p95 por execução | 18,1 ms | 18,1 ms |
| Draw calls na abertura | 1.126 | 1.136 |
| Geometrias / texturas na abertura | 573 / 111 | 579 / 111 |
| Programas de shader na abertura | 199 | 207 |
| Triângulos na abertura | 1.085.369 | 1.153.813 |
| Requisições observadas no harness Vite | 549 | 563 |
| Transferência na abertura, mediana Vite | 31.966.879 bytes | 32.182.085 bytes |

A diferença de −0,12% no tempo mediano está dentro da variação e não é tratada como ganho. Não apareceu regressão mediana acima de 5% na abertura ou navegação. As 14 solicitações extras de desenvolvimento são módulos leves; não houve solicitação das máquinas ou do runtime antes do clique.

O [build comparativo](evidence/bundle-sizes.json) estima **12.165 bytes gzip de JavaScript + 396 bytes de CSS** adicionais fora do runtime (aproximadamente **12,3 KiB**, abaixo da meta de 15 KiB). É uma diferença conservadora entre assets emitidos, não uma captura de transferência de uma entrada específica. O pacote sob demanda tem **21.409 bytes brutos / 8.721 bytes gzip** e usa modelos procedurais próprios; não há arquivos externos de máquinas. Nenhuma dependência foi atualizada.

Na gravação real de 48 segundos, o renderer entregou **2.886 amostras**, com mediana **16,7 ms** e p95 **18,8 ms**, enquanto o vídeo também era codificado. As chamadas variaram com o enquadramento (mediana 87, máximo 437). A lavoura usa **duas chamadas distante / quatro próxima**; próxima submete aproximadamente **1.044.000 triângulos**, distante 54 mil. Mesmo colhida, as plantas ainda são submetidas e descartadas pelo shader: esse custo está explicitado, não ocultado pela baixa contagem de draws. A maior amostra do mapa durante o ciclo foi 1.658.438 triângulos.

O heap JavaScript bruto na abertura variou com a coleta de lixo: medianas de 179.383.219 e 199.384.844 bytes, com sobreposição das faixas entre execuções. Uma [investigação separada de três pares após coleta explícita](evidence/memory-retained.json) encontrou medianas retidas de **76.557.044 → 77.309.140 bytes** (**+752.096 bytes; +0,98%**). A coleta forçada não foi usada nas medições de tempo acima.

Após três repetições com cancelamento, as contagens ficaram estáveis em **592 geometrias, 137 texturas e 250 programas**. Houve uma diferença de uma geometria entre a primeira restauração e o primeiro replay, após seleção/painel adicional; seu proprietário não foi identificado e ela não cresceu nas três repetições. Os testes de limpeza verificam separadamente o descarte dos buffers de instâncias, que não são medidos por essa contagem. Não se afirma medição exata de bytes de memória GPU.

## Evidências visuais

[Vídeo real do ciclo](evidence/soy-cycle-48s.webm): gravação contínua do Canvas após o carregamento, sem aceleração na edição; relógio da experiência de 48 s e término observado em **48,18 s**. O arquivo foi decodificado e conferido em cinco momentos; sua duração de mídia é **48,009 s**, conforme [metadados da conferência](evidence/video-decode.json). Interface e comandos aparecem nas capturas separadas.

| Conferência | Capturas |
| --- | --- |
| Antes da alteração | [Visão geral](evidence/baseline-overview.png), [lote 01](evidence/baseline-r01.png), [postes](evidence/baseline-poles.png) |
| Correções permanentes | [Árvore superior](evidence/tree-top.png), [oblíqua](evidence/tree-oblique.png), [conjunto próximo](evidence/transformer-close.png), [contexto](evidence/transformer-context.png) |
| Primeira abertura | [Lavoura verde](evidence/field-initial.png) |
| Sete fases, desktop 1920×1080 | [Plantio](evidence/desktop-planting.jpg), [crescimento](evidence/desktop-growth.jpg), [manejo](evidence/desktop-management.jpg), [maturação](evidence/desktop-maturation.jpg), [colheita](evidence/desktop-harvest.jpg), [descarga](evidence/desktop-unloading.jpg), [transporte](evidence/desktop-transport.jpg) |
| Composição final | [Colheitadeira estacionada](evidence/cycle-final.png) |
| Notebook 1366×768 | [Verde](evidence/notebook-initial.jpg), [crescimento](evidence/notebook-growth.jpg), [descarga](evidence/notebook-unloading.jpg), [final](evidence/notebook-final.jpg) |
| Celular 390×844 | [Verde](evidence/mobile-initial.jpg), [crescimento](evidence/mobile-growth.jpg), [descarga](evidence/mobile-unloading.jpg), [final](evidence/mobile-final.jpg) |
| Ambientes e acessibilidade | [Noite](evidence/desktop-night.jpg), [chuva](evidence/desktop-rain.jpg), [movimento reduzido](evidence/desktop-reduced-motion.jpg) |

A [falha de download simulada](evidence/failure-recovery.json) manteve o mapa verde e a câmera utilizável; “Tentar novamente” iniciou o ciclo, e Esc encerrou. As duas mensagens de erro nesse registro são esperadas da fronteira local em desenvolvimento.

O [registro de QA](evidence/visual-validation.json) confirma zero erros de página nos três tamanhos, seleção real de lote antes e depois, preservação da seleção durante a experiência, retorno da câmera/controles, pausa, Esc, aba oculta e repetição. A mudança portrait/landscape conserva a posse e o tempo pausado; o far plane pode adaptar-se à viewport. O [registro do ciclo contínuo](evidence/cycle-result.json) contém as amostras reais e confirma **zero solicitações de modelos/runtime antes do clique**.

## Reprodução local das evidências

O harness reutiliza o replay de outubro e o Canvas real, sem autenticação de produção, escrita de banco ou rota nova na aplicação. Os estados comerciais do fixture servem apenas à conferência visual; não são uma fotografia atual de vendas.

```sh
npm run typecheck
npm run build
npm test -- --maxWorkers=2
node node_modules/vite/bin/vite.js \
  --config scripts/exporural/official-2026-10-20/review.vite.config.ts \
  --port 5199 --host 127.0.0.1
```

Com Chrome e Playwright disponíveis, executar em outro terminal:

```sh
# PLAYWRIGHT_MODULE pode apontar ao módulo já instalado no ambiente.
node scripts/exporural/soy-validation.cjs
node scripts/exporural/soy-cycle-browser.cjs
node scripts/exporural/soy-failure-browser.cjs
# Requer também o checkout-base, com o mesmo harness em localhost:5198.
node scripts/exporural/soy-performance.cjs
# Investigação separada de memória retida, com coleta explícita:
node scripts/exporural/soy-memory.cjs
```

As capturas por etapa usam uma busca de tempo exclusiva do harness para inspecionar cada composição pausada. O vídeo é uma reprodução contínua em tempo real acionada pelo botão da interface. Os scripts não são entradas de build de produção.

## Limites de fidelidade

Foram fornecidos oito anexos efetivos; a associação foi feita pelo conteúdo. A mancha exterior foi identificada por sua camada real, e o plantio usa um subconjunto seguro dela. Dimensões dos modelos e recuos permanecem aproximações de apresentação. As máquinas são modelos procedurais próprios com silhuetas e detalhes inspirados nas fontes primárias, sem download de modelos de terceiros. A árvore não recebe identificação botânica sem evidência.

As medições locais do harness permitem comparar a alteração sob condições equivalentes; não substituem desempenho em celulares físicos nem validam toda a matriz de navegadores, redes e GPUs. A emissão noturna é limitada aos materiais próprios das máquinas. Nenhuma redução global de DPR foi introduzida.

Ao alternar a orientação do dispositivo, o enquadramento responsivo é recalculado imediatamente; a pausa e a posse da câmera são preservadas. Não foi adicionada uma transição animada específica para essa mudança de orientação.
