# Metragens oficiais dos lotes externos (ICS, Espaço do Automóvel, faixa Q/V)

## Estado verificado agora no projeto e no banco

- Projeto cartográfico `0538d132-34dd-4347-a33c-526edac7339c` existe e está ativo.
- Nas 14 quadras do escopo (D, E, F, G, I, J, L, M, O, P, T, U, Q, V) há **167 lotes ativos** e **nenhum** deles tem área oficial preenchida (0 de 167).
- Contagem por quadra confere com o documento: D 12, E 13, F 8, G 6, I 16, J 16, L 16, M 16, O 14, P 14, Q 6, T 12, U 12, V 6.
- `Q-G-03` e `Q-G-04` **não existem** no banco; `B40` existe e está arquivado.
- Base total atual: **1.577 lotes** no parque (bate com o baseline do documento).
- No código: o gerador só atribui área a partir da referência Exporural (`officialAreaSqm = exporuralReference?.officialAreaSqm ?? null`); `gColumns` tem apenas 3 colunas e a contagem esperada de G é 6; `Q-G-03`/`Q-G-04` estão em `INDUSTRY_EXCLUDED_ENTITIES`; a nota de `QUADRA-G` ainda diz que B40 cobre a coluna; a rotina `sync_commercial_map_reference_2026` existe e não atualiza áreas de lotes já cadastrados.

Diagnóstico do documento confirmado ponto a ponto.

## O que será feito

### 1. Tabela documental oficial no código
Novo arquivo `src/features/commercial-map/data/externalLotOfficialAreas.ts` com as 169 referências (identificador, quadra, número, área em m² com duas casas, origem documental "A1 - Fenasoja - Parque - Lotes sem imagem.pdf, p.1"), mais subtotais por quadra e o total 33.733,77 m² como invariantes verificadas em teste.

### 2. Integração na geração da referência
Em `officialReference2026.ts`, a área passa a ser resolvida por precedência: Exporural primeiro (intocada), depois a tabela externa. Lotes externos correspondidos recebem `VALIDATED` de **área documental**, com `calculatedAreaSqm` permanecendo nulo e as flags de geometria (`cartographicAreaOnly`, `officialMeasurements`) coerentes — área oficial cadastral não vira alegação de geometria calibrada. Pavilhões e quadras fora do escopo seguem exatamente como estão.

### 3. Persistência dos 167 lotes existentes
Migration transacional e idempotente que atualiza **apenas** os 167 UUIDs listados, com revalidação em SQL antes de gravar: confere projeto, quadra, número, identificador público, classificação de lote vendável, entidade ativa e lote não arquivado. Qualquer linha que não bate é ignorada e reportada, não sobrescrita. Grava `official_area_sqm` (numérico, 2 casas), mantém `calculated_area_sqm` nulo, marca a validação cadastral e registra origem documental e valor anterior em metadados para reversão. Nenhum campo comercial, geometria, preço, reserva, contrato ou permissão é tocado. Reexecução não altera nada nem duplica.

### 4. G-03 e G-04
Antes de criar: verificação de ocupação ativa no espaço entre G-01/G-02 e G-05/G-06 (geometrias correntes sobrepostas, entidades não arquivadas). Sem conflito, cria-se exatamente duas entidades e dois lotes `Q-G-03`/`Q-G-04` com 168,00 m² cada, vinculados à quadra G e à ICS, usando a mesma transformação cartográfica das outras colunas de G (`gColumns` passa a ter a coluna de índice 1; contagem esperada de G vai a 8). Os seis lotes existentes de G não se movem. B40 continua arquivado e fora da renderização. Novos cadastros nascem bloqueados para comercialização, sem comprador e sem preço. As exclusões em `commercialMapSegments.ts` e a nota obsoleta de `QUADRA-G`/`unresolvedPrintedLots` são removidas, com o histórico da omissão preservado em metadados. Havendo conflito ativo, os 167 seguem e os dois ficam documentados como pendência.

### 5. Exibição
Reuso do que já existe: conversão em `commercialMapService.ts`, cache em `useCommercialMap.ts`, painel em `MapPanels.tsx`, editor em `LotEditDialog.tsx` e totais em `contextualMapSummary.ts`. Formato pt-BR (`255,71 m²`). Sem rótulos novos na cena 3D, sem consultas por frame, sem redesenho.

### 6. Validação e entrega
- Testes: unicidade da correspondência, precisão decimal, subtotais por quadra, total 33.733,77 m², escopo (nenhum registro de Exporural ou pavilhão tocado), idempotência.
- Atualizar `commercialMap2026Reference.test.ts` e `commercialMapSegments.test.ts` para incluir G-03/G-04 sem ressuscitar B40.
- Contagem antes/depois: 1.577 → 1.579 lotes apenas se os dois novos forem criados.
- Conferência dos casos de risco (Q-01 283,00; V-06 240,65; T/U-11 e 12 244,51; D-11 263,74; D-12 248,99; E-11/12/13; I-01/02; J-01/02/16).
- Evidência de persistência após recarga e de que nova execução não zera áreas nem duplica cadastros.
- Comparação antes/depois de Exporural (95 registros) e dos pavilhões, comprovando ausência de alteração.
- Nada é publicado.

## Detalhes técnicos

Arquivos: `data/externalLotOfficialAreas.ts` (novo), `data/officialReference2026.ts`, `data/commercialMapSegments.ts`, testes de inventário e segmentos, mais uma migration nova. `sync_commercial_map_reference_2026` não é usada como veículo da correção e nenhuma sincronização global é disparada; a integração garante que importações futuras não voltem a zerar as áreas externas nem alterem o comportamento de Exporural e pavilhões.
