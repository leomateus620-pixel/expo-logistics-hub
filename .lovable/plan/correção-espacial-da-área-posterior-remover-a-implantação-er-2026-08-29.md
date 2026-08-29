# Correção espacial da área posterior: remover a implantação errada e refazer BR-472, Rua Brasília e Portão 5

## O que foi verificado no código atual

- A camada nova é 100% de apresentação e vive em 5 arquivos: `data/rearParkRoadNetwork.ts`, `data/rearParkEnvironment.ts`, `utils/rearRoadNetwork.ts`, `components/canvas/RearParkRoadNetwork.tsx`, `components/canvas/RearParkEnvironmentLayer.tsx`, montados em `CommercialMapCanvas.tsx`. Remover/reescrever esses arquivos não toca em lote, métrica, RLS, seleção ou labels.
- Âncoras oficiais confirmadas em `officialReference2026.ts`:
  - `C1` Centro de Eventos Fenasoja `[4020, 3180, 4490, 3435]`
  - `F` Arena Sicredi - Icatu `[4900, 2690, 5385, 3130]`
  - `RUA-BRASILIA` `[3940, 2440, 3988, 4210]` (via única, termina em y=4210)
  - Etnias: `C5 [4686,4422]`, `C6 [5178,4425]`, `C7 [5178,4764]`, `C8 [4657,4758]`, mais os espaços Russo/Árabe/Português (y 4430–5050)
  - `RODOVIA-RS-472` na borda leste do recorte
- Confirmação do erro: a rede atual contém `RUA-POSTERIOR-ETNIAS` (eixo de [4058,4470] a [6010,5230]) e `RUA-ETNIAS-TRANSVERSAL` (entre C5 e C6), ou seja, vias inventadas cruzando e contornando exatamente a faixa das Etnias — é o que os anexos 1 e 2 mostram como errado. `ACESSO-ALCA-LESTE`, `RS-472-CONTINUACAO`, `RUA-RETAGUARDA-ARENA` e `RUA-CIRCULACAO-LOTES` também não têm comprovação nos anexos 3 e 4.
- Não existe hoje nenhuma entidade "Portão 5" no projeto (só Portões 1, 2, 3, 4 e 10 em `parkAccessSpatialPlan.ts`). Ele será criado do zero.

## Etapa 1 — Remoção integral (antes de qualquer reconstrução)

- Zerar `REAR_PARK_ROAD_NETWORK`: excluir `RUA-POSTERIOR-ETNIAS`, `RUA-ETNIAS-TRANSVERSAL`, `ACESSO-ALCA-LESTE`, `RUA-RETAGUARDA-ARENA`, `RUA-CIRCULACAO-LOTES`, `RS-472-CONTINUACAO` e o traçado atual da `BR-472`/`ACESSO-BR-472`.
- Zerar `data/rearParkEnvironment.ts`: remover todos os terrenos estendidos, clusters de vegetação, blocos de contexto e postes posicionados a partir daquela malha (nada é reaproveitado por "ajuste fino").
- Nenhuma geometria oficial é tocada: Exporural, Etnias, Arena, Centro de Eventos e lotes permanecem exatamente onde estão. A lista `PROTECTED_ROAD_IDENTIFIERS` é mantida e passa a ser verificada por asserção de hash no teste.

## Etapa 2 — Calibração espacial por marcos (etapa temporária)

Antes de gerar superfícies, um utilitário de calibração (`utils/rearSpatialCalibration.ts`) resolve escala/rotação/translação entre os anexos 3 e 4 e o plano local, usando cinco pontos fixos: Arena Shows, Centro de Eventos, campo de futebol, conjunto das Etnias e borda da Exporural. Os eixos das vias são traçados nesse referencial, conferidos nas duas orientações, e só depois convertidos em pontos PDF definitivos. Nenhum plano auxiliar, linha de debug ou textura de satélite fica na versão final — a calibração é dado numérico, não objeto de cena.

Toda referência espacial é por marco (a montante/jusante da Arena, lateral do Centro de Eventos), nunca por lado da tela.

## Etapa 3 — Rua Brasília: eixo único, Portão 5 → BR-472

