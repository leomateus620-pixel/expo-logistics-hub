# Pavilhão 8 / B4 — atualização cirúrgica da planta Fenasoja 2028

## Objetivo
Alinhar exclusivamente a planta interna do Pavilhão 8 à fonte oficial 2028, corrigindo o eixo longitudinal da ilha central e a denominação documental, sem reconstruir a planta, reordenar módulos ou alterar estado comercial.

## 1. Diagnóstico confirmado

### Divergência geométrica
- A implementação atual usa frame métrico **21,70 × 35,40 m** e posiciona as duas colunas da ilha 38–89 entre **z=5,00 e z=31,00**, produzindo **2,00 m** entre a faixa 26–37 e a ilha e **4,40 m** até o limite inferior.
- O PDF prioritário registra uma cadeia longitudinal contínua e simétrica: **faixa superior 3,00 m + vão 3,00 m + ilha com 26 passos de 1,00 m + vão inferior 3,00 m = 35,00 m**.
- Portanto, o frame interno documentado será **21,70 × 35,00 m**. O valor **760,20 m²** continuará sendo o total oficial do carimbo e não será recalculado como largura × profundidade.
- A largura atual fecha corretamente e será preservada: **4,00 + 3,35 + 3,50 + 3,50 + 3,35 + 4,00 = 21,70 m**.

### Preservações confirmadas
- Inventário e ordem: **114 módulos**, IDs visuais `B4:module:001…114` e persistidos `B4-M001…B4-M114`.
- Áreas: 01–25 = 4,00; 26–37 = 3,00; 38–89 = 3,50; 90 = 24,50; 91–114 = 4,00; soma exata **438,50 m²**; área total **760,20 m²**.
- Módulo 90: polígono em L de seis vértices, duas partes de renderização e âncora própria; a conta **5,50 × 3,00 + 4,00 × 2,00 = 24,50 m²** coincide com o PDF e será mantida.
- Corredores laterais de **3,35 m**, cruzamentos laterais, cinco acessos, destinos B5/B3, áreas superiores de apoio e navegação `plan/locked-plan`, PAN, zoom limitado, sem rotação e módulos planos.
- O segmento persistente já é `industria-comercio-servicos`; ele é distinto do nome exibido e não será trocado.
- O banco atual contém 114 entidades/lotes B4, 438,50 m² e 114 preços ativos, todos sob a revisão antiga `2026.4-p8.1`; esses registros serão reconciliados, não recriados.

## 2. Alteração geométrica determinística

Usar um único projetor métrico **21,70 × 35,00 m**, sem offsets compensatórios:

```text
z=0,00   faixa 26–37 (profundidade 3,00 m)
z=3,00   circulação superior (profundidade 3,00 m)
z=6,00   início das duas colunas da ilha
          38–63: 26 módulos × 1,00 m
          64–89: 26 módulos × 1,00 m
z=32,00  fim da ilha / circulação inferior (3,00 m)
z=35,00  limite inferior e entradas
```

