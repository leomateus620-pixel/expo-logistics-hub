# Reconstrução da área posterior do parque — BR-472, Rua Brasília e entorno

## O que foi verificado no código

- O sistema de coordenadas é único: `officialPdfPointToLocal` mapeia o crop do PDF oficial (x 600–6100, y 900–5050) para o plano local de 120 × 90,55 unidades. Toda geometria nova usará essa mesma função — nada será posicionado "no olho".
- Âncoras existentes confirmadas: Arena Sicredi - Icatu = entidade `F` em `[4900, 2690, 5385, 3130]`; Casa da Etnia Polonesa `C5` em `[4686, 4422]`; Casa da Etnia Italiana `C6` em `[5178, 4425]`; Avenida dos Imigrantes `[3940, 4165, 5510, 4235]`.
- A malha viária oficial tem 21 entidades `ROAD` + 1 `PEDESTRIAN_PATH`, entre elas **uma única** `RUA-BRASILIA` (`[3940, 2440, 3988, 4210]`) e `RODOVIA-RS-472`, hoje uma faixa estreita colada na borda leste do crop — é exatamente o "termina abruptamente" dos anexos 3 e 4.
- As ruas da Exporural já são identificadas programaticamente por `EXPORURAL_ROAD_IDENTIFIERS`, são filhas de `EXPORURAL_AREA_CODE` e estão `VERIFIED`.
- A renderização viária é consolidada em `utils/roadInfrastructure.ts` (asfalto, emendas, sarjeta, meio-fio) com teto de 5 draw calls e < 5.000 triângulos, validado por `src/test/commercialMapRoadInfrastructure.test.ts`.
- Já existe o padrão de camada de apresentação (não comercial): `data/parkEnvironment.ts` + `data/arenaTerrain.ts` + `data/arenaSectorZoning.ts` + `ArenaFrontInfrastructure.tsx`, com árvores instanciadas (`commercialTrees.ts` / `CommercialTreeLayer`) e descarte via `disposeInstancedMesh`.

## Decisão de arquitetura

A nova região fica **fora do inventário comercial**: será uma camada de apresentação, como o setor da Arena. Assim nada entra em lotes, métricas, RLS, busca comercial ou edição de geometria — e nenhuma entidade oficial existente é tocada.

## O que será feito

### 1. Proteção da malha da Exporural
- Congelar programaticamente as vias e lotes da Exporural: uma lista imutável derivada de `EXPORURAL_ROAD_IDENTIFIERS` + um assert de integridade (hash das coordenadas) executado em teste.
- Nenhuma coordenada da Exporural é alterada. A ligação nova encosta na extremidade da Rua Brasília e é geometria independente.

### 2. Planta-base única a partir dos anexos 1 e 2
- Os dois satélites são o mesmo trecho por ângulos opostos; serão reconciliados numa única planta amarrada às âncoras acima (Arena, campo, lotes/estacionamentos, mata, Etnias Italiana e Polonesa, construções vizinhas).
- As linhas amarelas dos anexos são só delimitação de leitura — não viram geometria nem pintura.

### 3. Ampliação do terreno posterior
- Estender o terreno para além da borda leste/sudeste atual até depois da BR-472, com relevo suave e continuidade de cota com o terreno da Arena (reutilizando a amostragem de `arenaTerrain.ts` / `spatialSurface.ts`), sem costura visível com o parque.

### 4. Rede viária nova (dados centralizados)
Um único arquivo de dados descreve cada via com: id, categoria, pontos do eixo (spline), largura, material, tipo de acostamento, sinalização, elevação e conexões. Categorias:
- **BR-472** — maior largura, acostamento, faixa de bordo e eixo discretos, taludes e valetas laterais.
- **Acesso ao parque** — largura intermediária, entroncamento com a rodovia conforme os anexos.
- **Vias internas** — Rua Brasília em trajeto contínuo passando ao lado da Arena até o acesso à rodovia, transversal atrás/ao lado da Arena, circulação de lotes/estacionamentos, acessos à mata e às Etnias Italiana e Polonesa.

Regra da Rua Brasília: a entidade oficial permanece única; o trecho novo é a **continuação** do mesmo eixo, com mesma largura e material, emendado sem sobreposição. Qualquer alça ou retorno junto à rodovia só existe se estiver visível nos anexos e é modelado como via separada.

Geração: eixos por spline, largura por categoria, junções com raio real, borda/acostamento como faixa própria, elevação levemente acima do terreno para evitar z-fighting, transição asfalto → acostamento → solo → grama por material, não por linha colorida.

### 5. Ambientação
- Gramados com variação sutil de tom/roughness, faixas de vegetação entre parque e rodovia, mata densa onde os anexos mostram, arbustos de margem, solo aparente em taludes e acessos, valetas discretas, meios-fios só onde faz sentido, postes em quantidade controlada nas vias internas, guard-rail apenas onde a referência justifica.
- Contexto externo além da BR-472: construções simplificadas, talhões agrícolas e massas arbóreas, para a rodovia não ficar solta.
- Árvores com escala, rotação e tonalidade variadas, sem repetição evidente e sem invadir asfalto.

### 6. Materiais
- Asfalto rodoviário e asfalto interno com perfis distintos, acostamento próprio, brita/solo nas transições, grama sem tiling aparente. Texturas procedurais leves e repetíveis no mesmo padrão já validado em `openGroundTextures.ts` (mipmap, anisotropia, macro-variação), sem download externo.
- Marcação viária discreta e envelhecida, coplanar à pista.

### 7. Desempenho
- Geometrias consolidadas por categoria e material; instancing para árvores, postes e elementos repetidos; LOD para vegetação e construções externas; UV repetido em vez de textura grande; materiais compartilhados; sem sombras dinâmicas novas; qualidade reduzida no modo gráfico móvel; descarte correto de geometrias/texturas/materiais ao desmontar; nenhum objeto recriado por frame.
- Orçamento explícito de draw calls e triângulos para a nova camada, verificado em teste (nos moldes do teste viário atual).

### 8. Validação
- Testes: novo teste da rede viária posterior (continuidade, unicidade da Rua Brasília, ausência de cruzamento com estruturas, orçamento gráfico) + teste de integridade da Exporural; suíte existente sem regressão.
- Playwright no app real: vistas equivalentes aos anexos 1 e 2 (dois ângulos opostos), aproximação da rodovia e do entroncamento, desktop e mobile, órbita/pan/zoom, console limpo e seleção de lotes funcionando.

## Detalhes técnicos

- `data/rearParkRoadNetwork.ts` (novo): grafo viário editável (eixos em pontos PDF, largura, material, acostamento, sinalização, elevação, conexões) + revisão versionada.
- `data/rearParkEnvironment.ts` (novo): terreno estendido, massas vegetais, contexto externo e zonas de exclusão (a via não entra em lote, mata, campo, estacionamento nem Arena).
- `utils/rearRoadNetwork.ts` (novo): spline → superfície, acostamentos, junções, marcação, merge por material, diagnóstico de draw calls, `dispose*`.
- `components/canvas/RearParkRoadNetwork.tsx` e `RearParkEnvironmentLayer.tsx` (novos), montados em `CommercialMapCanvas.tsx` junto às demais camadas de apresentação.
- Extensão de `openGroundTextures.ts` com perfis de asfalto rodoviário, asfalto interno, acostamento, brita e solo.
- Ajuste apenas de enquadramento/limites de câmera para alcançar a nova área, preservando presets, filtros, labels, seleção e edição.
- Testes: `src/test/commercialMapRearRoadNetwork.test.ts` (novo) e guarda de imutabilidade da Exporural.