Uma única continuação (`RUA-BRASILIA-CONTINUACAO`), mesma largura e material da via oficial, emendada exatamente em `[3964, 4205]`, sem pista paralela e sem duplicata. Sequência obrigatória:

```text
Portão 5 → lateral do Centro de Eventos (C1) → Rua Brasília → setor lateral da Arena (F) → acesso à BR-472
```

Nenhum ramo passa atrás das Etnias. Qualquer alça ou retorno só entra se estiver visível nos anexos 3 e 4.

## Etapa 4 — Portão 5

Novo elemento em `data/rearParkGate5.ts` + render junto à camada viária, posicionado no ponto onde a Rua Brasília termina dentro do parque, junto à lateral do Centro de Eventos:

- vão veicular proporcional a saída de expositores e visitantes;
- pavimento contínuo com a Rua Brasília (mesma cota, sem degrau nem corte);
- apron de transição interno/externo;
- guarita discreta, sinalização e cancela simples;
- é parte da circulação viária, não um objeto decorativo isolado.

## Etapa 5 — BR-472 no local correto

Reposicionada conforme os anexos 3 e 4: rodovia contínua, mais larga que a Rua Brasília, com curvatura longitudinal real, acostamentos, faixa central e faixas de bordo discretas, valetas, taludes e vegetação de margem, saindo do recorte com continuidade visual. Não atravessa as Etnias, não entra no parque e não fica sobre plataforma retangular — o pavimento acompanha o terreno com transição irregular asfalto → acostamento → brita/solo → grama.

Hierarquia de largura: BR-472 > acesso ao parque > Rua Brasília > vias internas. Larguras derivadas da comparação com Arena, Centro de Eventos e a própria rodovia, nunca da espessura das linhas amarelas do satélite.

## Etapa 6 — Ambientação refeita

Distribuição fiel aos anexos: mata densa só onde o satélite mostra mata, áreas abertas preservadas abertas, vegetação baixa nas margens, gramado com variação sutil, solo aparente nas transições, taludes suaves, continuidade do campo de futebol e do entorno da Arena, contexto externo simplificado além da BR-472. Árvores com variação de escala, rotação e tom; zonas de exclusão impedem vegetação sobre asfalto, acostamento, Portão 5, Etnias, Exporural e estruturas oficiais. Postes e sinalização apenas nas vias internas e no portão.

## Etapa 7 — Materiais e performance

- Perfis procedurais em `openGroundTextures.ts`: asfalto rodoviário (com relevo/roughness), asfalto interno mais simples, acostamento, brita, solo, grama sem tiling aparente; marcação fina e envelhecida, coplanar.
- Geometrias consolidadas por material, `InstancedMesh` para árvores/postes, LOD em vegetação e contexto, materiais reutilizados, sem sombras dinâmicas novas, sem recriação por frame, descarte correto no unmount, orçamento explícito de draw calls e triângulos verificado em teste.

## Etapa 8 — Validação

- Testes: `commercialMapRearRoadNetwork.test.ts` reescrito (Rua Brasília única e contínua, sequência Portão 5 → BR-472, ausência de qualquer eixo dentro do polígono das Etnias, imutabilidade da Exporural, exclusões, orçamento gráfico) + suíte existente sem regressão + `tsgo`.
- Playwright no app real, três capturas: (1) visão geral com Portão 5, Rua Brasília e BR-472; (2) aproximação da lateral do Centro de Eventos; (3) vista posterior mostrando Arena e Etnias sem as ruas incorretas. Conferência de alinhamento com sobreposição temporária do traçado, removida antes da entrega. Desktop e mobile, com órbita/zoom/pan e seleção de lotes funcionando e console limpo.

## Detalhes técnicos

- Reescrita de `data/rearParkRoadNetwork.ts` (grafo editável: id, categoria, pontos, largura, elevação, material, acostamento, conexões, área protegida associada) e de `data/rearParkEnvironment.ts`.
- Novos: `utils/rearSpatialCalibration.ts`, `data/rearParkGate5.ts`, componente do Portão 5.
- Ajustes em `utils/rearRoadNetwork.ts` (interseções com raio de conversão, transição de bordas) e nos dois componentes de canvas; `CommercialMapCanvas.tsx` apenas monta as camadas.
- Revisão versionada da camada elevada para `2026.9-area-posterior.2`.
