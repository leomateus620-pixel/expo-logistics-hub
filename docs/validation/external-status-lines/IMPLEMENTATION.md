# Linhas de status dos lotes externos

Base conferida: `main`, `1fd60a8378db2f234573a917ab171371c9f262f5`, em 01/11/2026. Branch de implementação: `codex/external-lot-status-lines`.

## Solução escolhida

O padrão procedural é composto no shader da superfície que já existe em `BatchedLots`. Os triângulos superiores do polígono cadastral são a máscara: não há retângulo auxiliar, linha individual, textura por lote, novo mesh, recorte por frame ou segundo renderizador. Furos e concavidades continuam sendo os da triangulação original. Apenas normais apontando para cima (`normal.y >= .999`) recebem o padrão; fundo, chanfro e laterais ficam excluídos.

`externalLotStatus` é um atributo vec2 independente de `exporuralTurf`: fase 0/1/2 e intensidade normal/atenuada. SALE_OPEN recebe 1 (amarelo); SOLD recebe 2 (azul); todos os demais estados recebem 0. O valor rural legado 2 conserva seu significado anterior. A elegibilidade reutiliza `isExternalPresentationLot`, incluindo a exceção cadastral rural que não concede permissão de venda. Uma geometria inválida ou sem derivação segura omite as linhas e a moldura, com motivo no diagnóstico, sem alterar a seleção ou os dados.

O atributo geométrico `externalLotPitch` usa a largura útil já derivada pelo recuo seguro, com limite superior para distribuir linhas também em parcelas grandes. Em parcelas muito estreitas o intervalo continua proporcional à largura. A orientação diagonal e a fase ficam no plano x/z mundial; o cálculo inclui `batchingMatrix`. Hover, seleção e carrinho movem a superfície inteira pelo lift existente, sem deslocar a fase em x/z. A borda mantém seu offset `top + .018`, acima da margem rural que chega a `top + .014`. As linhas ficam na própria face superior, sob essa estreita margem gramada; não há superfície coplanar adicional nem novo risco de z-fighting.

A filtragem integra analiticamente a área ocupada pelo traço no footprint do pixel, com derivadas calculadas antes do ramo de estado. Quando o intervalo deixa de ser resolvível, a cobertura converge suavemente para sua média cromática contida no lote. Não há desligamento das linhas à distância nem alargamento da área projetada. O DPR só informa a calibração de espessura em CSS; esta mudança não altera a política de DPR da navegação.

A proporção de traço fica entre 25% e 29% por intervalo. A moldura existente ocupa uma parte adicional da área; as faixas verdes maiores preservam a leitura do gramado. A meta de 1,5–3 px é guia de calibração: nas aproximações grandes registradas existem traços e bordas de aproximadamente 6–8 px. No limite subpixel, não se afirma visibilidade de linhas individuais; o resultado é uma presença cromática média. Os limites observados estão também no relatório visual.

As cores das linhas são compostas depois do tone mapping da superfície e antes da conversão de saída/fog. Somente o status tem cor estável sem iluminação; a grama mantém luz, sombra e detalhe anteriores. As bordas e confirmações externas usam Basic com `toneMapped=false`, mantendo depthTest. Copas, veículos, telhados e outros objetos continuam ocluindo os elementos de status. Sem bloom, luz por lote ou passe adicional.

## Ciclo de dados, interação e público

A geometria e o pitch são preparados uma vez por geometria imutável. Trocar estado atualiza somente o intervalo correspondente do atributo agrupado, incluindo a dica DynamicDrawUsage no buffer do BatchedMesh. O Float32 da intensidade é comparado no mesmo formato para evitar uploads repetidos em hover/filtros estáveis. Os programas Basic e Standard compartilham variantes por material, preservando `onBeforeCompile`, `customProgramCacheKey` e os hooks de ParkSurface; DPR e qualidade atualizam uniforms sem recompilação por lote/status.

