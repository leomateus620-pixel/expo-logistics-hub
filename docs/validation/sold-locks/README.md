# Lotes vendidos: superfície vermelha e cadeado 3D

Implementação local de 24/09/2026, baseada em `2d94d9b43b419375174e7afa9cf565eb6018be7f`.

## Comportamento

- `SOLD` tem prioridade sobre cores de segmento, filtros, hover, seleção pública e realce residual do carrinho. Outros status mantêm a apresentação anterior.
- `SoldLotLocks` é compartilhado pelos lotes externos e módulos internos/recortes de pavilhões. Não adiciona Canvas, câmera, query comercial, persistência, textura ou listener por lote.
- Cadeado fechado com corpo chanfrado grafite, arco cinza e face amarela voltada para cima. Uma geometria de 182 triângulos, um material e uma draw call instanciada por camada. Sem sombras adicionais ou raycast.
- Ponto interno calculado com distância às bordas, furos e construções cadastradas próximas. Escala limitada pelo círculo de folga e por um teto de 1,2 unidades; não cresce artificialmente com o zoom. Módulos usam o mesmo frame da geometria existente e uma posição segura afastada do número central.
- A atualização da query altera vermelho/cadeado sem reload. A saída de `SOLD` remove o marcador. Geometria e material do cadeado permanecem estáveis durante atualizações de status.
- Clique em lote/módulo `SOLD` é consumido no Modo Vendas mesmo com elegibilidade temporariamente desatualizada. Quando um item do carrinho chega como `SOLD`, ele é retirado e o checkout é fechado. A decisão de elegibilidade e validação transacional do servidor permanecem existentes.

## Verificação automatizada

- 117 testes passaram em 14 arquivos: geometria/posicionamento, sincronização da query após confirmação simulada da venda, reversão, remoção do carrinho, seleção regular/irregular, pavilhões, segmentos, contratos públicos e renderer.
- A sequência de confirmação usa o hook real `useSalesCheckout` e React Query; apenas a resposta do serviço é simulada. Não foi criada uma venda real em produção.
- TypeScript: `npx tsc --noEmit -p tsconfig.app.json` passou.
- ESLint nos arquivos alterados: zero erros, dois avisos preexistentes de Fast Refresh nas funções exportadas pelo módulo de pavilhões.
- Build de produção passou. Avisos existentes de tamanho de chunks e Browserslist desatualizado.
- Suíte adicional do pipeline visual: 138/139 passaram. A falha de `commercialMapRegionalHighways.test.ts:232` espera `expandFramingBoundsWithRegionalHighways`, ausente também no HEAD de base. Não é regressão desta mudança.
- Antes da implementação, `commercialMapPresentation.test.ts` já apresentava duas falhas de histerese de rótulos (linhas 27 e 41); 31/33 testes da amostra inicial passaram.

## Cena real e limites da evidência

Harness: `scripts/commercial-map-performance/sold-locks.cjs`, rota DEV `__dev/commercial-map-rendering?persistedStage=1&soldLocksQa=1`. O evento de status existe apenas na página de diagnóstico, excluída do build de produção, e atualiza a query da fixture cadastral; não acessa nem altera o banco.

Ambiente: Windows, Chrome headless 153, Intel UHD via ANGLE/D3D11, WebGL2, DPR 1, qualidade HIGH; desktop 1440×900 e viewport estreito 390×844. Capturas usam o mapa 3D real e dados de referência, não o payload autenticado de produção. O viewport estreito não certifica iPhone/Safari, Android, multitouch, temperatura ou desempenho físico mobile.

As capturas e JSON nesta pasta registram mapa externo, vista superior estreita, Modo Vendas, filtros, pavilhão, apresentação pública e reversões. A comparação de draw calls é feita na mesma cena/câmera, alternando somente a visibilidade das malhas de cadeados. Tempos de rAF medem cadência local e não tempo de GPU nem latência de entrada. Não há alegação de aceleração de startup ou FPS universal.

Resultados da execução final:

- 264 cadeados externos simultâneos: 77 draw calls com marcadores versus 76 sem eles, no passe direto isolado; 48.048 triângulos adicionais. O desaparecimento da faixa antiga de status compensa uma chamada no caminho segmentado normal.
- Depois de aquecer ambos os status, seis ciclos `AVAILABLE → SOLD` mantiveram 468 geometrias, 135 texturas e 209 programas. Heap após GC: 155.530.110 → 154.873.852 bytes. A geometria do cadeado manteve a mesma identidade.
- Zero perdas de contexto espontâneas ou erros nos ciclos. Um Canvas, renderer e OrbitControls durante as atualizações.
- A amostra inicial de startup antes/depois manteve 811 chamadas, 131 texturas e 222 programas; geometrias 557 → 558 (o recurso compartilhado do cadeado). Tempos de startup DEV variaram por cache/compilação e não são comparação causal de carregamento.
- Pavilhão 3: 214 cadeados, reversão para zero e retorno a 214; capturas gerais e aproximadas verificam separação entre número e marcador.
- Cadência pública em sequência com/sem/com cadeados: mediana 16,7 ms em todos os casos; P95 17,4 / 17,0 / 17,0 ms, 119 amostras por intervalo. É uma amostra curta em desktop, não certificação mobile.
- Recuperação induzida com `WEBGL_lose_context`: retornou `ready/direct`, 264 cadeados, `lastErrorCode: null`, 572 frames apresentados e uma única criação de Canvas/renderer/controles. A contagem de perdas foi 1, exatamente a provocada pelo teste. Zero erros de página.

Para reproduzir em Windows:

```powershell
npm run dev -- --host 127.0.0.1 --port 5183
# Em outro terminal, com Playwright disponível:
$env:PLAYWRIGHT_MODULE = 'caminho/para/playwright'
$env:SOLD_PHASE = 'candidate'
node scripts/commercial-map-performance/sold-locks.cjs
```

## Pendências de homologação

Venda transacional real, link público com token de produção e aparelhos físicos iOS/Android continuam fora da evidência local. A PR não implica merge nem publicação em produção.