- Mover somente as duas runs centrais, de `top=5,00` para `top=6,00`, mantendo largura 3,50 m, profundidade 26,00 m, numeração e sentidos.
- Alterar `north-distribution` de 2,00 para **3,00 m** (`top=3,00`, fim em z=6,00).
- Alterar `south-entrance` para **top=32,00`, profundidade 3,00 m**, fechando o frame em z=35,00 e preservando os dois marcadores inferiores.
- Preservar as coordenadas métricas das laterais, seus vãos de 4,00 m e as larguras 3,35 m; a troca do denominador 35,40→35,00 reprojetará todos os elementos B4 de modo coerente, sem deslocamentos locais inventados.
- Manter o módulo 90 exatamente em `[0…5,50] × [0…5,00]`, incluindo `footprint`, `renderParts` e `labelAnchor`.
- Manter Sanitários, Cozinha e Apoio de serviço como espaços não comerciais `plan-traced`, com suas medidas métricas atuais ao norte do salão. A nova planta não fornece cotas suficientes para inventar subdivisões ou novas dimensões.
- Manter `rear-emergency-exit` no vão superior direito mostrado pelo PDF e os acessos laterais/inferiores; apenas recalcular suas projeções pelo novo frame. Qualquer mudança de âncora adicional ficará bloqueada sem cota documental explícita.

## 3. Fonte, nome e propagação

- Atualizar a fonte para **`Planta PAVILHÃO 8 - Fenasoja 2028.pdf`**, `referenceYear: 2028`, desenho **setembro/2026** e revisão dedicada **`2028.1-p8.2`**.
- Atualizar o nome/categoria exibidos para **“Pavilhão 8 — Indústria, Comércio e Serviços”** / **“Indústria, Comércio e Serviços”**.
- Preservar `publicIdentifier: B4`, `pavilionNumber: 8`, bloco `P8`, slug público `pavilhao-8` e segmento canônico `industria-comercio-servicos`.
- Fazer Mapa Comercial, Vendas, lista/ficha e consulta pública continuarem consumindo as mesmas entidades e lotes B4; não criar dataset, rota ou regra paralela.

## 4. Arquivos e símbolos previstos

### Fonte canônica e apresentação
- `src/features/commercial-map/data/pavilion8CommercialReference.ts`
  - `PROJECT`, `SOURCE_DOCUMENT`, `PAVILION8_COMMERCIAL_REFERENCE_PROJECTION`
  - runs `central-east-38-63` e `central-west-64-89`
  - corredores `north-distribution` e `south-entrance`
  - `PAVILION8_COMMERCIAL_REFERENCE` (`category`, `source.referenceYear`)
- `src/features/commercial-map/data/pavilionModuleOfficialAreas.ts`
  - somente a referência documental B4; faixas e valores permanecem iguais.
- `src/features/commercial-map/data/officialReference2026.ts`
  - nome da entidade B4 e entrada B4 de `pavilionModuleReferences` (`layoutRevision`, fonte); sem alterar `segmentId`.
- `src/features/commercial-map/utils/commercialPavilions.ts`
  - `COMMERCIAL_PAVILION_DEFINITIONS.B4.officialName` e `activity`; preservar rotações e navegação.

### Persistência
- Nova migration exclusiva B4, aplicada pelo fluxo de migrations do backend, sem modificar a migration histórica B4/B5.
- A migration usará lock próprio, inventário temporário de 114 células e snapshots antes das mutações; atualizará somente geometria/metadata/nome/fonte/revisão de B4.
- Como o frame muda, as 114 geometrias B4 serão reprojetadas no mesmo sistema; o trigger de bloqueio da camada será suspenso apenas durante essa atualização e reativado, enquanto o versionamento arquiva cada geometria anterior.
- Nenhum `INSERT` de lote e nenhuma alteração em IDs, `status`, `official_area_sqm`, `area_validation_status`, preços, reservas, negociações, vendas, contratos, histórico ou lineage.

### Testes
- Criar contrato dedicado `commercialMapPavilion8Official2028.test.ts` e retirar B4 das comparações com a migration histórica B4/B5, como já ocorre com pavilhões supersedidos por plantas 2028.
- Atualizar expectativas pontuais em:
  - `commercialMapPavilion8PlanPresentation.test.ts`
  - `commercialMapPavilionModules.test.ts`
  - `commercialMapPavilionOfficialContentFraming.test.ts`
  - `commercialMapPavilionWayfinding.test.ts`
  - `commercialMapPavilionLegend.test.tsx`
  - `pavilionModuleOfficialAreas.test.ts`
  - `publicCommercialMap.test.ts`, apenas para garantir `pavilhao-8 → B4` e seleção/ficha; URL e token não mudam.

## 5. Critérios de aceitação

- Totais exatos: **114 / 438,50 / 760,20**.
- Frame: **21,70 × 35,00 m**; eixo central fecha em **3,00 + 3,00 + 26,00 + 3,00**.
- Gaps medidos entre bordas: faixa 26–37 → ilha = **3,00 m**; ilha → limite inferior = **3,00 m**.
- Corredores laterais: **3,35 m** cada; cruzamentos e módulos laterais sem sobreposição.
- Módulo 90: área poligonal **24,50 m²**, seis vértices, duas render parts, âncora dentro do L e hit-test positivo apenas no polígono.
- Ordem visual intacta: 37→26; 89/38→64/63; laterais 01–25 e 91–114 sem renumeração.
- Fonte 2028 e nome com “Serviços” aparecem no mapa, legenda, ficha/lista e rota pública.
- `facingRadians=Math.PI`, `interiorViewRotationRadians=0`, `locked-plan`, PAN, sem rotate, `flatModules`, bounded pan/zoom permanecem idênticos.
- Banco pós-migração: os mesmos 114 IDs de entidade/lote, mesmos estados, preços e vínculos; novas versões geométricas arquivando as anteriores; revisão `2028.1-p8.2` somente em B4.
- Validar testes focados, verificação TypeScript e visual desktop/mobile: fit completo da cozinha e salão, números legíveis, PAN/zoom, cinco ícones visíveis e ficha pública abrindo pelo módulo selecionado.

## 6. Riscos e contenções

- **Mudança global involuntária pelo novo denominador:** limitar referência, migration e asserts a `B4`; comparar snapshots de IDs e estado comercial antes/depois.
- **Total 760,20 não igual ao retângulo 21,70 × 35,00:** tratar o total como valor oficial do carimbo, sem derivá-lo do frame de implantação interna.
- **Apoios superiores sem cotas completas:** manter como `plan-traced`; não promover medidas inferidas a oficiais.
- **Ícones deslococados ou ocultos:** testar os cinco marcadores contra o frame reprojetado e contra o envelope com apoios.
- **Regressão em Vendas/lista/ficha/público:** testar a resolução módulo visual → entidade persistida → lote e o escopo público exclusivo B4.
- **Regressão em outros pavilhões:** testes devem provar que B1/B2/B3/B5/B6/B8/B10, seus frames e orientações não mudaram.
- Nenhuma publicação em produção.
