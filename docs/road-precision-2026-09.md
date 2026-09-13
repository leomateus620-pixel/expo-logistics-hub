# Correção cartográfica das vias — 13/09/2026

Base: `524f446a`, branch `codex/precision-arena-roads`.

## Referências e calibração

1. **B4ADAF75…jpeg e 34907AD9…jpeg**: referências fornecidas de satélite, prioridade para topologia e relações espaciais. O primeiro anexo marca eixos; o segundo destaca bordas. A espessura do verde não foi usada como largura da pista.
2. **IMG_0712 e IMG_0713**: implantação anterior, apenas para comparação.
3. **8c220286…jpeg**: determinação explícita de retirada da ligação A7–Rua Johan Muller. O eixo perpendicular permanece.
4. Verificação independente: API atual do OpenStreetMap, vias [571136681](https://www.openstreetmap.org/way/571136681) e [571136682](https://www.openstreetmap.org/way/571136682). Os retornos integrais estão em `validation/road-precision/osm-brasil-*.json`, com atribuição OSM/ODbL. Confirmam o nome **Rua Brasil**. A consulta de exportação World Imagery não retornou imagem utilizável; não foi tratada como confirmação de satélite recente.
5. Recorte adicional do usuário do **entroncamento abaixo do Portão 5**, `codex-clipboard-989db324…png`: incluído na mesma intervenção. A consulta atual das vias [569781511](https://www.openstreetmap.org/way/569781511), [569781512](https://www.openstreetmap.org/way/569781512) e [951983188](https://www.openstreetmap.org/way/951983188) confirma os nós 5479124532 e 5479124534. Respostas completas em `osm-access-*.json`.

Os marcos mantidos são F/Arena `[4900,2690,5385,3130]`, C6/Italiana `[5119,4367,5237,4483]`, o arranque da faixa da Expo Rural `[5987,2000]`, a passagem A5 `[5940,3678]`, o cadastro A5 `[5974,3678]` e A7 `[3267,1703]`. Coordenadas são pontos da planta oficial; transformação isotrópica existente, 6,875 pontos por metro nominal. Nenhuma estrutura foi transladada, girada ou redimensionada.

O registro visual do anexo 2 considerou os centros aproximados da Arena `(224,285)` e da estrutura italiana `(596,952)`, o trecho norte `(609,65)` e a aproximação à BR `(1100,480)`. Um ajuste afim desses quatro marcos serviu **somente como estimativa inicial**: os resíduos de 107–205 pontos da planta mostram que a planta/arquitetura existente e a imagem oblíqua não permitem um encaixe global de precisão métrica. A geometria final usa o frame da planta, os limites fixos das estruturas, a posição relativa das entradas e a continuidade das vias. Não é levantamento topográfico nem se declara correspondência pixel a pixel entre edifícios cuja representação já difere da fotografia.

## Auditoria das fontes

| Elemento | Fonte executável | Geometria / responsabilidade |
|---|---|---|
| Frente das Etnias / Av. dos Imigrantes | `officialReference2026.ts` | Polígono cadastral extrudado por `RoadInfrastructure`; mesmo ID |
| Etnias–Brasil, Brasil e aproximação Expo Rural/Ubiretama | `arenaRoadCorrection.ts`, `annexSpatialCorrections.ts`, `rearSpatialCalibration.ts`, `rearParkRoadNetwork.ts` | Controles no frame oficial; Catmull–Rom centrípeta; larguras independentes dos controles |
| Rede visível consolidada / BR-472 | `territorialRoadGeometry.ts`, `territorialRoads.ts`, `territoryRoadSource.json`, `RegionalHighwayNetwork.tsx` | Polilinhas OSM externas; curvas internas; união booleana e triangulação planar, UVs em coordenadas locais |
| Estacionamentos junto à Arena | `rearParking.ts`, `arenaParkingGeometry.ts`, `CommercialMapCanvas.tsx` | Fonte original preservada; diferença booleana contra as pistas; peças, ilhas e bordas derivadas do mesmo contorno |
| Via inexistente no Portão 7 | `parkAccessSpatialPlan.ts` | `gate-7-johan-muller-link`, proprietário dos seus polígonos, meios-fios e referências de conexão |
| Vegetação / postes | `rearRoadTreeClearance.ts`, `ArenaFrontInfrastructure.tsx`, `electricalInfrastructure.ts` | Ajustes de apresentação por conflito com as novas faixas; inventários e conexões elétricas preservados |

`RearParkRoadNetwork.tsx` não está montado na cena atual. O grafo histórico da BR curta e das rampas antigas permanece como registro anterior, excluído de superfícies, picking, terreno e do overlay ativo. Nenhuma segunda malha viária foi adicionada à cena.

## Alterações delimitadas

- Frente das Etnias: término de x=5510 para x=5290, junto à C6. Entrada do conector em `[5120,4200]`. A aplicação da mesma limitação a snapshots persistidos antigos preserva todos os IDs.
- Conector: curva independente até `[5410,3503]`; retirados os desvios que imitavam conflitos de postes do modelo antigo.
- Ubiretama: aproximação com inflexão ao lado da Arena e encontro em `[5480,3524]`. O nó avança 109 pontos da planta (~15,9 m nominais) e desloca-se 380 pontos (~55,3 m nominais) na direção da Arena. Os dois acessos encontram o eixo principal com separação de ~10,6 m, preservando o pequeno desencontro visível no anexo 2.
- Larguras: mantidas em 36 pontos (~5,24 m) para as conexões e 32 pontos (~4,65 m) para a aproximação da Ubiretama. BR, acostamentos e demais vias mantêm suas definições.
- Superfícies: o piso do estacionamento a 0,06 cobria o asfalto a 0,034. O antigo contorno de nove pontos também fechava uma pequena dobra. A solução retira o contorno manual e recorta ambos os estacionamentos contra a união viária, incluindo as junções. UVs locais continuam entre peças; raycasts não atingem estacionamento sobre a pista. A boca da frente das Etnias não recebe meio-fio atravessado.
- BR-472: vias independentes com tampas retas deixavam cunhas nos encontros angulados. Fechamentos circulares locais, do próprio raio da pista, integram-se à união; intervenções restritas ao acesso da Arena e ao entroncamento da BR. Eixos, largura, posição das ilhas e caminhos externos preservados.
- Entroncamento A5 do recorte adicional: a importação havia perdido a via curta 951983188 e o primeiro vértice da 569781512. A conexão agora usa os mesmos nós OSM dos ramos existentes. O acesso manual da Arena termina nessa conexão, deixando de atravessar o centro do entroncamento. As ilhas, os ramos externos e o eixo da BR conservam os pontos originais. A malha usa uma única união; não se criou um remendo sobre asfalto antigo. Raycasts verificam 70% da largura útil, em amostras ao longo dos quatro trechos, com exatamente uma superfície de asfalto por posição.
- Portão 7: removidos o segmento A7–Johan Muller, controles, meios-fios derivados, âncora de encaixe exclusiva e metadados. As superfícies de terreno já existentes reaparecem. Mantidos A6–A7, A7–Gustavo Bessel e Rua Johan Muller a leste, além dos lotes Q-R-15 a Q-R-08.
- Seis postes de apresentação conflitantes são afastados até a margem mais próxima. Seus pontos cadastrais e fiação não mudam. As árvores decorativas da Arena só deixam de ser desenhadas quando suas copas invadem a nova pista; os 20 registros originais permanecem.

## Validação

As vistas foram capturadas executando o Commercial Map local, com a mesma câmera antes/depois. `validation/road-precision/comparison.html` reúne os cinco anexos, o recorte adicional A5 e as vistas corrigidas; `*-runtime.json` registra posições, saúde do renderer e medições. O modo `?rearRoadDebug` é carregado apenas em desenvolvimento e mostra vias ativas, controles, bordas e IDs.

O teste `commercialMapRoadPrecision.test.ts` compara os hashes completos das 1.691 entidades da base: apenas o polígono da via Av. dos Imigrantes pode mudar. Também protege definições externas, larguras, via perpendicular de A7, ausência de asfalto/picking na retirada, recortes do estacionamento, UVs, boca dos meios-fios e ausência de asfalto duplicado.

Resultados finais e limitações de execução: ver `validation/road-precision/verification.json`.

| Verificação final | Resultado |
|---|---|
| TypeScript (`-p tsconfig.app.json`) / ESLint dos arquivos alterados | Aprovados, lint sem avisos |
| Build de produção | Aprovado em 34,38 s; avisos já existentes sobre tamanho de chunks |
| Suíte completa, 2 workers, timeout de 30 s | 1.794 aprovados / 50 falhas; as mesmas 50 foram reproduzidas na base limpa `524f446a`, sem falhas novas |
| Preservação | 1.690 entidades completas idênticas; única alteração cadastral na frente Av. dos Imigrantes |
| Chrome desktop e celular emulado, incluindo paisagem | Busca, filtros, seleção do Q-R-15, pavilhão/interior, segmentos, rótulos, estacionamento, navegação, Canvas persistente e ausência de overflow aprovados |
| Dia / noite / hidrologia / amanhecer | 24 passos, incluindo 2 ciclos de aquecimento; nenhum crescimento posterior de geometrias, texturas ou programas |
| Estresse de hidrologia / qualidade | 40 ciclos / 80 transições; todos com `ready`, frames apresentados, zero perdas de contexto e nenhum código de erro |
| Comparador | 9 vistas, imagens carregadas e controle antes/depois conferidos no navegador |
| Overlay técnico | Conferido no mapa e ausente do bundle de produção |

No estresse de qualidade, quatro programas adicionais foram compilados no ciclo 5; os ciclos 5–20 permaneceram em 242/244 programas por configuração. Geometrias e texturas não cresceram. Isso é uma estabilização de variantes de shader; o relatório não apresenta essa compilação inicial como vazamento nem como crescimento zero desde o primeiro ciclo.

Com a mesma sequência original de oito câmeras, o ensaio estabilizado registrou **430 draw calls, 610 geometrias, 145 texturas e 204 programas** antes/depois. A cena passou de 720.341 para 720.407 triângulos desenhados (+66, cerca de 0,009%). As duas amostras finais médias foram 19,80 e 19,92 ms, frente a 20,66 e 20,59 ms na base. Não houve regressão observada nesse ensaio; não é uma estimativa causal de ganho de FPS. O novo close-up A5 é avaliado visualmente à parte, porque alterar a sequência de zoom altera o histórico de LOD. `performance-runtime.json` contém a sequência comparável; `performance-extra-closeup-runtime.json` conserva a observação com o close-up extra.

Tempos locais de primeira apresentação (aproximadamente 20–40 s em Vite) incluem estados de cache/aquecimento e cargas de trabalho diferentes; não são evidência de boot em produção nem da meta de cinco segundos. A primeira tentativa dos modos encontrou dependências Vite obsoletas após a cópia de comparação compartilhar `node_modules`; o servidor foi reiniciado com `--force` e os modos foram repetidos sem erros. Nenhum código do aplicativo foi alterado para contornar esse problema de ambiente.

Reprodução: `npx vite-node scripts/road-precision/audit.ts after`; `node scripts/road-precision/capture.cjs performance`; `node scripts/road-precision/functional.cjs --desktop http://127.0.0.1:4186/mapa-comercial` (ou `--mobile`); `node scripts/road-precision/modes.cjs`; `QA_URL=http://127.0.0.1:4186 node scripts/road-precision/stress.cjs` (ajustar atribuição da variável no PowerShell). Os scripts usam `PLAYWRIGHT_MODULE` quando Playwright vem do runtime instalado do Codex.

As execuções funcionais usam autenticação e dados de teste locais, sem escrita no backend. Não certificam a revisão publicada, dispositivos físicos ou Safari/iOS. O código desta base não contém modo de chuva; `dist-rain/`, que já estava fora do controle de versão, foi preservado. Os anexos atuais são a autoridade visual desta intervenção; referências e notas antigas do repositório não prevalecem sobre eles.
