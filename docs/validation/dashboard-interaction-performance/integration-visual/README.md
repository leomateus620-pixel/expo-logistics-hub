# Comparação visual após integrar a main recente

Referência: `origin/main` em `9f2ee99644706a54620e8e5ae7dc1e412df07ed3`, extraída em um novo arquivo Git no Temp, com junction de dependências. Candidato: resolução local da integração da otimização com essa referência. Os arquivos históricos de performance permanecem intactos; esta verificação **não mede ganho de performance após a integração**.

Foram usados o fixture existente de inspeção de pavilhões e uma cópia limitada do runner existente, com os mesmos dados nos dois lados. Chrome 154 headless, Windows, DPR 1; notebook 1366 × 768 e mobile 390 × 844 com toque emulado. O Sojinha foi pausado pelo controle existente, e sua fase CSS foi alinhada em zero somente no QA.

| Comparação | Resultado |
| --- | --- |
| Geometria, IDs, números, preços, situações e agregados de P8/P13 | Idênticos nos dois viewports |
| Layout das regiões superiores e seletores | Idêntico nos dois viewports |
| DOM do SVG e cartão selecionado, incluindo posições e textos | Idêntico; atributos ordenados para comparação, sem ignorar valores |
| PNGs notebook | 11/11 pares idênticos, zero pixels alterados |
| PNGs mobile | 10/11 pares idênticos; divergência estrita na primeira visão geral |
| Controles independentes da visão geral mobile | Duas capturas da main e duas do candidato mutuamente idênticas |

Os 22 pares incluem visão geral e, para Pavilhões 8 e 13, planta, análise integrada, área oficial pendente/conhecida e inspeção selecionada. P8 mantém 114 módulos; P13 mantém 104. Todos os quatro cenários preservam hashes de geometria e dados comerciais, encaixe, numeração, apoios, acessos e limites. As novas apresentações de inspeção da main foram mantidas.

A primeira visão geral mobile do candidato difere em 9.685 pixels, com diferença máxima de **1 por canal**. As duas capturas posteriores do mesmo candidato coincidem exatamente com as duas capturas independentes da main e com a referência original. Portanto, há variação observada entre capturas do mesmo código. O resultado estrito original continua **21/22**, e o comparador conserva `allPassed: false` e código de saída 1 para esse par; não foi introduzida tolerância. Os controles e os resultados DOM são registrados separadamente em [comparison.json](comparison.json).

As interações passaram nas duas versões: prévia por foco e hover, seleção fixa, Escape preservando seleção/foco, duas etapas oficiais, preço zero, comprador, callback existente para o mapa, posicionamento nos quatro extremos, zoom, scroll, atualização comercial preservando seleção/zoom e ajuste da planta. O mobile inclui toque. Também foi verificado fluxo sem overflow horizontal nas larguras 320, 390, 768, 1000, 1366 e 1920 px. Houve zero erros da aplicação e zero chamadas ao backend nos percursos concluídos.

A primeira carga fria do servidor da referência falhou durante troca dos chunks React pelo otimizador Vite; o percurso completo passou na repetição aquecida. O candidato teve a descoberta de dependências aquecida antes das asserções. Não são evidências de aplicação autenticada, produção, WebGL, dispositivo físico, Safari/iOS ou desempenho universal.

Artefatos: [referência notebook](before-notebook.json), [candidato notebook](after-notebook.json), [referência mobile](before-mobile.json), [candidato mobile](after-mobile.json), quatro diretórios `control-*` e comparação estrita. Os runners de reprodução são `scripts/dashboard/integration-visual-browser.cjs` e `scripts/dashboard/compare-integration-visual.cjs`. Execute o runner a partir do checkout correspondente para que `__dirname` e a entrada `@fs` usem a mesma origem do Vite. Variáveis: `DASHBOARD_BASE_URL`, `DASHBOARD_EVIDENCE_LABEL=before|after`, `DASHBOARD_VIEWPORTS=notebook,mobile`, `DASHBOARD_EVIDENCE_DIR`, `PLAYWRIGHT_MODULE`; o comparador aceita também `PNGJS_MODULE`. `DASHBOARD_OVERVIEW_ONLY=1` gera os controles e `DASHBOARD_PREWARM_ONLY=1` apenas aquece a descoberta de dependências.