Filtros atenuam o padrão, preservando intensidade plena no lote selecionado, assim como a borda. Infraestrutura zera a máscara e oculta os acessórios. Ocultar a camada também desmonta/oculta seus elementos. As linhas não criam alvo de raycast; seleção, inspeção, tooltip e carrinho usam o batch original.

O selo tem base azul e check branco de traço robusto, no mesmo footprint e círculo de folga existente. Logo e confirmação preservam a disposição separada. SALE_OPEN não ganha check. Os cadeados e materiais dos demais consumidores, incluindo pavilhões, permanecem inalterados. `STATUS_CONFIG` não foi modificado.

O público continua usando apenas o estado permitido pelo contrato existente: onde SALE_OPEN e SOLD são normalizados como SOLD, o tema usa esse dado permitido e conserva o check externo oculto. Não se infere assinatura a partir de comprador, pagamento, contrato ou logo. Não há leitura extra de banco, migração, coluna de cor, escrita comercial, localStorage de status ou mudança em `scheduleCommercialMapRefresh`/`useCommercialMapRevision`.

## Arquivos de produção e testes

| Arquivo relativo a `src/features/commercial-map` | Alteração |
| --- | --- |
| `utils/externalLotStatus.ts` | Atributos de fase, intensidade e pitch; atualização incremental |
| `components/canvas/exporuralTurfMaterial.ts` | Composição de linhas no shader e filtragem analítica |
| `components/canvas/CommercialMapCanvas.tsx` | Integração no batch, filtro, infraestrutura e DPR |
| `utils/externalLotPresentation.ts` | Paleta externa saturada |
| `components/canvas/ExternalLotFrames.tsx` | Cor de borda estável sem iluminação |
| `utils/soldCheckGeometry.ts`, `components/canvas/SoldLotLocks.tsx` | Check externo branco robusto/base azul, mantendo cadeados |
| `utils/externalLotPresentationDiagnostics.ts` | Inventário independente dos três segmentos versus máscara/batch observados |
| `components/panels/ContextualMapLegend.tsx`, `components/panels/contextual-map-legend.css`, `public/public-map.css` | Amostras externas com diagonais |

Testes modificados: `externalLotFrameGeometry.test.ts`, `externalLotRendering.test.tsx`, `externalLotPresentationDiagnostics.test.ts`, `exporuralPresentationCoverage.test.ts`. Novo: `externalLotStatusMaterial.test.ts`, também incluído no workflow `commercial-map-spatial.yml`. Os scripts em `scripts/external-status-lines` são exclusivamente QA local e não entram no build normal.

## Verificação de código

`npm install`, `npm run typecheck` e `npm run build` foram executados. O ambiente não tinha npm no PATH; npm 10.9.4 foi disponibilizado em `/tmp`, usando o runtime Node v24.22.1. A instalação não deixou alterações no lockfile. O build conserva os avisos prévios de tamanho de chunks e base Browserslist antiga.

`npm test` completo: 4.152 passaram e 91 falharam (4.243 testes). Na cópia imutável do commit original: 4.132 passaram e 99 falharam (4.231 testes). A comparação por arquivo e nome completo não encontrou falhas novas: os mesmos 91 testes falham no baseline. As oito falhas exclusivas do baseline são variação de execução/ambiente e não são atribuídas a correções desta PR. Depois dos últimos ajustes, a rodada dirigida executou 78 testes em nove arquivos, todos aprovados. [checks.json](checks.json) registra arquivos, comandos e falhas comparadas.

`npm run dev -- --host 127.0.0.1 --port 8080` foi executado e `/login/mapa-comercial` respondeu HTTP 200. O scanner de dependências em dev reportou o placeholder preexistente `__QA_ENTRY__` de `scripts/dashboard/presentation-qa.html`; os builds de produção normal e de QA concluíram. As evidências de cena usam os renderizadores reais em builds de produção isolados e dados locais controlados, sem sessão comercial de produção.

Comparações, inventário, desempenho, reprodução e limitações de ambiente: [README.md](README.md).
